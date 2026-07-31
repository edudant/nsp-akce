-- Member dashboard/history RPCs and wish-aware pairing reports.

-- Historical production events use shared visibility. Explicit member
-- accounts may read and answer those events as well as public/member events;
-- the shared-code path remains separately protected by its session RPCs.
create or replace function public.can_member_respond(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and e.status = 'open'
      and e.visibility in ('public', 'members', 'shared')
      and (e.response_deadline is null or now() <= e.response_deadline)
  );
$$;

drop policy if exists events_member_select on public.events;
create policy events_member_select
on public.events for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and status <> 'draft'
  and visibility in ('public', 'members', 'shared')
);

drop policy if exists pairing_runs_member_select on public.pairing_runs;
create policy pairing_runs_member_select
on public.pairing_runs for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and status = 'published'
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.status <> 'draft'
      and e.visibility in ('public', 'members', 'shared')
  )
);

drop policy if exists event_pairs_member_select on public.event_pairs;
create policy event_pairs_member_select
on public.event_pairs for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and exists (
    select 1
    from public.pairing_runs pr
    join public.events e on e.id = pr.event_id
    where pr.id = pairing_run_id
      and pr.status = 'published'
      and e.status <> 'draft'
      and e.visibility in ('public', 'members', 'shared')
  )
);

create or replace function public.set_my_event_response(
  target_event_id uuid,
  new_response public.event_response_status,
  response_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_result jsonb;
begin
  if v_member_id is null then
    raise exception 'Účet není propojený s aktivním členem.';
  end if;
  if not public.can_member_respond(target_event_id) then
    raise exception 'Na tuto událost už nelze odpovědět.';
  end if;
  if response_note is not null and length(btrim(response_note)) > 500 then
    raise exception 'Poznámka může mít nejvýše 500 znaků.';
  end if;

  insert into public.event_responses (
    event_id,
    member_id,
    response,
    note,
    responded_by,
    responded_at
  )
  values (
    target_event_id,
    v_member_id,
    new_response,
    nullif(btrim(response_note), ''),
    auth.uid(),
    now()
  )
  on conflict (event_id, member_id) do update
    set response = excluded.response,
        note = excluded.note,
        responded_by = auth.uid(),
        responded_at = now();

  select jsonb_build_object(
    'eventId', er.event_id,
    'memberId', er.member_id,
    'response', er.response,
    'note', er.note,
    'respondedAt', er.responded_at
  ) into v_result
  from public.event_responses er
  where er.event_id = target_event_id
    and er.member_id = v_member_id;

  return v_result;
end;
$$;

create or replace function public.get_member_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_season_id uuid;
  v_result jsonb;
begin
  if v_member_id is null then
    raise exception 'Účet není propojený s aktivním členem.';
  end if;

  select s.id into v_season_id
  from public.seasons s
  order by s.is_current desc, s.date_to desc
  limit 1;

  select jsonb_build_object(
    'member', jsonb_build_object(
      'memberId', m.id,
      'displayName', m.display_name,
      'shortName', m.short_name,
      'pairingRole', m.pairing_role,
      'experienceLevel', m.experience_level
    ),
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
    'score', coalesce((
      select jsonb_build_object(
        'totalPoints', ms.total_points,
        'possiblePoints', ms.possible_points,
        'rehearsalPoints', ms.rehearsal_points,
        'performancePoints', ms.performance_points,
        'fullAttendanceCount', ms.full_attendance_count,
        'partialAttendanceCount', ms.partial_attendance_count,
        'absentCount', ms.absent_count,
        'excusedCount', ms.excused_count,
        'attendancePercent', case
          when (
            ms.full_attendance_count
            + ms.partial_attendance_count
            + ms.absent_count
          ) = 0 then 0
          else round(
            100.0
            * (ms.full_attendance_count + ms.partial_attendance_count)::numeric
            / (
              ms.full_attendance_count
              + ms.partial_attendance_count
              + ms.absent_count
            )::numeric,
            1
          )
        end,
        'lastAttendedAt', ms.last_attended_at
      )
      from public.member_scores ms
      where ms.member_id = v_member_id
        and ms.season_id = v_season_id
    ), jsonb_build_object(
      'totalPoints', 0,
      'possiblePoints', 0,
      'rehearsalPoints', 0,
      'performancePoints', 0,
      'fullAttendanceCount', 0,
      'partialAttendanceCount', 0,
      'absentCount', 0,
      'excusedCount', 0,
      'attendancePercent', 0,
      'lastAttendedAt', null
    )),
    'events', coalesce((
      select jsonb_agg(event_row.payload order by event_row.starts_at desc)
      from (
        select
          e.starts_at,
          jsonb_build_object(
            'id', e.id,
            'seasonId', e.season_id,
            'type', e.type,
            'title', e.title,
            'location', e.location,
            'startsAt', e.starts_at,
            'endsAt', e.ends_at,
            'status', e.status,
            'responseDeadline', e.response_deadline,
            'canRespond', public.can_member_respond(e.id),
            'response', coalesce(er.response, 'unanswered'::public.event_response_status),
            'responseNote', er.note,
            'respondedAt', er.responded_at,
            'attendanceStatus', coalesce(a.status, 'unrecorded'::public.attendance_status),
            'points', coalesce(a.effective_points, 0),
            'programs', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', epi.id,
                  'name', coalesce(pc.name, epi.custom_name),
                  'position', epi.position,
                  'isCustom', epi.catalog_program_id is null
                ) order by epi.position
              )
              from public.event_program_items epi
              left join public.program_catalog pc on pc.id = epi.catalog_program_id
              where epi.event_id = e.id
            ), '[]'::jsonb)
          ) as payload
        from public.events e
        left join public.event_responses er
          on er.event_id = e.id
         and er.member_id = v_member_id
        left join public.attendance a
          on a.event_id = e.id
         and a.member_id = v_member_id
        where e.status <> 'draft'
          and e.visibility in ('public', 'members', 'shared')
      ) event_row
    ), '[]'::jsonb),
    'recentAttendance', coalesce((
      select jsonb_agg(recent.payload order by recent.starts_at desc)
      from (
        select
          e.starts_at,
          jsonb_build_object(
            'eventId', e.id,
            'title', e.title,
            'type', e.type,
            'startsAt', e.starts_at,
            'attendanceStatus', a.status,
            'points', a.effective_points
          ) as payload
        from public.attendance a
        join public.events e on e.id = a.event_id
        where a.member_id = v_member_id
          and e.status = 'closed'
          and a.status <> 'unrecorded'
        order by e.starts_at desc
        limit 10
      ) recent
    ), '[]'::jsonb),
    'generatedAt', now()
  ) into v_result
  from public.members m
  where m.id = v_member_id;

  return v_result;
