-- A published pairing run is the sole source of actual pairs for a closed event.

create or replace function public.guard_actual_pair_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (
       new.is_confirmed_actual is distinct from
       (case when tg_op = 'INSERT' then false else old.is_confirmed_actual end)
     )
     and coalesce(current_setting('app.confirming_actual_pairs', true), '') <> '1' then
    raise exception 'Skutečné páry potvrďte atomickou funkcí confirm_actual_pairs.';
  end if;
  return new;
end;
$$;

create trigger event_pairs_guard_actual_state
before insert or update on public.event_pairs
for each row execute function public.guard_actual_pair_state();

create or replace function public.confirm_actual_pairs(target_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_run_status public.pairing_run_status;
  v_event_status public.event_status;
  v_count integer;
begin
  if not public.is_staff() then
    raise exception 'Skutečné páry může potvrdit pouze vedení souboru.';
  end if;

  select pr.event_id, pr.status
    into v_event_id, v_run_status
  from public.pairing_runs pr
  where pr.id = target_run_id
  for update;

  if not found then
    raise exception 'Návrh párů neexistuje.';
  end if;
  if v_run_status <> 'published' then
    raise exception 'Skutečné páry lze potvrdit pouze z aktuálně zveřejněného návrhu.';
  end if;

  select e.status into v_event_status
  from public.events e
  where e.id = v_event_id
  for update;

  if v_event_status <> 'closed' then
    raise exception 'Skutečné páry lze potvrdit až po uzavření události.';
  end if;
  if not exists (
    select 1 from public.event_pairs ep where ep.pairing_run_id = target_run_id
  ) then
    raise exception 'Prázdný návrh párů nelze potvrdit.';
  end if;

  perform set_config('app.confirming_actual_pairs', '1', true);

  update public.event_pairs ep
  set is_confirmed_actual = false
  from public.pairing_runs pr
  where ep.pairing_run_id = pr.id
    and pr.event_id = v_event_id
    and pr.id <> target_run_id
    and ep.is_confirmed_actual;

  update public.event_pairs
  set is_confirmed_actual = true
  where pairing_run_id = target_run_id;

  get diagnostics v_count = row_count;
  perform set_config('app.confirming_actual_pairs', '', true);
  return v_count;
end;
$$;

revoke all on function public.confirm_actual_pairs(uuid) from public;
grant execute on function public.confirm_actual_pairs(uuid) to authenticated;
