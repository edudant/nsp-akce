-- NSP Akce: core domain schema.
-- All timestamps are stored as timestamptz and interpreted in Europe/Prague by the UI.

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('admin', 'recorder', 'member');
create type public.pairing_role as enum ('lead', 'follow');
create type public.experience_level as enum ('beginner', 'advanced', 'experienced');
create type public.event_type as enum ('rehearsal', 'performance');
create type public.event_status as enum ('draft', 'open', 'closed', 'cancelled');
create type public.event_visibility as enum ('public', 'shared', 'members', 'private');
create type public.event_response_status as enum ('unanswered', 'yes', 'no', 'maybe', 'substitute');
create type public.participant_status as enum ('invited', 'selected', 'substitute', 'declined');
create type public.attendance_status as enum ('unrecorded', 'full', 'partial', 'absent', 'excused');
create type public.pairing_preference_kind as enum ('forbidden', 'discouraged', 'preferred');
create type public.pairing_run_status as enum ('draft', 'published', 'superseded');

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  date_from date not null,
  date_to date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_valid_dates check (date_to >= date_from)
);

create unique index seasons_one_current_idx
  on public.seasons (is_current)
  where is_current;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  short_name text not null check (length(btrim(short_name)) between 1 and 80),
  pairing_role public.pairing_role not null,
  experience_level public.experience_level not null default 'advanced',
  active_from date,
  active_to date,
  is_active boolean not null default true,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_valid_active_dates check (
    active_to is null or active_from is null or active_to >= active_from
  )
);

create unique index members_display_name_ci_idx
  on public.members (lower(display_name));
create index members_active_role_idx
  on public.members (is_active, pairing_role, display_name);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  type public.event_type not null,
  title text not null check (length(btrim(title)) between 1 and 180),
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.event_status not null default 'draft',
  points_weight numeric(8,4) not null default 1,
  capacity integer,
  required_pairs integer,
  response_deadline timestamptz,
  visibility public.event_visibility not null default 'members',
  program text,
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_valid_times check (ends_at > starts_at),
  constraint events_valid_weight check (points_weight between 0 and 100),
  constraint events_valid_capacity check (capacity is null or capacity > 0),
  constraint events_valid_required_pairs check (required_pairs is null or required_pairs >= 0)
);

create index events_starts_at_idx on public.events (starts_at desc);
create index events_season_type_idx on public.events (season_id, type, starts_at);

create table public.event_responses (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  response public.event_response_status not null default 'unanswered',
  note text,
  responded_by uuid references auth.users(id) on delete set null default auth.uid(),
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create index event_responses_member_idx
  on public.event_responses (member_id, event_id);

create table public.event_participants (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  status public.participant_status not null default 'invited',
  selected_by uuid references auth.users(id) on delete set null default auth.uid(),
  selected_at timestamptz not null default now(),
  note text,
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create index event_participants_status_idx
  on public.event_participants (event_id, status, member_id);

create table public.attendance (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  status public.attendance_status not null default 'unrecorded',
  arrived_at timestamptz,
  left_at timestamptz,
  minutes_present integer,
  calculated_points numeric(10,4) not null default 0,
  points_override numeric(10,4),
  override_reason text,
  effective_points numeric(10,4)
    generated always as (coalesce(points_override, calculated_points)) stored,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id),
  constraint attendance_valid_times check (
    left_at is null or arrived_at is null or left_at >= arrived_at
  ),
  constraint attendance_valid_minutes check (
    minutes_present is null or minutes_present >= 0
  ),
  constraint attendance_valid_override check (
    (points_override is null and override_reason is null)
    or (
      points_override is not null
      and points_override between 0 and 100
      and length(btrim(override_reason)) >= 3
    )
  )
);

create index attendance_member_idx on public.attendance (member_id, event_id);
create index attendance_event_status_idx on public.attendance (event_id, status);

create table public.pairing_preferences (
  member_a_id uuid not null references public.members(id) on delete restrict,
  member_b_id uuid not null references public.members(id) on delete restrict,
  kind public.pairing_preference_kind not null,
  strength smallint not null default 3 check (strength between 1 and 5),
  valid_from date,
  valid_to date,
  private_reason text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_a_id, member_b_id),
  constraint pairing_preferences_distinct_members check (member_a_id <> member_b_id),
  constraint pairing_preferences_canonical_order check (member_a_id < member_b_id),
  constraint pairing_preferences_valid_dates check (
    valid_to is null or valid_from is null or valid_to >= valid_from
  )
);