end;
$$;

create or replace function public.build_member_history(target_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not exists (select 1 from public.members m where m.id = target_member_id) then
    raise exception 'Člen neexistuje.';
  end if;

  select jsonb_build_object(
    'member', jsonb_build_object(
      'memberId', m.id,
      'displayName', m.display_name,
      'shortName', m.short_name,
      'pairingRole', m.pairing_role,
      'experienceLevel', m.experience_level,
      'isActive', m.is_active
    ),
    'scores', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'seasonId', ms.season_id,
          'seasonName', ms.season_name,
          'totalPoints', ms.total_points,
          'possiblePoints', ms.possible_points,
          'rehearsalPoints', ms.rehearsal_points,
          'performancePoints', ms.performance_points,
          'fullAttendanceCount', ms.full_attendance_count,
          'partialAttendanceCount', ms.partial_attendance_count,
          'absentCount', ms.absent_count,
          'excusedCount', ms.excused_count
        ) order by s.date_from desc
      )
      from public.member_scores ms
      join public.seasons s on s.id = ms.season_id
      where ms.member_id = target_member_id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(event_row.payload order by event_row.starts_at desc)
      from (
        select
          e.starts_at,
          jsonb_build_object(
            'eventId', e.id,
            'seasonId', e.season_id,
            'title', e.title,
            'type', e.type,
            'location', e.location,
            'startsAt', e.starts_at,
            'endsAt', e.ends_at,
            'status', e.status,
            'response', coalesce(er.response, 'unanswered'::public.event_response_status),
            'responseNote', er.note,
            'respondedAt', er.responded_at,
            'attendanceStatus', coalesce(a.status, 'unrecorded'::public.attendance_status),
            'minutesPresent', a.minutes_present,
            'points', coalesce(a.effective_points, 0),
            'pairs', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'pairId', ep.id,
                  'pairingBlockId', pb.id,
                  'blockName', coalesce(pb.name, 'Kolo ' || ep.round_number),
                  'roundNumber', ep.round_number,
                  'partnerMemberId', case
                    when ep.member_a_id = target_member_id then ep.member_b_id
                    else ep.member_a_id
                  end,
                  'partnerName', case
                    when ep.member_a_id = target_member_id then mb.display_name
                    else ma.display_name
                  end,
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
                      left join public.program_catalog pc
                        on pc.id = epi.catalog_program_id
                      where epi.event_id = e.id
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
                      left join public.program_catalog pc
                        on pc.id = epi.catalog_program_id
                      where bp.pairing_block_id = pb.id
                    ), '[]'::jsonb)
                  end
                ) order by ep.round_number,
                  case
                    when ep.member_a_id = target_member_id then mb.display_name
                    else ma.display_name
                  end
              )
              from public.event_pairs ep
              join public.pairing_runs pr on pr.id = ep.pairing_run_id
              join public.members ma on ma.id = ep.member_a_id
              join public.members mb on mb.id = ep.member_b_id
              left join public.pairing_blocks pb on pb.id = ep.pairing_block_id
              where pr.event_id = e.id
                and target_member_id in (ep.member_a_id, ep.member_b_id)
                and (
                  (e.status = 'closed' and ep.is_confirmed_actual)
                  or (e.status <> 'closed' and pr.status = 'published')
                )
            ), '[]'::jsonb)
          ) as payload
        from public.events e
        left join public.event_responses er
          on er.event_id = e.id
         and er.member_id = target_member_id
        left join public.attendance a
          on a.event_id = e.id
         and a.member_id = target_member_id
        where e.status <> 'draft'
          and (
            e.visibility in ('public', 'members', 'shared')
            or er.member_id is not null
            or a.member_id is not null
            or exists (
              select 1
              from public.event_pairs history_pair
              join public.pairing_runs history_run
                on history_run.id = history_pair.pairing_run_id
              where history_run.event_id = e.id
                and target_member_id in (
                  history_pair.member_a_id,
                  history_pair.member_b_id
                )
                and history_pair.is_confirmed_actual
            )
          )
      ) event_row
    ), '[]'::jsonb),
    'generatedAt', now()
  ) into v_result
  from public.members m
  where m.id = target_member_id;

  return v_result;
