-- Reporting views and server-side domain functions.

create or replace view public.member_scores
with (security_invoker = true)
as
select
  m.id as member_id,
  m.display_name,
  m.short_name,
  m.pairing_role,
  m.experience_level,
  m.is_active,
  s.id as season_id,
  s.name as season_name,
  coalesce(sum(a.effective_points) filter (where e.status <> 'cancelled'), 0)::numeric(12,4)
    as total_points,
  coalesce(sum(a.effective_points) filter (
    where e.type = 'rehearsal' and e.status <> 'cancelled'
  ), 0)::numeric(12,4) as rehearsal_points,
  coalesce(sum(a.effective_points) filter (
    where e.type = 'performance' and e.status <> 'cancelled'
  ), 0)::numeric(12,4) as performance_points,
  count(*) filter (where a.status = 'full' and e.status <> 'cancelled')::integer
    as full_attendance_count,
  count(*) filter (where a.status = 'partial' and e.status <> 'cancelled')::integer
    as partial_attendance_count,
  count(*) filter (where a.status = 'absent' and e.status <> 'cancelled')::integer
    as absent_count,
  count(*) filter (where a.status = 'excused' and e.status <> 'cancelled')::integer
    as excused_count,
  max(e.starts_at) filter (
    where a.status in ('full', 'partial') and e.status <> 'cancelled'
  ) as last_attended_at,
  greatest(
    m.updated_at,
    coalesce(max(a.updated_at), '-infinity'::timestamptz),
    coalesce(max(e.updated_at), '-infinity'::timestamptz)
  ) as last_updated_at
from public.members m
cross join public.seasons s
left join public.events e on e.season_id = s.id
left join public.attendance a
  on a.event_id = e.id
 and a.member_id = m.id
group by m.id, s.id;

create or replace view public.event_attendance_detail
with (security_invoker = true)
as
select
  e.id as event_id,
  e.title as event_title,
  e.type as event_type,
  e.starts_at,
  e.ends_at,
  e.points_weight,
  m.id as member_id,
  m.display_name,
  m.short_name,
  m.pairing_role,
  a.status as attendance_status,
  a.arrived_at,
  a.left_at,
  a.minutes_present,
  a.calculated_points,
  a.points_override,
  a.override_reason,
  a.effective_points,
  a.confirmed_at,
  a.updated_at
from public.attendance a
join public.events e on e.id = a.event_id
join public.members m on m.id = a.member_id;

create or replace view public.pair_history
with (security_invoker = true)
as
select
  least(ep.member_a_id, ep.member_b_id) as member_low_id,
  greatest(ep.member_a_id, ep.member_b_id) as member_high_id,
  count(*)::integer as times_paired,
  max(e.starts_at) as last_paired_at,
  min(e.starts_at) as first_paired_at
from public.event_pairs ep
join public.pairing_runs pr on pr.id = ep.pairing_run_id
join public.events e on e.id = pr.event_id
where ep.is_confirmed_actual
  and e.status <> 'cancelled'
group by
  least(ep.member_a_id, ep.member_b_id),
  greatest(ep.member_a_id, ep.member_b_id);

