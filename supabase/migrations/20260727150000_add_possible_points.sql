-- Add the season denominator used for a semantically correct attendance rate.

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
  coalesce(sum(a.effective_points) filter (where e.status = 'closed'), 0)::numeric(12,4)
    as total_points,
  coalesce(sum(a.effective_points) filter (
    where e.type = 'rehearsal' and e.status = 'closed'
  ), 0)::numeric(12,4) as rehearsal_points,
  coalesce(sum(a.effective_points) filter (
    where e.type = 'performance' and e.status = 'closed'
  ), 0)::numeric(12,4) as performance_points,
  count(*) filter (where a.status = 'full' and e.status = 'closed')::integer
    as full_attendance_count,
  count(*) filter (where a.status = 'partial' and e.status = 'closed')::integer
    as partial_attendance_count,
  count(*) filter (where a.status = 'absent' and e.status = 'closed')::integer
    as absent_count,
  count(*) filter (where a.status = 'excused' and e.status = 'closed')::integer
    as excused_count,
  max(e.starts_at) filter (
    where a.status in ('full', 'partial') and e.status = 'closed'
  ) as last_attended_at,
  greatest(
    m.updated_at,
    coalesce(max(a.updated_at), '-infinity'::timestamptz),
    coalesce(max(e.updated_at), '-infinity'::timestamptz)
  ) as last_updated_at,
  coalesce(sum(e.points_weight) filter (
    where e.status = 'closed'
      and (m.active_from is null or e.starts_at::date >= m.active_from)
      and (m.active_to is null or e.starts_at::date <= m.active_to)
  ), 0)::numeric(12,4) as possible_points
from public.members m
cross join public.seasons s
left join public.events e on e.season_id = s.id
left join public.attendance a
  on a.event_id = e.id
 and a.member_id = m.id
group by m.id, s.id;

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
          'possiblePoints', ms.possible_points,
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

grant select on public.member_scores to authenticated;
revoke all on function public.get_shared_overview() from public;
grant execute on function public.get_shared_overview() to authenticated;