create table public.pairing_rules (
  id smallint primary key default 1 check (id = 1),
  history_lookback_days integer not null default 365
    check (history_lookback_days between 1 and 3650),
  repeat_pair_penalty numeric(10,2) not null default 75,
  recent_pair_penalty numeric(10,2) not null default 100,
  beginner_beginner_penalty numeric(10,2) not null default 250,
  beginner_experienced_bonus numeric(10,2) not null default 75,
  discouraged_pair_penalty numeric(10,2) not null default 500,
  preferred_pair_bonus numeric(10,2) not null default 30,
  same_event_repeat_penalty numeric(10,2) not null default 500,
  unpaired_history_penalty numeric(10,2) not null default 20,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint pairing_rules_nonnegative_weights check (
    repeat_pair_penalty >= 0
    and recent_pair_penalty >= 0
    and beginner_beginner_penalty >= 0
    and beginner_experienced_bonus >= 0
    and discouraged_pair_penalty >= 0
    and preferred_pair_bonus >= 0
    and same_event_repeat_penalty >= 0
    and unpaired_history_penalty >= 0
  )
);

insert into public.pairing_rules (id) values (1);

create table public.pairing_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  seed bigint not null,
  algorithm_version text not null default 'mvp-v1'
    check (length(btrim(algorithm_version)) between 1 and 40),
  rules_snapshot jsonb not null default '{}'::jsonb,
  status public.pairing_run_status not null default 'draft',
  generated_by uuid references auth.users(id) on delete set null default auth.uid(),
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  note text,
  updated_at timestamptz not null default now()
);

create unique index pairing_runs_one_published_per_event_idx
  on public.pairing_runs (event_id)
  where status = 'published';
create index pairing_runs_event_idx
  on public.pairing_runs (event_id, generated_at desc);

