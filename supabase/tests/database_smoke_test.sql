-- Read-only production smoke test. Every violation counter should be zero.

with
base_tables_without_rls as (
  select count(*)::integer as value
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity
),
forbidden_pair_violations as (
  select count(*)::integer as value
  from public.event_pairs ep
  join public.pairing_runs pr on pr.id = ep.pairing_run_id
  join public.events e on e.id = pr.event_id
  join public.pairing_preferences pp
    on pp.member_a_id = least(ep.member_a_id, ep.member_b_id)
   and pp.member_b_id = greatest(ep.member_a_id, ep.member_b_id)
   and pp.kind = 'forbidden'
   and (pp.valid_from is null or pp.valid_from <= e.starts_at::date)
   and (pp.valid_to is null or pp.valid_to >= e.starts_at::date)
),
duplicate_round_members as (
  select count(*)::integer as value
  from (
    select pairing_run_id, round_number, member_id
    from (
      select pairing_run_id, round_number, member_a_id as member_id
      from public.event_pairs
      union all
      select pairing_run_id, round_number, member_b_id as member_id
      from public.event_pairs
    ) members_in_round
    group by pairing_run_id, round_number, member_id
    having count(*) > 1
  ) duplicates
),
multiple_actual_runs_per_event as (
  select count(*)::integer as value
  from (
    select pr.event_id
    from public.event_pairs ep
    join public.pairing_runs pr on pr.id = ep.pairing_run_id
    where ep.is_confirmed_actual
    group by pr.event_id
    having count(distinct pr.id) > 1
  ) invalid_events
),
incorrect_possible_points as (
  select count(*)::integer as value
  from public.member_scores ms
  join public.members m on m.id = ms.member_id
  where ms.possible_points <> (
    select coalesce(sum(e.points_weight), 0)::numeric(12,4)
    from public.events e
    where e.season_id = ms.season_id
      and e.status = 'closed'
      and (m.active_from is null or e.starts_at::date >= m.active_from)
      and (m.active_to is null or e.starts_at::date <= m.active_to)
  )
),
security_definer_without_search_path as (
  select count(*)::integer as value
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (
      select 1
      from unnest(coalesce(p.proconfig, '{}'::text[])) setting
      where setting like 'search_path=%'
    )
),
anon_table_grants as (
  select count(*)::integer as value
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.grantee = 'anon'
),
unsafe_staff_delete_policies as (
  select count(*)::integer as value
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (
      'event_responses',
      'event_participants',
      'attendance',
      'pairing_runs',
      'event_pairs'
    )
    and p.cmd in ('ALL', 'DELETE')
    and coalesce(p.qual, '') like '%is_staff%'
),
unlinked_automatic_member_roles as (
  select count(*)::integer as value
  from public.user_roles ur
  join public.profiles p on p.user_id = ur.user_id
  where ur.role = 'member'
    and p.member_id is null
    and ur.granted_by is null
)
select jsonb_build_object(
  'base_tables_without_rls', (select value from base_tables_without_rls),
  'forbidden_pair_violations', (select value from forbidden_pair_violations),
  'duplicate_round_members', (select value from duplicate_round_members),
  'multiple_actual_runs_per_event', (select value from multiple_actual_runs_per_event),
  'incorrect_possible_points', (select value from incorrect_possible_points),
  'security_definer_without_search_path', (select value from security_definer_without_search_path),
  'anon_table_grants', (select value from anon_table_grants),
  'unsafe_staff_delete_policies', (select value from unsafe_staff_delete_policies),
  'unlinked_automatic_member_roles', (select value from unlinked_automatic_member_roles)
) as smoke_test;

