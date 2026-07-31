-- Keep private generator metadata and member wishes out of member/shared API
-- responses, and prevent shared-code readers from reconstructing attendance
-- histories one closed event at a time.

-- Serialize administrator removal. Without the transaction-scoped lock, two
-- concurrent demotions could both observe two administrators and remove both.
create or replace function public.guard_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin') then
    perform pg_advisory_xact_lock(
      hashtextextended('public.user_roles.last_admin', 0)
    );
    if (select count(*) from public.user_roles where role = 'admin') <= 1 then
      raise exception 'Nelze odebrat poslední administrátorskou roli.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.get_pairing_runs_for_app()
returns table (
  id uuid,
  event_id uuid,
  status public.pairing_run_status,
  generated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    return query
    select pr.id, pr.event_id, pr.status, pr.generated_at
    from public.pairing_runs pr
    order by pr.generated_at desc;
    return;
  end if;

  if public.current_member_id() is null then
    raise exception 'Návrhy párů jsou dostupné pouze přihlášeným členům.';
  end if;

  return query
  select pr.id, pr.event_id, pr.status, pr.generated_at
  from public.pairing_runs pr
  join public.events e on e.id = pr.event_id
  where pr.status = 'published'
    and e.status <> 'draft'
    and e.visibility in ('public', 'members', 'shared')
  order by pr.generated_at desc;
end;
$$;

create or replace function public.get_event_pairs_for_app()
returns table (
  id uuid,
  pairing_run_id uuid,
  pairing_block_id uuid,
  round_number integer,
  member_a_id uuid,
  member_b_id uuid,
  is_locked boolean,
  is_confirmed_actual boolean,
  explanation text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    return query
    select
      ep.id,
      ep.pairing_run_id,
      ep.pairing_block_id,
      ep.round_number,
      ep.member_a_id,
      ep.member_b_id,
      ep.is_locked,
      ep.is_confirmed_actual,
      ep.explanation
    from public.event_pairs ep;
    return;
  end if;

  if public.current_member_id() is null then
    raise exception 'Páry jsou dostupné pouze přihlášeným členům.';
  end if;

  return query
  select
    ep.id,
    ep.pairing_run_id,
    ep.pairing_block_id,
    ep.round_number,
    ep.member_a_id,
    ep.member_b_id,
    ep.is_locked,
    ep.is_confirmed_actual,
    'Zveřejněný taneční pár.'::text
  from public.event_pairs ep
  join public.pairing_runs pr on pr.id = ep.pairing_run_id
  join public.events e on e.id = pr.event_id
  where pr.status = 'published'
    and e.status <> 'draft'
    and e.visibility in ('public', 'members', 'shared');
end;
$$;

-- RLS limits rows, but it cannot hide selected columns from two users sharing
-- the Postgres `authenticated` role. Keep only the non-sensitive columns
-- directly selectable; administrators receive the full explanation through
-- the checked RPC above.
revoke select on public.pairing_runs from authenticated;
grant select (id, event_id, status, generated_at)
  on public.pairing_runs to authenticated;

revoke select on public.event_pairs from authenticated;
grant select (
  id,
  pairing_run_id,
  pairing_block_id,
  round_number,
  member_a_id,
  member_b_id,
  is_locked,
  is_confirmed_actual
) on public.event_pairs to authenticated;

-- This invoker view exposes aggregate history from the base tables. Pairing
-- scoring uses it from a SECURITY DEFINER function, so clients need no direct
-- grant.
revoke all on public.pair_history from authenticated;

-- Preserve the RPC during a compatible rollout, but return no person-level
-- rows. Old frontend versions therefore stay functional without leaking data.
create or replace function public.get_shared_event_attendance(target_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.has_active_shared_session() then
    raise exception 'Sdílená relace není platná nebo vypršela.';
  end if;
  if not exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and e.visibility in ('public', 'shared')
      and e.status = 'closed'
  ) then
    raise exception 'Docházka této události není ve sdíleném náhledu dostupná.';
  end if;

  update public.shared_access_sessions
  set last_seen_at = now()
  where user_id = auth.uid();

  return '[]'::jsonb;
end;
$$;

-- Shared pair rows contain only public assignments and a deliberately neutral
-- explanation. Private wish/preference reasoning stays administrator-only.
create or replace function public.get_shared_event_pairs(target_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_event_status public.event_status;
begin
  if not public.has_active_shared_session() then
    raise exception 'Sdílená relace není platná nebo vypršela.';
  end if;

  select e.status into v_event_status
  from public.events e
  where e.id = target_event_id
    and e.visibility in ('public', 'shared')
    and e.status <> 'draft';

  if not found then
    raise exception 'Páry této události nejsou ve sdíleném náhledu dostupné.';
  end if;

  update public.shared_access_sessions
  set last_seen_at = now()
  where user_id = auth.uid();

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'pairId', ep.id,
      'roundNumber', ep.round_number,
      'pairingBlockId', pb.id,
      'blockName', coalesce(pb.name, 'Kolo ' || ep.round_number),
      'memberAId', ep.member_a_id,
      'memberAName', ma.display_name,
      'memberBId', ep.member_b_id,
      'memberBName', mb.display_name,
      'explanation', 'Zveřejněný taneční pár.',
      'programs', case
        when pb.id is null then '[]'::jsonb
        when pb.applies_to_all_program_items then coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', epi.id,
              'name', coalesce(pc.name, epi.custom_name),
              'position', epi.position
            ) order by epi.position
          )
          from public.event_program_items epi
          left join public.program_catalog pc on pc.id = epi.catalog_program_id
          where epi.event_id = target_event_id
        ), '[]'::jsonb)
        else coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', epi.id,
              'name', coalesce(pc.name, epi.custom_name),
              'position', epi.position
            ) order by epi.position
          )
          from public.pairing_block_program_items bp
          join public.event_program_items epi
            on epi.id = bp.event_program_item_id
          left join public.program_catalog pc on pc.id = epi.catalog_program_id
          where bp.pairing_block_id = pb.id
        ), '[]'::jsonb)
      end
    ) order by ep.round_number, ma.display_name, mb.display_name
  ), '[]'::jsonb)
  into v_result
  from public.event_pairs ep
  join public.pairing_runs pr on pr.id = ep.pairing_run_id
  join public.members ma on ma.id = ep.member_a_id
  join public.members mb on mb.id = ep.member_b_id
  left join public.pairing_blocks pb on pb.id = ep.pairing_block_id
  where pr.event_id = target_event_id
    and (
      (v_event_status = 'closed' and ep.is_confirmed_actual)
      or (v_event_status <> 'closed' and pr.status = 'published')
    );

  return v_result;
end;
$$;

revoke execute on function public.get_pairing_runs_for_app()
  from public, anon;
revoke execute on function public.get_event_pairs_for_app()
  from public, anon;
revoke execute on function public.get_shared_event_attendance(uuid)
  from public, anon;
revoke execute on function public.get_shared_event_pairs(uuid)
  from public, anon;

grant execute on function public.get_pairing_runs_for_app()
  to authenticated;
grant execute on function public.get_event_pairs_for_app()
  to authenticated;
grant execute on function public.get_shared_event_attendance(uuid)
  to authenticated;
grant execute on function public.get_shared_event_pairs(uuid)
  to authenticated;
