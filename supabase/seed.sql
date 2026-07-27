-- Fictional Czech demo data for development and the initial MVP deployment.
-- No names or attendance records in this file represent real NSP members.

insert into public.seasons (
  id, name, date_from, date_to, is_current
)
values (
  '00000000-0000-4000-8000-000000000001',
  'Sezona 2026',
  '2026-01-01',
  '2026-12-31',
  true
)
on conflict (id) do update set
  name = excluded.name,
  date_from = excluded.date_from,
  date_to = excluded.date_to,
  is_current = excluded.is_current;

insert into public.members (
  id, display_name, short_name, pairing_role, experience_level, active_from, is_active
)
values
  ('10000000-0000-4000-8000-000000000001', 'Adam Beran', 'Adam', 'lead', 'experienced', '2022-01-01', true),
  ('10000000-0000-4000-8000-000000000002', 'Bohumil Černý', 'Bohumil', 'lead', 'advanced', '2023-01-01', true),
  ('10000000-0000-4000-8000-000000000003', 'Cyril Dvořák', 'Cyril', 'lead', 'beginner', '2026-01-01', true),
  ('10000000-0000-4000-8000-000000000004', 'David Fiala', 'David', 'lead', 'experienced', '2021-01-01', true),
  ('10000000-0000-4000-8000-000000000005', 'Emil Holub', 'Emil', 'lead', 'advanced', '2024-01-01', true),
  ('10000000-0000-4000-8000-000000000006', 'Filip Jelínek', 'Filip', 'lead', 'beginner', '2026-02-01', true),
  ('10000000-0000-4000-8000-000000000007', 'Gustav Kříž', 'Gustav', 'lead', 'experienced', '2020-01-01', true),
  ('10000000-0000-4000-8000-000000000008', 'Hynek Marek', 'Hynek', 'lead', 'advanced', '2023-09-01', true),
  ('10000000-0000-4000-8000-000000000009', 'Ivan Novotný', 'Ivan', 'lead', 'beginner', '2026-03-01', true),
  ('10000000-0000-4000-8000-000000000010', 'Jan Polák', 'Jan', 'lead', 'experienced', '2019-01-01', true),
  ('10000000-0000-4000-8000-000000000011', 'Karel Růžička', 'Karel', 'lead', 'advanced', '2024-01-01', true),
  ('10000000-0000-4000-8000-000000000012', 'Lukáš Svoboda', 'Lukáš', 'lead', 'beginner', '2026-04-01', true),
  ('10000000-0000-4000-8000-000000000101', 'Adéla Bílá', 'Adéla', 'follow', 'beginner', '2026-01-01', true),
  ('10000000-0000-4000-8000-000000000102', 'Barbora Čermáková', 'Barbora', 'follow', 'experienced', '2020-01-01', true),
  ('10000000-0000-4000-8000-000000000103', 'Cecílie Doležalová', 'Cecílie', 'follow', 'advanced', '2023-01-01', true),
  ('10000000-0000-4000-8000-000000000104', 'Dana Fialová', 'Dana', 'follow', 'beginner', '2026-02-01', true),
  ('10000000-0000-4000-8000-000000000105', 'Eliška Horáková', 'Eliška', 'follow', 'experienced', '2019-01-01', true),
  ('10000000-0000-4000-8000-000000000106', 'Františka Jandová', 'Františka', 'follow', 'advanced', '2024-01-01', true),
  ('10000000-0000-4000-8000-000000000107', 'Gabriela Koubová', 'Gabriela', 'follow', 'beginner', '2026-03-01', true),
  ('10000000-0000-4000-8000-000000000108', 'Hana Malá', 'Hana', 'follow', 'experienced', '2021-01-01', true),
  ('10000000-0000-4000-8000-000000000109', 'Iveta Němcová', 'Iveta', 'follow', 'advanced', '2023-09-01', true),
  ('10000000-0000-4000-8000-000000000110', 'Jana Procházková', 'Jana', 'follow', 'beginner', '2026-04-01', true),
  ('10000000-0000-4000-8000-000000000111', 'Klára Sedláčková', 'Klára', 'follow', 'experienced', '2018-01-01', true),
  ('10000000-0000-4000-8000-000000000112', 'Lenka Veselá', 'Lenka', 'follow', 'advanced', '2024-02-01', true)
on conflict (id) do update set
  display_name = excluded.display_name,
  short_name = excluded.short_name,
  pairing_role = excluded.pairing_role,
  experience_level = excluded.experience_level,
  active_from = excluded.active_from,
  is_active = excluded.is_active;