create or replace function public.get_pairing_candidate_scores(
  target_event_id uuid,
  target_pairing_run_id uuid default null
)
returns table (
  member_a_id uuid,
  member_b_id uuid,
  blocked boolean,
  score numeric,
  explanation text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event_date date;
begin
  if not public.is_staff() then
    raise exception 'Návrhy párů jsou dostupné pouze vedení souboru.';
  end if;

  select starts_at::date into v_event_date
  from public.events
  where id = target_event_id;

  if not found then
    raise exception 'Událost neexistuje.';
  end if;

  return query
  with
  cfg as (
    select * from public.pairing_rules where id = 1
  ),
  has_selection as (
    select exists (
      select 1
      from public.event_participants
      where event_id = target_event_id
        and status = 'selected'
    ) as value
  ),
  eligible as (
    select m.id, m.pairing_role, m.experience_level
    from public.members m
    cross join has_selection hs
    where m.is_active
      and (
        (
          hs.value
          and exists (
            select 1
            from public.event_participants p
            where p.event_id = target_event_id
              and p.member_id = m.id
              and p.status = 'selected'
          )
        )
        or (
          not hs.value
          and exists (
            select 1
            from public.attendance a
            where a.event_id = target_event_id
              and a.member_id = m.id
              and a.status in ('full', 'partial')
          )
        )
      )
  ),
  candidates as (
    select
      a.id as a_id,
      b.id as b_id,
      a.experience_level as a_experience,
      b.experience_level as b_experience
    from eligible a
    cross join eligible b
    where a.pairing_role = 'lead'
      and b.pairing_role = 'follow'
  ),
  enriched as (
    select
      c.*,
      pp.kind as preference_kind,
      coalesce(pp.strength, 0) as preference_strength,
      coalesce(ph.times_paired, 0) as times_paired,
      ph.last_paired_at,
      coalesce((
        select count(*)
        from public.event_pairs prior_ep
        join public.pairing_runs prior_pr on prior_pr.id = prior_ep.pairing_run_id
        where target_pairing_run_id is not null
          and prior_ep.pairing_run_id = target_pairing_run_id
          and least(prior_ep.member_a_id, prior_ep.member_b_id) = least(c.a_id, c.b_id)
          and greatest(prior_ep.member_a_id, prior_ep.member_b_id) = greatest(c.a_id, c.b_id)
      ), 0)::integer as same_run_count
    from candidates c
    left join public.pairing_preferences pp
      on pp.member_a_id = least(c.a_id, c.b_id)
     and pp.member_b_id = greatest(c.a_id, c.b_id)
     and (pp.valid_from is null or pp.valid_from <= v_event_date)
     and (pp.valid_to is null or pp.valid_to >= v_event_date)
    left join public.pair_history ph
      on ph.member_low_id = least(c.a_id, c.b_id)
     and ph.member_high_id = greatest(c.a_id, c.b_id)
     and ph.last_paired_at >= (
       select (v_event_date - history_lookback_days)::timestamptz from cfg
     )
  )
  select
    x.a_id,
    x.b_id,
    x.preference_kind = 'forbidden' as blocked,
    round((
      x.times_paired * cfg.repeat_pair_penalty
      + case
          when x.last_paired_at is null then 0
          else greatest(
            0,
            1 - extract(day from (v_event_date::timestamp - x.last_paired_at))::numeric
                / cfg.history_lookback_days::numeric
          ) * cfg.recent_pair_penalty
        end
      + case
          when x.a_experience = 'beginner' and x.b_experience = 'beginner'
            then cfg.beginner_beginner_penalty
          else 0
        end
      - case
          when (
            x.a_experience = 'beginner' and x.b_experience = 'experienced'
          ) or (
            x.a_experience = 'experienced' and x.b_experience = 'beginner'
          ) then cfg.beginner_experienced_bonus
          else 0
        end
      + case
          when x.preference_kind = 'discouraged'
            then cfg.discouraged_pair_penalty * x.preference_strength::numeric / 3
          else 0
        end
      - case
          when x.preference_kind = 'preferred'
            then cfg.preferred_pair_bonus * x.preference_strength::numeric / 3
          else 0
        end
      + x.same_run_count * cfg.same_event_repeat_penalty
    )::numeric, 3) as score,
    concat_ws(
      '; ',
      case
        when x.preference_kind = 'forbidden' then 'zakázané párování'
        when x.preference_kind = 'discouraged' then 'nevhodné párování'
        when x.preference_kind = 'preferred' then 'preferované párování'
      end,
      case
        when x.times_paired = 0 then 'dosud spolu netančili'
        else format('společně tančili %s× v hodnoceném období', x.times_paired)
      end,
      case
        when (
          x.a_experience = 'beginner' and x.b_experience = 'experienced'
        ) or (
          x.a_experience = 'experienced' and x.b_experience = 'beginner'
        ) then 'začátečník + zkušený'
        when x.a_experience = 'beginner' and x.b_experience = 'beginner'
          then 'dva začátečníci'
      end,
      case when x.same_run_count > 0 then 'opakování v této události' end
    ) as explanation
  from enriched x
  cross join cfg
  order by blocked, score, x.a_id, x.b_id;
end;
$$;

create or replace function public.publish_pairing_run(target_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Páry může zveřejnit pouze vedení souboru.';
  end if;

  select event_id into v_event_id
  from public.pairing_runs
  where id = target_run_id
  for update;

  if not found then
    raise exception 'Návrh párů neexistuje.';
  end if;
  if not exists (
    select 1 from public.event_pairs where pairing_run_id = target_run_id
  ) then
    raise exception 'Prázdný návrh párů nelze zveřejnit.';
  end if;

  update public.pairing_runs
  set status = 'superseded',
      published_at = null
  where event_id = v_event_id
    and status = 'published'
    and id <> target_run_id;

  update public.pairing_runs
  set status = 'published',
      published_at = now()
  where id = target_run_id;
end;
$$;

create or replace function public.confirm_actual_pairs(target_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_staff() then
    raise exception 'Skutečné páry může potvrdit pouze vedení souboru.';
  end if;

  update public.event_pairs
  set is_confirmed_actual = true
  where pairing_run_id = target_run_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.set_current_season(target_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Aktuální sezonu může změnit pouze administrátor.';
  end if;
  if not exists (select 1 from public.seasons where id = target_season_id) then
    raise exception 'Sezona neexistuje.';
  end if;

  update public.seasons
  set is_current = (id = target_season_id);
end;
$$;

create or replace function public.get_shared_overview()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_result jsonb;
begin
  if not public.has_active_shared_session() then
    raise exception 'Sdílená relace není platná nebo vypršela.';
  end if;

  update public.shared_access_sessions
  set last_seen_at = now()
  where user_id = auth.uid();

  select id into v_season_id
  from public.seasons
  where is_current
  limit 1;

  select jsonb_build_object(
    'season', (
      select jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'dateFrom', s.date_from,
        'dateTo', s.date_to
      )
      from public.seasons s
      where s.id = v_season_id
    ),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'type', e.type,
          'title', e.title,
          'location', e.location,
          'startsAt', e.starts_at,
          'endsAt', e.ends_at,
          'status', e.status,
          'responseDeadline', e.response_deadline
        )
        order by e.starts_at
      )
      from public.events e
      where e.season_id = v_season_id
        and e.visibility in ('public', 'shared')
        and e.status <> 'draft'
    ), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'memberId', ms.member_id,
          'displayName', ms.display_name,
          'pairingRole', ms.pairing_role,
          'totalPoints', ms.total_points,
          'rehearsalPoints', ms.rehearsal_points,
          'performancePoints', ms.performance_points,
          'fullAttendanceCount', ms.full_attendance_count,
          'partialAttendanceCount', ms.partial_attendance_count,
          'excusedCount', ms.excused_count
        )
        order by ms.display_name
      )
      from public.member_scores ms
      where ms.season_id = v_season_id
        and ms.is_active
    ), '[]'::jsonb),
    'generatedAt', now()
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_shared_event_attendance(target_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
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

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'memberId', d.member_id,
      'displayName', d.display_name,
      'attendanceStatus', d.attendance_status,
      'points', d.effective_points
    )
    order by d.display_name
  ), '[]'::jsonb)
  into v_result
  from public.event_attendance_detail d
  where d.event_id = target_event_id
    and d.attendance_status <> 'unrecorded';

  return v_result;
