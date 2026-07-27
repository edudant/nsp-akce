-- Authentication profiles, role-based access, first-admin allowlist and
-- short-lived shared read-only sessions.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_id uuid unique references public.members(id) on delete set null,
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.admin_email_allowlist (
  email text primary key,
  is_active boolean not null default true,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  note text,
  constraint admin_email_allowlist_lowercase check (email = lower(email)),
  constraint admin_email_allowlist_email_shape check (
    email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

create table public.shared_access_config (
  id smallint primary key default 1 check (id = 1),
  code_hash text,
  is_enabled boolean not null default false,
  session_duration_minutes integer not null default 480
    check (session_duration_minutes between 15 and 1440),
  rotated_by uuid references auth.users(id) on delete set null,
  rotated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint shared_access_enabled_has_hash check (not is_enabled or code_hash is not null)
);

insert into public.shared_access_config (id) values (1);

create table public.shared_access_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  constraint shared_access_session_valid_expiry check (expires_at > verified_at)
);

create table public.shared_access_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempt_count smallint not null default 0 check (attempt_count >= 0)
);

create or replace function public.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = required_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin'::public.app_role);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin'::public.app_role)
      or public.has_role('recorder'::public.app_role);
$$;

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.member_id
  from public.profiles p
  where p.user_id = auth.uid();
$$;

create or replace function public.has_active_shared_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.shared_access_sessions s
    where s.user_id = auth.uid()
      and s.expires_at > now()
  );
$$;

create or replace function public.get_my_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(ur.role order by ur.role), '{}'::public.app_role[])
  from public.user_roles ur
  where ur.user_id = auth.uid();
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_is_admin boolean := false;
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Uživatel'
  );

  insert into public.profiles (user_id, display_name)
  values (new.id, v_display_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name;

  if not coalesce(new.is_anonymous, false) then
    select exists (
      select 1
      from public.admin_email_allowlist a
      where a.email = v_email
        and a.is_active
    ) into v_is_admin;

    if v_is_admin then
      insert into public.user_roles (user_id, role)
      values (new.id, 'admin'::public.app_role)
      on conflict do nothing;

      update public.admin_email_allowlist
      set claimed_by = new.id,
          claimed_at = now()
      where email = v_email;
    end if;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.guard_attendance_override()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and not public.is_admin()
     and (
       new.points_override is distinct from case when tg_op = 'INSERT' then null else old.points_override end
       or new.override_reason is distinct from case when tg_op = 'INSERT' then null else old.override_reason end
     ) then
    raise exception 'Ruční změnu bodů může provést pouze administrátor.';
  end if;
  return new;
end;
$$;

create trigger attendance_guard_override
before insert or update on public.attendance
for each row execute function public.guard_attendance_override();

create or replace function public.guard_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and (select count(*) from public.user_roles where role = 'admin') <= 1 then
    raise exception 'Nelze odebrat poslední administrátorskou roli.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger user_roles_guard_last_admin
before update or delete on public.user_roles
for each row execute function public.guard_last_admin();

create or replace function public.rotate_shared_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'Pouze administrátor může změnit sdílený kód.';
  end if;

  v_code := translate(
    encode(extensions.gen_random_bytes(15), 'base64'),
    '+/=',
    '-_'
  );

  update public.shared_access_config
  set code_hash = extensions.crypt(v_code, extensions.gen_salt('bf', 12)),
      is_enabled = true,
      rotated_by = auth.uid(),
      rotated_at = now(),
      updated_at = now()
  where id = 1;

  delete from public.shared_access_sessions;
  return v_code;
end;
$$;

create or replace function public.set_shared_access_enabled(enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Pouze administrátor může měnit sdílený přístup.';
  end if;
  if enabled and not exists (
    select 1 from public.shared_access_config where id = 1 and code_hash is not null
  ) then
    raise exception 'Nejprve vygenerujte sdílený kód.';
  end if;

  update public.shared_access_config
  set is_enabled = enabled,
      updated_at = now()
  where id = 1;

  if not enabled then
    delete from public.shared_access_sessions;
  end if;
end;
$$;

create or replace function public.verify_shared_code(code text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.shared_access_config%rowtype;
  v_attempt public.shared_access_attempts%rowtype;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Pro ověření sdíleného kódu je nutná anonymní Auth relace.';
  end if;

  insert into public.shared_access_attempts (user_id, window_started_at, attempt_count)
  values (auth.uid(), now(), 1)
  on conflict (user_id) do update
    set window_started_at = case
          when public.shared_access_attempts.window_started_at <= now() - interval '1 minute'
            then now()
          else public.shared_access_attempts.window_started_at
        end,
        attempt_count = case
          when public.shared_access_attempts.window_started_at <= now() - interval '1 minute'
            then 1
          else public.shared_access_attempts.attempt_count + 1
        end
  returning * into v_attempt;

  if v_attempt.attempt_count > 5 then
    return null;
  end if;

  select * into v_config
  from public.shared_access_config
  where id = 1;

  if not coalesce(v_config.is_enabled, false)
     or v_config.code_hash is null
     or code is null
     or length(code) > 200 then
    return null;
  end if;

  if extensions.crypt(code, v_config.code_hash) <> v_config.code_hash then
    -- Returning NULL instead of raising is intentional: a raised exception
    -- would roll back the attempt counter and defeat rate limiting.
    return null;
  end if;

  v_expires_at := now() + make_interval(mins => v_config.session_duration_minutes);

  insert into public.shared_access_sessions (user_id, verified_at, expires_at, last_seen_at)
  values (auth.uid(), now(), v_expires_at, now())
  on conflict (user_id) do update
    set verified_at = excluded.verified_at,
        expires_at = excluded.expires_at,
        last_seen_at = excluded.last_seen_at;

  delete from public.shared_access_attempts where user_id = auth.uid();
  return v_expires_at;
end;
$$;

create or replace function public.end_shared_session()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.shared_access_sessions where user_id = auth.uid();
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
create trigger shared_access_config_audit
after insert or update or delete on public.shared_access_config
for each row execute function public.write_audit_log('id');
create trigger profiles_audit
after insert or update or delete on public.profiles
for each row execute function public.write_audit_log('user_id');
create trigger user_roles_audit
after insert or update or delete on public.user_roles
for each row execute function public.write_audit_log('user_id', 'role');
create trigger admin_email_allowlist_audit
after insert or update or delete on public.admin_email_allowlist
for each row execute function public.write_audit_log('email');

alter table public.seasons enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.event_responses enable row level security;
alter table public.event_participants enable row level security;
alter table public.attendance enable row level security;
alter table public.pairing_preferences enable row level security;
alter table public.pairing_rules enable row level security;
alter table public.pairing_runs enable row level security;
alter table public.event_pairs enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.admin_email_allowlist enable row level security;
alter table public.shared_access_config enable row level security;
alter table public.shared_access_sessions enable row level security;
alter table public.shared_access_attempts enable row level security;
alter table public.audit_log enable row level security;

create policy seasons_authenticated_select
on public.seasons for select to authenticated
using (true);
create policy seasons_admin_all
on public.seasons for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy members_staff_select
on public.members for select to authenticated
using (public.is_staff());
create policy members_self_select
on public.members for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and id = public.current_member_id()
);
create policy members_admin_all
on public.members for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy events_staff_select
on public.events for select to authenticated
using (public.is_staff());
create policy events_member_select
on public.events for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and status <> 'draft'
  and visibility in ('public', 'members')
);
create policy events_admin_all
on public.events for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy event_responses_staff_all
on public.event_responses for all to authenticated
using (public.is_staff())
with check (public.is_staff());
create policy event_responses_member_select
on public.event_responses for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
);
create policy event_responses_member_insert
on public.event_responses for insert to authenticated
with check (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
);
create policy event_responses_member_update
on public.event_responses for update to authenticated
using (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
)
with check (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
);

