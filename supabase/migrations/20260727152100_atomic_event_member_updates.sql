-- Keep attendance, availability and cast selection consistent per UI action.

create function public.update_event_member_state(
  target_event_id uuid,
  target_member_id uuid,
  new_attendance_status public.attendance_status default null,
  set_minutes boolean default false,
  new_minutes_present integer default null,
  new_response public.event_response_status default null,
  new_selected boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Záznam může měnit pouze vedení souboru.';
  end if;
  if not exists (select 1 from public.events where id = target_event_id) then
    raise exception 'Událost neexistuje.';
  end if;
  if not exists (select 1 from public.members where id = target_member_id) then
    raise exception 'Člen neexistuje.';
  end if;

  if new_attendance_status is not null or set_minutes then
    insert into public.attendance (
      event_id,
      member_id,
      status,
      minutes_present,
      confirmed_by,
      confirmed_at
    )
    values (
      target_event_id,
      target_member_id,
      coalesce(new_attendance_status, 'unrecorded'::public.attendance_status),
      case when set_minutes then new_minutes_present else null end,
      auth.uid(),
      now()
    )
    on conflict (event_id, member_id) do update
      set status = coalesce(new_attendance_status, public.attendance.status),
          minutes_present = case
            when set_minutes then new_minutes_present
            else public.attendance.minutes_present
          end,
          confirmed_by = auth.uid(),
          confirmed_at = now();
  end if;

  if new_response is not null then
    insert into public.event_responses (
      event_id,
      member_id,
      response,
      responded_by,
      responded_at
    )
    values (
      target_event_id,
      target_member_id,
      new_response,
      auth.uid(),
      now()
    )
    on conflict (event_id, member_id) do update
      set response = excluded.response,
          responded_by = auth.uid(),
          responded_at = now();
  end if;

  if new_selected is not null then
    insert into public.event_participants (
      event_id,
      member_id,
      status,
      selected_by,
      selected_at
    )
    values (
      target_event_id,
      target_member_id,
      case
        when new_selected then 'selected'::public.participant_status
        else 'invited'::public.participant_status
      end,
      auth.uid(),
      now()
    )
    on conflict (event_id, member_id) do update
      set status = excluded.status,
          selected_by = auth.uid(),
          selected_at = now();
  end if;
end;
$$;

create function public.update_all_event_attendance(
  target_event_id uuid,
  new_attendance_status public.attendance_status
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration_minutes integer;
  v_count integer;
begin
  if not public.is_staff() then
    raise exception 'Docházku může měnit pouze vedení souboru.';
  end if;

  select greatest(
    1,
    round(extract(epoch from (ends_at - starts_at)) / 60)::integer
  )
  into v_duration_minutes
  from public.events
  where id = target_event_id;

  if not found then
    raise exception 'Událost neexistuje.';
  end if;

  insert into public.attendance (
    event_id,
    member_id,
    status,
    minutes_present,
    confirmed_by,
    confirmed_at
  )
  select
    target_event_id,
    m.id,
    new_attendance_status,
    case
      when new_attendance_status = 'partial'
        then greatest(1, round(v_duration_minutes / 2.0)::integer)
      else null
    end,
    auth.uid(),
    now()
  from public.members m
  where m.is_active
  on conflict (event_id, member_id) do update
    set status = excluded.status,
        minutes_present = excluded.minutes_present,
        confirmed_by = auth.uid(),
        confirmed_at = now();

  get diagnostics v_count = row_count;

  insert into public.event_participants (
    event_id,
    member_id,
    status,
    selected_by,
    selected_at
  )
  select
    target_event_id,
    m.id,
    case
      when new_attendance_status in ('full', 'partial')
        then 'selected'::public.participant_status
      else 'invited'::public.participant_status
    end,
    auth.uid(),
    now()
  from public.members m
  where m.is_active
  on conflict (event_id, member_id) do update
    set status = excluded.status,
        selected_by = auth.uid(),
        selected_at = now();

  return v_count;
end;
$$;

revoke all on function public.update_event_member_state(
  uuid,
  uuid,
  public.attendance_status,
  boolean,
  integer,
  public.event_response_status,
  boolean
) from public, anon;
grant execute on function public.update_event_member_state(
  uuid,
  uuid,
  public.attendance_status,
  boolean,
  integer,
  public.event_response_status,
  boolean
) to authenticated;

revoke all on function public.update_all_event_attendance(
  uuid,
  public.attendance_status
) from public, anon;
grant execute on function public.update_all_event_attendance(
  uuid,
  public.attendance_status
) to authenticated;