insert into public.events (
  id, season_id, type, title, location, starts_at, ends_at, status,
  points_weight, capacity, required_pairs, response_deadline, visibility, program
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'rehearsal', 'Zkouška – kroky a držení', 'Kulturní dům Postřekov',
    '2026-07-02 18:00:00+02', '2026-07-02 20:00:00+02', 'closed',
    1, null, 10, null, 'shared', 'Základní kroky'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    'rehearsal', 'Zkouška – chodské kolečko', 'Kulturní dům Postřekov',
    '2026-07-09 18:00:00+02', '2026-07-09 20:00:00+02', 'closed',
    1, null, 10, null, 'shared', 'Chodské kolečko'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    'rehearsal', 'Zkouška – pásmo dožínek', 'Kulturní dům Postřekov',
    '2026-07-16 18:00:00+02', '2026-07-16 20:30:00+02', 'closed',
    1, null, 10, null, 'shared', 'Dožínkové pásmo'
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000001',
    'rehearsal', 'Generální zkouška', 'Sál U Trubače',
    '2026-07-23 18:00:00+02', '2026-07-23 21:00:00+02', 'closed',
    1.5, null, 10, null, 'shared', 'Celý program'
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000001',
    'performance', 'Ukázkové letní vystoupení', 'Náves v Postřekově',
    '2026-07-25 14:00:00+02', '2026-07-25 16:00:00+02', 'closed',
    2, 20, 10, '2026-07-18 20:00:00+02', 'public', 'Letní pásmo'
  ),
  (
    '20000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000000001',
    'rehearsal', 'Zkouška – střídání párů', 'Kulturní dům Postřekov',
    '2026-07-30 18:00:00+02', '2026-07-30 20:00:00+02', 'open',
    1, null, 10, '2026-07-29 18:00:00+02', 'shared', 'Střídání párů'
  ),
  (
    '20000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000001',
    'rehearsal', 'Zkouška – dožínkové pásmo', 'Kulturní dům Postřekov',
    '2026-08-06 18:00:00+02', '2026-08-06 20:00:00+02', 'open',
    1, null, 10, '2026-08-05 18:00:00+02', 'shared', 'Dožínkové pásmo'
  ),
  (
    '20000000-0000-4000-8000-000000000008',
    '00000000-0000-4000-8000-000000000001',
    'performance', 'Dožínková slavnost – ukázka', 'Domažlice',
    '2026-08-15 15:00:00+02', '2026-08-15 17:00:00+02', 'open',
    2, 20, 10, '2026-08-08 20:00:00+02', 'shared', 'Dožínkové pásmo'
  )
on conflict (id) do update set
  season_id = excluded.season_id,
  type = excluded.type,
  title = excluded.title,
  location = excluded.location,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  status = excluded.status,
  points_weight = excluded.points_weight,
  capacity = excluded.capacity,
  required_pairs = excluded.required_pairs,
  response_deadline = excluded.response_deadline,
  visibility = excluded.visibility,
  program = excluded.program;

-- Everyone was initially selected for past demo events; final attendance varies.
insert into public.event_participants (event_id, member_id, status, note)
select e.id, m.id, 'selected'::public.participant_status, 'Fiktivní testovací obsazení'
from public.events e
cross join public.members m
where e.id in (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000005'
)
on conflict (event_id, member_id) do update set
  status = excluded.status,
  note = excluded.note;

with ranked_members as (
  select id, row_number() over (order by id)::integer as member_rank
  from public.members
),
ranked_events as (
  select
    id,
    starts_at,
    ends_at,
    row_number() over (order by starts_at)::integer as event_rank
  from public.events
  where id in (
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000005'
  )
)
insert into public.attendance (
  event_id, member_id, status, minutes_present, confirmed_at
)
select
  e.id,
  m.id,
  case (m.member_rank + e.event_rank) % 9
    when 0 then 'absent'::public.attendance_status
    when 1 then 'excused'::public.attendance_status
    when 2 then 'partial'::public.attendance_status
    else 'full'::public.attendance_status
  end,
  case
    when (m.member_rank + e.event_rank) % 9 = 2
      then round(extract(epoch from (e.ends_at - e.starts_at)) / 60 * 0.7)::integer
    else null
  end,
  e.ends_at
from ranked_events e
cross join ranked_members m
on conflict (event_id, member_id) do update set
  status = excluded.status,
  minutes_present = excluded.minutes_present,
  confirmed_at = excluded.confirmed_at;

-- Fictional availability and a balanced selected cast for upcoming events.
with ranked_members as (
  select
    id,
    pairing_role,
    row_number() over (partition by pairing_role order by id)::integer as role_rank
  from public.members
  where is_active
),
future_events as (
  select id, row_number() over (order by starts_at)::integer as event_rank
  from public.events
  where id in (
    '20000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000008'
  )
)
insert into public.event_responses (event_id, member_id, response, note)
select
  e.id,
  m.id,
  case (m.role_rank + e.event_rank) % 8
    when 0 then 'no'::public.event_response_status
    when 1 then 'maybe'::public.event_response_status
    when 2 then 'substitute'::public.event_response_status
    else 'yes'::public.event_response_status
  end,
  'Fiktivní testovací odpověď'