create policy event_participants_staff_all
on public.event_participants for all to authenticated
using (public.is_staff())
with check (public.is_staff());
create policy event_participants_member_select
on public.event_participants for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
);

create policy attendance_staff_all
on public.attendance for all to authenticated
using (public.is_staff())
with check (public.is_staff());
create policy attendance_member_select
on public.attendance for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
);

create policy pairing_preferences_admin_all
on public.pairing_preferences for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy pairing_rules_staff_select
on public.pairing_rules for select to authenticated
using (public.is_staff());
create policy pairing_rules_admin_all
on public.pairing_rules for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy pairing_runs_staff_all
on public.pairing_runs for all to authenticated
using (public.is_staff())
with check (public.is_staff());
create policy pairing_runs_member_select
on public.pairing_runs for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and status = 'published'
);

create policy event_pairs_staff_all
on public.event_pairs for all to authenticated
using (public.is_staff())
with check (public.is_staff());
create policy event_pairs_member_select
on public.event_pairs for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and exists (
    select 1
    from public.pairing_runs pr
    where pr.id = pairing_run_id
      and pr.status = 'published'
  )
);

create policy profiles_self_select
on public.profiles for select to authenticated
using (user_id = auth.uid());
create policy profiles_admin_all
on public.profiles for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy user_roles_self_select
on public.user_roles for select to authenticated
using (user_id = auth.uid());
create policy user_roles_admin_all
on public.user_roles for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy admin_email_allowlist_admin_all
on public.admin_email_allowlist for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy shared_access_config_admin_all
on public.shared_access_config for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy audit_log_admin_select
on public.audit_log for select to authenticated
using (public.is_admin());

revoke all on all tables in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.seasons,
  public.members,
  public.events,
  public.event_responses,
  public.event_participants,
  public.attendance,
  public.pairing_preferences,
  public.pairing_rules,
  public.pairing_runs,
  public.event_pairs,
  public.profiles,
  public.user_roles,
  public.admin_email_allowlist,
  public.shared_access_config
to authenticated;
grant select on public.audit_log to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;

revoke all on function public.has_role(public.app_role) from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_staff() from public;
revoke all on function public.current_member_id() from public;
revoke all on function public.has_active_shared_session() from public;
revoke all on function public.get_my_roles() from public;
revoke all on function public.rotate_shared_code() from public;
revoke all on function public.set_shared_access_enabled(boolean) from public;
revoke all on function public.verify_shared_code(text) from public;
revoke all on function public.end_shared_session() from public;

grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.has_active_shared_session() to authenticated;
grant execute on function public.get_my_roles() to authenticated;
grant execute on function public.rotate_shared_code() to authenticated;
grant execute on function public.set_shared_access_enabled(boolean) to authenticated;
grant execute on function public.verify_shared_code(text) to authenticated;
grant execute on function public.end_shared_session() to authenticated;
