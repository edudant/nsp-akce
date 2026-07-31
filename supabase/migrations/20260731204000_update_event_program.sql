-- Atomically replace an event program while preserving retained item IDs.
-- Published pairing assignments keep their referenced program immutable.

create or replace function public.update_event_program(
  target_event_id uuid,
  program_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_index integer;
  v_item jsonb;
  v_id_text text;
  v_catalog_text text;
  v_custom_name text;
  v_id uuid;
  v_catalog_id uuid;
  v_existing public.event_program_items%rowtype;
  v_catalog_active boolean;
  v_keep_ids uuid[] := '{}'::uuid[];
  v_seen_catalog_ids uuid[] := '{}'::uuid[];
  v_shift integer;
  v_blocked_name text;
  v_program_text text;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Program události může upravit pouze administrátor.';
  end if;
  if program_items is null or jsonb_typeof(program_items) <> 'array' then
    raise exception 'Program musí být předaný jako seřazený seznam.';
  end if;

  v_count := jsonb_array_length(program_items);
  if v_count > 100 then
    raise exception 'Program může obsahovat nejvýše 100 položek.';
  end if;

  -- publish_pairing_run locks this same event row. This serializes the safety
  -- check with publication without introducing a broader table lock.
  perform e.id
  from public.events e
  where e.id = target_event_id
  for update;
  if not found then
    raise exception 'Událost nebyla nalezena.';
  end if;

  perform epi.id
  from public.event_program_items epi
  where epi.event_id = target_event_id
  for update;

  if v_count > 0 then
    for v_index in 0..v_count - 1 loop
      v_item := program_items -> v_index;
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'Každá položka programu musí být objekt.';
      end if;

      v_id_text := nullif(btrim(coalesce(v_item ->> 'id', '')), '');
      v_catalog_text := nullif(
        btrim(coalesce(v_item ->> 'catalogId', '')),
        ''
      );
      v_custom_name := nullif(
        btrim(coalesce(v_item ->> 'customName', '')),
        ''
      );

      if (v_catalog_text is null) = (v_custom_name is null) then
        raise exception 'Položka musí odkazovat buď na katalog, nebo mít vlastní název.';
      end if;
      if v_custom_name is not null and length(v_custom_name) > 120 then
        raise exception 'Vlastní název pásma může mít nejvýše 120 znaků.';
      end if;

      v_id := null;
      if v_id_text is not null then
        begin
          v_id := v_id_text::uuid;
        exception when invalid_text_representation then
          raise exception 'Ponechaná položka programu má neplatný identifikátor.';
        end;
        if v_id = any(v_keep_ids) then
          raise exception 'Položka programu je v seznamu vícekrát.';
        end if;
      end if;

      v_catalog_id := null;
      if v_catalog_text is not null then
        begin
          v_catalog_id := v_catalog_text::uuid;
        exception when invalid_text_representation then
          raise exception 'Pásmo z katalogu má neplatný identifikátor.';
        end;
        select pc.is_active into v_catalog_active
        from public.program_catalog pc
        where pc.id = v_catalog_id;
        if not found then
          raise exception 'Vybrané pásmo už v katalogu neexistuje.';
        end if;
        if v_id is null and not v_catalog_active then
          raise exception 'Neaktivní pásmo nelze nově přidat do programu.';
        end if;
        if v_catalog_id = any(v_seen_catalog_ids) then
          raise exception 'Stejné katalogové pásmo nelze přidat vícekrát.';
        end if;
        v_seen_catalog_ids := array_append(v_seen_catalog_ids, v_catalog_id);
      end if;

      if v_id is null
         and v_catalog_id is not null
         and exists (
           select 1
           from public.event_program_items epi
           where epi.event_id = target_event_id
             and epi.catalog_program_id = v_catalog_id
         ) then
        raise exception 'Pásmo už je v programu; při změně pořadí musí být zachovaný jeho identifikátor.';
      end if;
      if v_id is null
         and v_custom_name is not null
         and exists (
           select 1
           from public.event_program_items epi
           where epi.event_id = target_event_id
             and epi.catalog_program_id is null
             and lower(btrim(epi.custom_name)) = lower(v_custom_name)
         ) then
        raise exception 'Vlastní pásmo už je v programu; při změně pořadí musí být zachovaný jeho identifikátor.';
      end if;

      if v_id is not null then
        select * into v_existing
        from public.event_program_items epi
        where epi.id = v_id
          and epi.event_id = target_event_id;
        if not found then
          raise exception 'Ponechaná položka nepatří upravované události.';
        end if;
        if v_existing.catalog_program_id is distinct from v_catalog_id
           or btrim(coalesce(v_existing.custom_name, '')) is distinct from
              coalesce(v_custom_name, '') then
          raise exception 'Ponechanou položku nelze změnit na jiné pásmo; odeberte ji a přidejte novou.';
        end if;
        v_keep_ids := array_append(v_keep_ids, v_id);
      end if;
    end loop;
  end if;

  select coalesce(pc.name, epi.custom_name, 'Pásmo')
    into v_blocked_name
  from public.event_program_items epi
  left join public.program_catalog pc on pc.id = epi.catalog_program_id
  where epi.event_id = target_event_id
    and not (epi.id = any(v_keep_ids))
    and exists (
      select 1
      from public.pairing_runs pr
      join public.pairing_blocks pb on pb.pairing_run_id = pr.id
      where pr.event_id = target_event_id
        and pr.status = 'published'
        and (
          pb.applies_to_all_program_items
          or exists (
            select 1
            from public.pairing_block_program_items bp
            where bp.pairing_block_id = pb.id
              and bp.event_program_item_id = epi.id
          )
        )
    )
  limit 1;
  if found then
    raise exception 'Pásmo „%“ nelze odebrat, protože je použité v publikovaném návrhu párů.', v_blocked_name;
  end if;

  -- Move existing positions above the current range first so arbitrary
  -- reordering cannot transiently violate unique(event_id, position).
  select coalesce(max(epi.position), 0) + v_count + 1
    into v_shift
  from public.event_program_items epi
  where epi.event_id = target_event_id;

  update public.event_program_items epi
  set position = epi.position + v_shift
  where epi.event_id = target_event_id;

  if v_count > 0 then
    for v_index in 0..v_count - 1 loop
      v_item := program_items -> v_index;
      v_id_text := nullif(btrim(coalesce(v_item ->> 'id', '')), '');
      v_catalog_text := nullif(
        btrim(coalesce(v_item ->> 'catalogId', '')),
        ''
      );
      v_custom_name := nullif(
        btrim(coalesce(v_item ->> 'customName', '')),
        ''
      );
      v_id := case when v_id_text is null then null else v_id_text::uuid end;
      v_catalog_id := case
        when v_catalog_text is null then null
        else v_catalog_text::uuid
      end;

      if v_id is not null then
        update public.event_program_items epi
        set position = v_index + 1
        where epi.id = v_id
          and epi.event_id = target_event_id;
      else
        insert into public.event_program_items (
          event_id,
          catalog_program_id,
          custom_name,
          position,
          created_by
        )
        values (
          target_event_id,
          v_catalog_id,
          v_custom_name,
          v_index + 1,
          auth.uid()
        )
        returning id into v_id;
        v_keep_ids := array_append(v_keep_ids, v_id);
      end if;
    end loop;
  end if;

  delete from public.event_program_items epi
  where epi.event_id = target_event_id
    and not (epi.id = any(v_keep_ids));

  select string_agg(
    coalesce(pc.name, epi.custom_name),
    ', '
    order by epi.position
  ) into v_program_text
  from public.event_program_items epi
  left join public.program_catalog pc on pc.id = epi.catalog_program_id
  where epi.event_id = target_event_id;

  update public.events e
  set program = nullif(v_program_text, '')
  where e.id = target_event_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', epi.id,
      'catalogId', epi.catalog_program_id,
      'customName', epi.custom_name,
      'name', coalesce(pc.name, epi.custom_name),
      'position', epi.position
    ) order by epi.position
  ), '[]'::jsonb)
  into v_result
  from public.event_program_items epi
  left join public.program_catalog pc on pc.id = epi.catalog_program_id
  where epi.event_id = target_event_id;

  return v_result;
end;
$$;

revoke all on function public.update_event_program(uuid, jsonb)
  from public, anon;
grant execute on function public.update_event_program(uuid, jsonb)
  to authenticated;