end;
$$;

create or replace function public.get_shared_event_pairs(target_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.has_active_shared_session() then
    raise exception 'Sdílená relace není platná nebo vypršela.';
  end if;
  if not exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and e.visibility in ('public', 'shared')
      and e.status <> 'draft'
  ) then
    raise exception 'Páry této události nejsou ve sdíleném náhledu dostupné.';
  end if;

  update public.shared_access_sessions
  set last_seen_at = now()
  where user_id = auth.uid();

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'roundNumber', ep.round_number,
      'memberAId', ep.member_a_id,
      'memberAName', ma.display_name,
      'memberBId', ep.member_b_id,
      'memberBName', mb.display_name,
      'explanation', ep.explanation
    )
    order by ep.round_number, ma.display_name, mb.display_name
  ), '[]'::jsonb)
  into v_result
  from public.event_pairs ep
  join public.pairing_runs pr on pr.id = ep.pairing_run_id
  join public.members ma on ma.id = ep.member_a_id
  join public.members mb on mb.id = ep.member_b_id
  where pr.event_id = target_event_id
    and pr.status = 'published';

  return v_result;
end;
$$;

grant select on
  public.member_scores,
  public.event_attendance_detail,
  public.pair_history
to authenticated;

revoke all on function public.get_pairing_candidate_scores(uuid, uuid) from public;
revoke all on function public.publish_pairing_run(uuid) from public;
revoke all on function public.confirm_actual_pairs(uuid) from public;
revoke all on function public.set_current_season(uuid) from public;
revoke all on function public.get_shared_overview() from public;
revoke all on function public.get_shared_event_attendance(uuid) from public;
revoke all on function public.get_shared_event_pairs(uuid) from public;

grant execute on function public.get_pairing_candidate_scores(uuid, uuid) to authenticated;
grant execute on function public.publish_pairing_run(uuid) to authenticated;
grant execute on function public.confirm_actual_pairs(uuid) to authenticated;
grant execute on function public.set_current_season(uuid) to authenticated;
grant execute on function public.get_shared_overview() to authenticated;
grant execute on function public.get_shared_event_attendance(uuid) to authenticated;
grant execute on function public.get_shared_event_pairs(uuid) to authenticated;

