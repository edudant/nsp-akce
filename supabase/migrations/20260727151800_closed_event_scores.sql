-- Scores and attendance counts are final only after an event is closed.

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

grant select on public.member_scores to authenticated;
revoke all on public.member_scores from anon;

