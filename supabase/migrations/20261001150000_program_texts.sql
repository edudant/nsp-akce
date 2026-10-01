-- Texts are imported separately from private Word sources, never bundled publicly.
create table public.program_texts (
  program_id uuid primary key references public.program_catalog(id) on delete cascade,
  blocks jsonb not null,
  source text,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.program_texts enable row level security;
revoke all on public.program_texts from public, anon, authenticated;

create function public.valid_program_text_blocks(blocks jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare b jsonb;
begin
 if jsonb_typeof(blocks) is distinct from 'array' then return false; end if;
 if jsonb_array_length(blocks) not between 1 and 2000 then return false; end if;
 for b in select value from jsonb_array_elements(blocks) loop
  if jsonb_typeof(b) is distinct from 'object'
   or coalesce(b->>'kind','') not in ('heading','text','note','dialogue')
   or jsonb_typeof(b->'text') is distinct from 'string'
   or length(btrim(b->>'text')) not between 1 and 20000
   or (b ? 'notes' and (jsonb_typeof(b->'notes') is distinct from 'string' or length(b->>'notes')>20000))
   then return false; end if;
 end loop;
 return true;
end; $$;
alter table public.program_texts add constraint program_text_blocks_valid check(public.valid_program_text_blocks(blocks));

create function public.get_program_text(program_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_read_app_v3() then raise exception 'Přihlaste se pro zobrazení textů.' using errcode='42501'; end if;
 return (select jsonb_build_object('blocks',t.blocks,'source',t.source,'updatedAt',t.updated_at) from public.program_texts t where t.program_id=get_program_text.program_id);
end; $$;

create function public.save_program_text(program_id uuid, new_blocks jsonb, expected_updated_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare current_timestamp_value timestamptz;
begin
 perform public.require_admin_v3();
 if not public.valid_program_text_blocks(new_blocks) then raise exception 'Neplatný formát textů pásma.'; end if;
 -- Lock the parent even if the text does not exist yet.
 perform 1 from public.program_catalog p where p.id=program_id for update;
 if not found then raise exception 'Pásmo nebylo nalezeno.'; end if;
 select t.updated_at into current_timestamp_value from public.program_texts t where t.program_id=save_program_text.program_id;
 if current_timestamp_value is distinct from expected_updated_at then raise exception 'Text mezitím změnil jiný správce. Načtěte jej znovu.' using errcode='40001'; end if;
 insert into public.program_texts(program_id,blocks) values(program_id,new_blocks)
 on conflict on constraint program_texts_pkey do update set blocks=excluded.blocks,updated_at=clock_timestamp();
end; $$;

-- Import is atomic and does not overwrite existing edited texts.
create function public.import_program_texts(documents jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare d jsonb; target_id uuid;
begin
 perform public.require_admin_v3();
 if jsonb_typeof(documents) is distinct from 'array' then raise exception 'Neplatný import.'; end if;
 if jsonb_array_length(documents) not between 1 and 100 then raise exception 'Neplatný počet pásem.'; end if;
 for d in select value from jsonb_array_elements(documents) loop
  if jsonb_typeof(d->'name') is distinct from 'string' or length(btrim(d->>'name')) not between 1 and 120
   or not public.valid_program_text_blocks(d->'blocks')
   or (d ? 'source' and (jsonb_typeof(d->'source') is distinct from 'string' or length(d->>'source')>255)) then raise exception 'Neplatný dokument pásma.'; end if;
  select p.id into target_id from public.program_catalog p where lower(btrim(p.name))=lower(btrim(d->>'name')) for update;
  if target_id is null then raise exception 'Pásmo % není v katalogu.',d->>'name'; end if;
  if exists(select 1 from public.program_texts t where t.program_id=target_id) then raise exception 'Pásmo % již obsahuje text. Import nebyl uložen.',d->>'name'; end if;
  insert into public.program_texts(program_id,blocks,source) values(target_id,d->'blocks',d->>'source');
 end loop;
end; $$;
revoke all on function public.valid_program_text_blocks(jsonb),public.get_program_text(uuid),public.save_program_text(uuid,jsonb,timestamptz),public.import_program_texts(jsonb) from public,anon,authenticated;
grant execute on function public.get_program_text(uuid),public.save_program_text(uuid,jsonb,timestamptz),public.import_program_texts(jsonb) to authenticated;

insert into public.program_catalog(name,sort_order) values
 ('Bláhoviny',40),('Chodská svatba',30),('Kolečka',60),('Koledy',70),('Legrúcky',80),('Malé děti',90),
 ('Omladina 2024',100),('Postřekoviny',20),('Postřekovo',10),('Posvícení děti',110),('Posvícení',120),
 ('Prohůdky ha voračky',130),('Sousedský',140),('Strašidla',150),('Travničky',160),('Volání',170),
 ('Zednický',180),('Zelený kousky',50),('Ženský',190),('Židovka',200)
 on conflict (lower(btrim(name))) do nothing;
