-- Publishing is atomic and may replace confirmed history only through an
-- explicit, reasoned administrator override.

create or replace function public.guard_pairing_run_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and new.status = 'published'
     and (
       case
         when tg_op = 'INSERT' then true
         else new.status is distinct from old.status
       end
     )
     and coalesce(current_setting('app.publishing_pairing_run', true), '') <> '1' then
    raise exception 'Návrh párů zveřejněte funkcí publish_pairing_run.';
  end if;
  return new;
end;
$$;

create trigger pairing_runs_guard_publish
before insert or update on public.pairing_runs
for each row execute function public.guard_pairing_run_publish();

drop function public.publish_pairing_run(uuid);

create function public.publish_pairing_run(
  target_run_id uuid,
  allow_confirmed_override boolean default false,
  override_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_event_status public.event_status;
  v_has_actual boolean;
begin
  if not public.is_staff() then
    raise exception 'Páry může zveřejnit pouze vedení souboru.';
  end if;

  select pr.event_id, e.status
    into v_event_id, v_event_status
  from public.pairing_runs pr
  join public.events e on e.id = pr.event_id
  where pr.id = target_run_id
  for update of pr, e;

  if not found then
    raise exception 'Návrh párů neexistuje.';
  end if;
  if not exists (
    select 1 from public.event_pairs where pairing_run_id = target_run_id
  ) then
    raise exception 'Prázdný návrh párů nelze zveřejnit.';
  end if;

  select exists (
    select 1
    from public.event_pairs ep
    join public.pairing_runs pr on pr.id = ep.pairing_run_id
    where pr.event_id = v_event_id
      and ep.is_confirmed_actual
  ) into v_has_actual;

  if v_event_status = 'closed' and v_has_actual then
    if not allow_confirmed_override then
      raise exception 'Uzavřená událost už má potvrzené skutečné páry.';
    end if;
    if not public.is_admin() then
      raise exception 'Potvrzenou historii může přepsat pouze administrátor.';
    end if;
    if override_reason is null or length(btrim(override_reason)) < 5 then
      raise exception 'Přepsání potvrzené historie vyžaduje důvod.';
    end if;
  end if;

  perform set_config('app.publishing_pairing_run', '1', true);

  update public.pairing_runs
  set status = 'superseded',
      published_at = null
  where event_id = v_event_id
    and status = 'published'
    and id <> target_run_id;

  update public.pairing_runs
  set status = 'published',
      published_at = now(),
      note = case
        when v_event_status = 'closed' and v_has_actual
          then concat_ws(E'\n', note, 'Přepsání potvrzené historie: ' || btrim(override_reason))
        else note
      end
  where id = target_run_id;

  if v_event_status = 'closed' and v_has_actual then
    perform set_config('app.confirming_actual_pairs', '1', true);

    update public.event_pairs ep
    set is_confirmed_actual = (ep.pairing_run_id = target_run_id)
    from public.pairing_runs pr
    where ep.pairing_run_id = pr.id
      and pr.event_id = v_event_id
      and ep.is_confirmed_actual is distinct from (ep.pairing_run_id = target_run_id);

    perform set_config('app.confirming_actual_pairs', '', true);
  end if;

  perform set_config('app.publishing_pairing_run', '', true);
end;
$$;

revoke all on function public.publish_pairing_run(uuid, boolean, text) from public;
grant execute on function public.publish_pairing_run(uuid, boolean, text) to authenticated;