end;
$$;

create or replace function public.get_member_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := public.current_member_id();
begin
  if v_member_id is null then
    raise exception 'Účet není propojený s aktivním členem.';
  end if;
  return public.build_member_history(v_member_id);
end;
$$;

create or replace function public.get_admin_member_history(target_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Historii jiného člena může zobrazit pouze administrátor.';
  end if;
  return public.build_member_history(target_member_id);
end;
$$;

create or replace function public.get_member_leaderboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_result jsonb;
begin
  if public.current_member_id() is null and not public.is_admin() then
    raise exception 'Žebříček je dostupný pouze přihlášeným členům.';
  end if;

  select s.id into v_season_id
  from public.seasons s
  order by s.is_current desc, s.date_to desc
  limit 1;

  select jsonb_build_object(
    'season', (
      select jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'dateFrom', s.date_from,
        'dateTo', s.date_to
      )
      from public.seasons s where s.id = v_season_id
    ),
    'scores', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'memberId', ms.member_id,
          'displayName', ms.display_name,
          'shortName', ms.short_name,
          'pairingRole', ms.pairing_role,
          'totalPoints', ms.total_points,
          'possiblePoints', ms.possible_points,
          'rehearsalPoints', ms.rehearsal_points,
          'performancePoints', ms.performance_points,
          'fullAttendanceCount', ms.full_attendance_count,
          'partialAttendanceCount', ms.partial_attendance_count,
          'excusedCount', ms.excused_count
        ) order by ms.total_points desc, ms.display_name
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