from future_events e
cross join ranked_members m
on conflict (event_id, member_id) do update set
  response = excluded.response,
  note = excluded.note;

with ranked_members as (
  select
    id,
    pairing_role,
    row_number() over (partition by pairing_role order by id)::integer as role_rank
  from public.members
  where is_active
),
future_events as (
  select id from public.events
  where id in (
    '20000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000008'
  )
)
insert into public.event_participants (event_id, member_id, status, note)
select
  e.id,
  m.id,
  case when m.role_rank <= 10
    then 'selected'::public.participant_status
    else 'substitute'::public.participant_status
  end,
  'Fiktivní vyvážené testovací obsazení'
from future_events e
cross join ranked_members m
on conflict (event_id, member_id) do update set
  status = excluded.status,
  note = excluded.note;

insert into public.pairing_preferences (
  member_a_id, member_b_id, kind, strength, valid_from, private_reason
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000101',
    'forbidden', 5, '2026-01-01', 'Fiktivní testovací zákaz'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000102',
    'preferred', 2, '2026-01-01', 'Fiktivní testovací preference'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000103',
    'discouraged', 4, '2026-01-01', 'Fiktivní testovací omezení'
  )
on conflict (member_a_id, member_b_id) do update set
  kind = excluded.kind,
  strength = excluded.strength,
  valid_from = excluded.valid_from,
  private_reason = excluded.private_reason;

insert into public.pairing_runs (
  id, event_id, seed, algorithm_version, rules_snapshot, status, published_at, note
)
select
  ('30000000-0000-4000-8000-' || lpad(event_number::text, 12, '0'))::uuid,
  ('20000000-0000-4000-8000-' || lpad(event_number::text, 12, '0'))::uuid,
  2026000 + event_number,
  'mvp-v1',
  to_jsonb(r.*) - 'updated_by' - 'updated_at',
  'published'::public.pairing_run_status,
  case when event_number <= 5
    then ('2026-07-01'::date + (event_number * interval '7 days'))
    else now()
  end,
  'Fiktivní testovací návrh'
from generate_series(1, 8) event_number
cross join public.pairing_rules r
where r.id = 1
on conflict (id) do update set
  seed = excluded.seed,
  algorithm_version = excluded.algorithm_version,
  rules_snapshot = excluded.rules_snapshot,
  status = excluded.status,
  published_at = excluded.published_at,
  note = excluded.note;

-- Build one deterministic, non-forbidden demo round for every event.
with run_events as (
  select
    pr.id as run_id,
    pr.event_id,
    row_number() over (order by e.starts_at)::integer as event_rank
  from public.pairing_runs pr
  join public.events e on e.id = pr.event_id
  where pr.id::text like '30000000-0000-4000-8000-%'
),
eligible as (
  select
    re.run_id,
    re.event_id,
    re.event_rank,
    m.id as member_id,
    m.pairing_role,
    row_number() over (
      partition by re.run_id, m.pairing_role
      order by m.id
    )::integer as role_rank
  from run_events re
  join public.event_participants p
    on p.event_id = re.event_id
   and p.status = 'selected'
  join public.members m on m.id = p.member_id
  left join public.attendance a
    on a.event_id = re.event_id
   and a.member_id = m.id
  join public.events e on e.id = re.event_id
  where e.starts_at > '2026-07-27 00:00:00+02'
     or a.status in ('full', 'partial')
),
counts as (
  select
    run_id,
    count(*) filter (where pairing_role = 'lead')::integer as lead_count,
    count(*) filter (where pairing_role = 'follow')::integer as follow_count
  from eligible
  group by run_id
),
paired as (
  select
    lead.run_id,
    lead.event_rank,
    lead.member_id as lead_id,
    follow.member_id as follow_id
  from eligible lead
  join counts c on c.run_id = lead.run_id
  join eligible follow
    on follow.run_id = lead.run_id
   and follow.pairing_role = 'follow'
   and follow.role_rank = (
     ((lead.role_rank + lead.event_rank - 1) % c.follow_count) + 1
   )
  where lead.pairing_role = 'lead'
    and lead.role_rank <= least(c.lead_count, c.follow_count)
)
insert into public.event_pairs (
  id, pairing_run_id, round_number, member_a_id, member_b_id,
  is_confirmed_actual, score, explanation
)
select
  md5(run_id::text || ':1:' || lead_id::text || ':' || follow_id::text)::uuid,
  run_id,
  1,
  lead_id,
  follow_id,
  event_rank <= 5,
  (event_rank * 10)::numeric,
  case when event_rank <= 5
    then 'Fiktivní potvrzený pár z testovací historie'
    else 'Fiktivní návrh: střídání partnerů a vyvážení zkušeností'
  end
from paired
on conflict (id) do update set
  is_confirmed_actual = excluded.is_confirmed_actual,
  score = excluded.score,
  explanation = excluded.explanation;