create table public.event_pairs (
  id uuid primary key default gen_random_uuid(),
  pairing_run_id uuid not null references public.pairing_runs(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  member_a_id uuid not null references public.members(id) on delete restrict,
  member_b_id uuid not null references public.members(id) on delete restrict,
  is_locked boolean not null default false,
  is_confirmed_actual boolean not null default false,
  score numeric(12,3),
  explanation text not null default '',
  manual_change_reason text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_pairs_distinct_members check (member_a_id <> member_b_id),
  constraint event_pairs_manual_reason check (
    manual_change_reason is null or length(btrim(manual_change_reason)) >= 3
  ),
  unique (pairing_run_id, round_number, member_a_id, member_b_id)
);

create index event_pairs_run_round_idx
  on public.event_pairs (pairing_run_id, round_number);
create index event_pairs_member_a_idx on public.event_pairs (member_a_id);
create index event_pairs_member_b_idx on public.event_pairs (member_b_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_schema text not null,
  table_name text not null,
  record_id jsonb not null,
  old_data jsonb,
  new_data jsonb,
  change_reason text,
  request_id text,
  client_ip inet
);

create index audit_log_record_idx
  on public.audit_log (table_name, record_id, occurred_at desc);
create index audit_log_actor_idx
  on public.audit_log (actor_user_id, occurred_at desc);
create index audit_log_occurred_idx on public.audit_log (occurred_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.calculate_attendance_points()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_event_status public.event_status;
  v_weight numeric;
  v_planned_minutes integer;
  v_minutes integer;
begin
  select starts_at, ends_at, status, points_weight
    into v_starts_at, v_ends_at, v_event_status, v_weight
  from public.events
  where id = new.event_id;

  if not found then
    raise exception 'Událost neexistuje.';
  end if;

  v_planned_minutes := greatest(
    1,
    round(extract(epoch from (v_ends_at - v_starts_at)) / 60.0)::integer
  );

  case new.status
    when 'full' then
      new.minutes_present := v_planned_minutes;
      new.arrived_at := coalesce(new.arrived_at, v_starts_at);
      new.left_at := coalesce(new.left_at, v_ends_at);
    when 'partial' then
      if new.minutes_present is not null then
        v_minutes := new.minutes_present;
      elsif new.arrived_at is not null and new.left_at is not null then
        v_minutes := round(
          extract(
            epoch from (
              least(new.left_at, v_ends_at) - greatest(new.arrived_at, v_starts_at)
            )
          ) / 60.0
        )::integer;
      else
        raise exception 'Částečná účast vyžaduje počet minut nebo čas příchodu i odchodu.';
      end if;

      if v_minutes <= 0 or v_minutes > v_planned_minutes then
        raise exception 'Počet minut částečné účasti musí být 1 až %.', v_planned_minutes;
      end if;
      new.minutes_present := v_minutes;
    when 'unrecorded' then
      new.minutes_present := null;
      new.arrived_at := null;
      new.left_at := null;
    else
      new.minutes_present := 0;
      new.arrived_at := null;
      new.left_at := null;
  end case;

  if new.points_override is not null
     and (new.override_reason is null or length(btrim(new.override_reason)) < 3) then
    raise exception 'Ruční změna bodů vyžaduje důvod.';
  end if;

  if new.points_override is null then
    new.override_reason := null;
  end if;

  new.calculated_points := case
    when v_event_status = 'cancelled' or new.status in ('unrecorded', 'absent', 'excused')
      then 0
    else round(v_weight * new.minutes_present::numeric / v_planned_minutes::numeric, 4)
  end;

  if new.status <> 'unrecorded' and new.confirmed_at is null then
    new.confirmed_at := now();
    new.confirmed_by := coalesce(new.confirmed_by, auth.uid());
  end if;

  return new;
end;
$$;

create or replace function public.recalculate_event_attendance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    old.starts_at,
    old.ends_at,
    old.points_weight,
    old.status
  ) is distinct from (
    new.starts_at,
    new.ends_at,
    new.points_weight,
    new.status
  ) then
    update public.attendance
      set status = status
    where event_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.normalize_pairing_preference()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_member uuid;
begin
  if new.member_a_id = new.member_b_id then
    raise exception 'Člen nemůže mít párovací pravidlo sám se sebou.';
  end if;
  if new.member_a_id > new.member_b_id then
    v_member := new.member_a_id;
    new.member_a_id := new.member_b_id;
    new.member_b_id := v_member;
  end if;
  return new;
end;
$$;

create or replace function public.validate_event_pair()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role_a public.pairing_role;
  v_role_b public.pairing_role;
  v_member uuid;
  v_event_id uuid;
  v_event_date date;
begin
  select pairing_role into v_role_a from public.members where id = new.member_a_id;
  select pairing_role into v_role_b from public.members where id = new.member_b_id;

  if v_role_a is null or v_role_b is null then
    raise exception 'Jeden z členů páru neexistuje.';
  end if;
  if v_role_a = v_role_b then
    raise exception 'Pár musí obsahovat obě párovací role.';
  end if;

  if v_role_a = 'follow' then
    v_member := new.member_a_id;
    new.member_a_id := new.member_b_id;
    new.member_b_id := v_member;
  end if;

  select pr.event_id, e.starts_at::date
    into v_event_id, v_event_date
  from public.pairing_runs pr
  join public.events e on e.id = pr.event_id
  where pr.id = new.pairing_run_id;

  if exists (
    select 1
    from public.event_pairs ep
    where ep.pairing_run_id = new.pairing_run_id
      and ep.round_number = new.round_number
      and ep.id <> new.id
      and (
        ep.member_a_id in (new.member_a_id, new.member_b_id)
        or ep.member_b_id in (new.member_a_id, new.member_b_id)
      )
  ) then
    raise exception 'Člen může být v jednom kole nejvýše v jednom páru.';
  end if;

  if exists (
    select 1
    from public.pairing_preferences pp
    where pp.member_a_id = least(new.member_a_id, new.member_b_id)
      and pp.member_b_id = greatest(new.member_a_id, new.member_b_id)
      and pp.kind = 'forbidden'
      and (pp.valid_from is null or pp.valid_from <= v_event_date)
      and (pp.valid_to is null or pp.valid_to >= v_event_date)
  ) then
    raise exception 'Tento pár je zakázaný.';
  end if;

  if exists (
    select 1 from public.event_participants where event_id = v_event_id
  ) and (
    not exists (
      select 1 from public.event_participants
      where event_id = v_event_id
        and member_id = new.member_a_id
        and status = 'selected'
    )
    or not exists (
      select 1 from public.event_participants
      where event_id = v_event_id
        and member_id = new.member_b_id
        and status = 'selected'
    )
  ) then
    raise exception 'Pár lze vytvořit pouze z vybraných účastníků události.';
  end if;

  return new;
end;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_record_id jsonb := '{}'::jsonb;
  v_reason text;
  i integer;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_nargs = 0 then
    v_record_id := jsonb_build_object('id', v_row -> 'id');
  else
    for i in 0..tg_nargs - 1 loop
      v_record_id := v_record_id || jsonb_build_object(tg_argv[i], v_row -> tg_argv[i]);
    end loop;
  end if;

  v_reason := coalesce(
    v_row ->> 'override_reason',
    v_row ->> 'manual_change_reason',
    v_row ->> 'note'
  );

  insert into public.audit_log (
    actor_user_id,
    action,
    table_schema,
    table_name,
    record_id,
    old_data,
    new_data,
    change_reason,
    request_id
  )
  values (
    auth.uid(),
    tg_op,
    tg_table_schema,
    tg_table_name,
    v_record_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    v_reason,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger seasons_set_updated_at
before update on public.seasons
for each row execute function public.set_updated_at();
create trigger members_set_updated_at
before update on public.members
for each row execute function public.set_updated_at();
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();
create trigger event_responses_set_updated_at
before update on public.event_responses
for each row execute function public.set_updated_at();
create trigger event_participants_set_updated_at
before update on public.event_participants
for each row execute function public.set_updated_at();
create trigger attendance_set_updated_at
before update on public.attendance
for each row execute function public.set_updated_at();
create trigger pairing_preferences_set_updated_at
before update on public.pairing_preferences
for each row execute function public.set_updated_at();
create trigger pairing_runs_set_updated_at
before update on public.pairing_runs
for each row execute function public.set_updated_at();
create trigger event_pairs_set_updated_at
before update on public.event_pairs
for each row execute function public.set_updated_at();

create trigger attendance_calculate_points
before insert or update on public.attendance
for each row execute function public.calculate_attendance_points();
create trigger events_recalculate_attendance
after update on public.events
for each row execute function public.recalculate_event_attendance();
create trigger pairing_preferences_normalize
before insert or update on public.pairing_preferences
for each row execute function public.normalize_pairing_preference();
create trigger event_pairs_validate
before insert or update on public.event_pairs
for each row execute function public.validate_event_pair();

create trigger seasons_audit
after insert or update or delete on public.seasons
for each row execute function public.write_audit_log('id');
create trigger members_audit
after insert or update or delete on public.members
for each row execute function public.write_audit_log('id');
create trigger events_audit
after insert or update or delete on public.events
for each row execute function public.write_audit_log('id');
create trigger event_responses_audit
after insert or update or delete on public.event_responses
for each row execute function public.write_audit_log('event_id', 'member_id');
create trigger event_participants_audit
after insert or update or delete on public.event_participants
for each row execute function public.write_audit_log('event_id', 'member_id');
create trigger attendance_audit
after insert or update or delete on public.attendance
for each row execute function public.write_audit_log('event_id', 'member_id');
create trigger pairing_preferences_audit
after insert or update or delete on public.pairing_preferences
for each row execute function public.write_audit_log('member_a_id', 'member_b_id');
create trigger pairing_rules_audit
after insert or update or delete on public.pairing_rules
for each row execute function public.write_audit_log('id');
create trigger pairing_runs_audit
after insert or update or delete on public.pairing_runs
for each row execute function public.write_audit_log('id');
create trigger event_pairs_audit
after insert or update or delete on public.event_pairs
for each row execute function public.write_audit_log('id');