-- Add private, directional member wishes to the existing score. A mutual wish
-- receives twice the ordinary preferred-pair bonus; forbidden pairs remain
-- blocked regardless of wishes.
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
        where target_pairing_run_id is not null
          and prior_ep.pairing_run_id = target_pairing_run_id
          and least(prior_ep.member_a_id, prior_ep.member_b_id)
            = least(c.a_id, c.b_id)
          and greatest(prior_ep.member_a_id, prior_ep.member_b_id)
            = greatest(c.a_id, c.b_id)
      ), 0)::integer as same_run_count,
      coalesce((
        select count(*)
        from public.event_partner_wishes w
        where w.event_id = target_event_id
          and (
            (w.member_id = c.a_id and w.partner_member_id = c.b_id)
            or (w.member_id = c.b_id and w.partner_member_id = c.a_id)
          )
      ), 0)::integer as wish_count
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
    coalesce(x.preference_kind = 'forbidden', false) as blocked,
    round((
      x.times_paired * cfg.repeat_pair_penalty
      + case
          when x.last_paired_at is null then 0
          else greatest(
            0,
            1 - extract(day from (
              v_event_date::timestamp - x.last_paired_at
            ))::numeric / cfg.history_lookback_days::numeric
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
      - case
          when x.wish_count >= 2 then cfg.preferred_pair_bonus * 2
          when x.wish_count = 1 then cfg.preferred_pair_bonus
          else 0
        end
      + x.same_run_count * cfg.same_event_repeat_penalty
    )::numeric, 3) as score,
    concat_ws(
      '; ',
      case
        when x.preference_kind = 'forbidden' then 'zakázané párování'
        when x.preference_kind = 'discouraged' then 'nevhodné párování'
        when x.preference_kind = 'preferred' then 'preferované párování vedením'
      end,
      case
        when x.wish_count >= 2 then 'vzájemné přání členů'
        when x.wish_count = 1 then 'přání jednoho člena'
      end,
      case
        when x.times_paired = 0 then 'dosud spolu netančili'
        else format(
          'společně tančili %s× v hodnoceném období',
          x.times_paired
        )
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

-- Shared readers keep their existing access and receive additive program data.
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

  select s.id into v_season_id
  from public.seasons s
  order by s.is_current desc, s.date_to desc
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
          'responseDeadline', e.response_deadline,
          'programs', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', epi.id,
                'name', coalesce(pc.name, epi.custom_name),
                'position', epi.position,
                'isCustom', epi.catalog_program_id is null
              ) order by epi.position
            )
            from public.event_program_items epi
            left join public.program_catalog pc on pc.id = epi.catalog_program_id
            where epi.event_id = e.id
          ), '[]'::jsonb)
        ) order by e.starts_at
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
        ) order by ms.display_name
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

-- Pair rows add block/program fields while legacy roundNumber remains present.
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
      'explanation', ep.explanation,
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

revoke execute on function public.set_my_event_response(
  uuid, public.event_response_status, text
) from public, anon;
revoke execute on function public.get_member_home() from public, anon;
revoke execute on function public.build_member_history(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_member_history() from public, anon;
revoke execute on function public.get_admin_member_history(uuid)
  from public, anon;
revoke execute on function public.get_member_leaderboard()
  from public, anon;
revoke execute on function public.get_pairing_candidate_scores(uuid, uuid)
  from public, anon;
revoke execute on function public.get_shared_overview()
  from public, anon;
revoke execute on function public.get_shared_event_pairs(uuid)
  from public, anon;

grant execute on function public.set_my_event_response(
  uuid, public.event_response_status, text
) to authenticated;
grant execute on function public.get_member_home() to authenticated;
grant execute on function public.get_member_history() to authenticated;
grant execute on function public.get_admin_member_history(uuid)
  to authenticated;
grant execute on function public.get_member_leaderboard()
  to authenticated;
grant execute on function public.get_pairing_candidate_scores(uuid, uuid)
  to authenticated;
grant execute on function public.get_shared_overview()
  to authenticated;
grant execute on function public.get_shared_event_pairs(uuid)
  to authenticated;
