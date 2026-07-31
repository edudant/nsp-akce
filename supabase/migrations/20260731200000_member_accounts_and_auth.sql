-- Member-owned accounts, two-role authorization and invitation audit metadata.
-- This migration is additive: existing staff accounts and shared-code sessions
-- remain valid while members can be linked to Auth by an administrator.

create table public.member_accounts (
  member_id uuid primary key references public.members(id) on delete cascade,
  email text not null unique,
  desired_role public.app_role not null default 'member',
  linked_user_id uuid unique references auth.users(id) on delete set null,
  activated_at timestamptz,
  last_sign_in_at timestamptz,
  last_invitation_sent_at timestamptz,
  invitation_count integer not null default 0 check (invitation_count >= 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_accounts_supported_role check (
    desired_role in ('member'::public.app_role, 'admin'::public.app_role)
  ),
  constraint member_accounts_normalized_email check (
    email = lower(btrim(email))
  ),
  constraint member_accounts_email_shape check (
    email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

create table public.member_invitation_deliveries (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  sent_by uuid references auth.users(id) on delete set null default auth.uid(),
  sent_at timestamptz not null default now(),
  provider_message_id text,
  created_at timestamptz not null default now(),
  constraint member_invitation_provider_id_length check (
    provider_message_id is null or length(provider_message_id) <= 500
  )
);

create index member_accounts_linked_user_idx
  on public.member_accounts (linked_user_id)
  where linked_user_id is not null;
create index member_invitation_deliveries_member_idx
  on public.member_invitation_deliveries (member_id, sent_at desc);

create trigger member_accounts_set_updated_at
before update on public.member_accounts
for each row execute function public.set_updated_at();

create trigger member_accounts_audit
after insert or update or delete on public.member_accounts
for each row execute function public.write_audit_log('member_id');

create trigger member_invitation_deliveries_audit
after insert or update or delete on public.member_invitation_deliveries
for each row execute function public.write_audit_log('id');

alter table public.member_accounts enable row level security;
alter table public.member_invitation_deliveries enable row level security;

create policy member_accounts_admin_select
on public.member_accounts for select to authenticated
using (public.is_admin());

create policy member_invitation_deliveries_admin_select
on public.member_invitation_deliveries for select to authenticated
using (public.is_admin());

revoke all on public.member_accounts from public, anon, authenticated;
revoke all on public.member_invitation_deliveries from public, anon, authenticated;
revoke all on sequence public.member_invitation_deliveries_id_seq
  from public, anon, authenticated;
grant select on public.member_accounts to authenticated;
grant select on public.member_invitation_deliveries to authenticated;

-- Preserve any already-linked member accounts. This does not create accounts
-- for members without an e-mail and does not alter member or event data.
insert into public.member_accounts (
  member_id,
  email,
  desired_role,
  linked_user_id,
  activated_at,
  last_sign_in_at
)
select
  p.member_id,
  lower(btrim(u.email)),
  case
    when exists (
      select 1
      from public.user_roles ur
      where ur.user_id = u.id
        and ur.role in ('admin'::public.app_role, 'recorder'::public.app_role)
    ) then 'admin'::public.app_role
    else 'member'::public.app_role
  end,
  u.id,
  coalesce(u.confirmed_at, u.created_at),
  u.last_sign_in_at
from public.profiles p
join auth.users u on u.id = p.user_id
where p.member_id is not null
  and not coalesce(u.is_anonymous, false)
  and nullif(btrim(u.email), '') is not null
on conflict do nothing;

-- Recorder is retained in the enum only for migration compatibility. All
-- existing grants become administrator grants and new code treats staff as
-- administrators.
insert into public.user_roles (user_id, role, granted_by, granted_at)
select ur.user_id, 'admin'::public.app_role, ur.granted_by, ur.granted_at
from public.user_roles ur
where ur.role = 'recorder'::public.app_role
on conflict (user_id, role) do nothing;

delete from public.user_roles
where role = 'recorder'::public.app_role;

create or replace function public.guard_supported_app_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'recorder'::public.app_role then
    raise exception 'Role zapisovatele už není podporovaná.';
  end if;
  return new;
end;
$$;

create trigger user_roles_guard_supported_role
before insert or update on public.user_roles
for each row execute function public.guard_supported_app_role();

-- Role writes now go through member-account synchronization. Direct reads are
-- retained for the current user and administrators through existing RLS.
revoke insert, update, delete on public.user_roles from authenticated;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin();
$$;

create or replace function public.get_my_roles()
returns public.app_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(ur.role order by ur.role),
    '{}'::public.app_role[]
  )
  from public.user_roles ur
  where ur.user_id = auth.uid()
    and ur.role in ('member'::public.app_role, 'admin'::public.app_role);
$$;

-- Synchronize one Auth identity with the authoritative member-account row.
-- Keeping this logic in one function makes inserts, e-mail changes, sign-ins
-- and member activation changes behave identically.
create or replace function public.sync_auth_user_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_email text;
  v_account public.member_accounts%rowtype;
  v_member_active boolean := false;
  v_has_account boolean := false;
  v_display_name text;
  v_allowlisted_admin boolean := false;
begin
  select * into v_user
  from auth.users u
  where u.id = target_user_id;

  if not found then
    return;
  end if;

  v_email := lower(nullif(btrim(v_user.email), ''));
  v_display_name := coalesce(
    nullif(btrim(v_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(v_user.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
    'Uživatel'
  );

  insert into public.profiles (user_id, display_name)
  values (v_user.id, v_display_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name;

  if coalesce(v_user.is_anonymous, false) then
    return;
  end if;

  if v_email is not null then
    select ma.* into v_account
    from public.member_accounts ma
    where ma.email = v_email
    for update of ma;
    v_has_account := found;

    if v_has_account then
      select m.is_active into v_member_active
      from public.members m
      where m.id = v_account.member_id;
    end if;
  end if;

  if v_has_account then
    if v_account.linked_user_id is not null
       and v_account.linked_user_id <> v_user.id then
      raise exception 'Tento členský e-mail je již propojený s jiným účtem.';
    end if;

    update public.member_accounts
    set linked_user_id = v_user.id,
        activated_at = coalesce(
          activated_at,
          v_user.confirmed_at,
          v_user.last_sign_in_at
        ),
        last_sign_in_at = coalesce(v_user.last_sign_in_at, last_sign_in_at)
    where member_id = v_account.member_id;

    -- An Auth identity may be attached to at most one member account.
    update public.member_accounts
    set linked_user_id = null,
        activated_at = null,
        last_sign_in_at = null
    where linked_user_id = v_user.id
      and member_id <> v_account.member_id;

    update public.profiles p
    set member_id = v_account.member_id,
        display_name = (
          select m.display_name from public.members m
          where m.id = v_account.member_id
        )
    where p.user_id = v_user.id;

    if v_member_active then
      insert into public.user_roles (user_id, role)
      values (v_user.id, 'member'::public.app_role)
      on conflict do nothing;

      if v_account.desired_role = 'admin'::public.app_role then
        insert into public.user_roles (user_id, role)
        values (v_user.id, 'admin'::public.app_role)
        on conflict do nothing;
      else
        delete from public.user_roles
        where user_id = v_user.id
          and role = 'admin'::public.app_role;
      end if;
    else
      delete from public.user_roles
      where user_id = v_user.id
        and role in ('member'::public.app_role, 'admin'::public.app_role);
    end if;

    delete from public.user_roles
    where user_id = v_user.id
      and role = 'recorder'::public.app_role;
    return;
  end if;

  -- Keep the original bootstrap allowlist working for administrators who are
  -- not dancers and therefore have no member record.
  select exists (
    select 1
    from public.admin_email_allowlist a
    where a.email = v_email
      and a.is_active
  ) into v_allowlisted_admin;

  update public.member_accounts
  set linked_user_id = null,
      activated_at = null,
      last_sign_in_at = null
  where linked_user_id = v_user.id;

  update public.profiles
  set member_id = null
  where user_id = v_user.id;

  delete from public.user_roles
  where user_id = v_user.id
    and role in ('member'::public.app_role, 'recorder'::public.app_role);

  if v_allowlisted_admin then
    insert into public.user_roles (user_id, role)
    values (v_user.id, 'admin'::public.app_role)
    on conflict do nothing;

    update public.admin_email_allowlist
    set claimed_by = v_user.id,
        claimed_at = coalesce(claimed_at, now())
    where email = v_email;
  else
    delete from public.user_roles
    where user_id = v_user.id
      and role = 'admin'::public.app_role;
  end if;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_auth_user_account(new.id);
  return new;
end;
$$;

create or replace function public.handle_auth_user_account_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_auth_user_account(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_account_changed on auth.users;
create trigger on_auth_user_account_changed
after update of email, confirmed_at, last_sign_in_at on auth.users
for each row
when (
  old.email is distinct from new.email
  or old.confirmed_at is distinct from new.confirmed_at
  or old.last_sign_in_at is distinct from new.last_sign_in_at
)
execute function public.handle_auth_user_account_change();

create or replace function public.handle_member_active_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if old.is_active is distinct from new.is_active then
    select ma.linked_user_id into v_user_id
    from public.member_accounts ma
    where ma.member_id = new.id;

    if v_user_id is not null then
      perform public.sync_auth_user_account(v_user_id);
    end if;
  end if;
  return new;
end;
$$;

create trigger members_sync_account_after_active_change
after update of is_active on public.members
for each row execute function public.handle_member_active_change();

-- The member-account row is the authorization source. A stale profile alone
-- can no longer grant member access after an e-mail change or deactivation.
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ma.member_id
  from public.member_accounts ma
  join public.members m on m.id = ma.member_id
  join public.profiles p
    on p.user_id = ma.linked_user_id
   and p.member_id = ma.member_id
  where ma.linked_user_id = auth.uid()
    and m.is_active
  limit 1;
$$;

-- Before-user-created Auth hook: keep anonymous shared sessions and allow
-- only a configured, active member or the legacy bootstrap admin.
create or replace function public.hook_allow_staff_or_anonymous_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_anonymous boolean :=
    coalesce((event -> 'user' ->> 'is_anonymous')::boolean, false);
  v_email text :=
    lower(nullif(btrim(event -> 'user' ->> 'email'), ''));
begin
  if v_is_anonymous then
    return '{}'::jsonb;
  end if;

  if v_email is not null and (
    exists (
      select 1
      from public.member_accounts ma
      join public.members m on m.id = ma.member_id
      where ma.email = v_email
        and m.is_active
    )
    or exists (
      select 1
      from public.admin_email_allowlist a
      where a.email = v_email
        and a.is_active
    )
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'Přihlášení se nepodařilo. Zkontrolujte e-mail nebo to zkuste později.'
    )
  );
end;
$$;

create or replace function public.get_member_session_context()
returns jsonb
language plpgsql
stable
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

  select jsonb_build_object(
    'memberId', m.id,
    'displayName', m.display_name,
    'shortName', m.short_name,
    'pairingRole', m.pairing_role,
    'experienceLevel', m.experience_level,
    'email', ma.email,
    'roles', public.get_my_roles(),
    'isAdmin', public.is_admin(),
    'activatedAt', ma.activated_at,
    'lastSignInAt', ma.last_sign_in_at
  ) into v_result
  from public.members m
  join public.member_accounts ma on ma.member_id = m.id
  where m.id = v_member_id;

  return v_result;
end;
$$;

create or replace function public.get_admin_member_accounts()
returns table (
  member_id uuid,
  display_name text,
  is_active boolean,
  email text,
  desired_role public.app_role,
  linked_user_id uuid,
  last_invitation_sent_at timestamptz,
  last_sign_in_at timestamptz,
  account_activated_at timestamptz,
  invitation_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Účty členů může zobrazit pouze administrátor.';
  end if;

  return query
  select
    m.id,
    m.display_name,
    m.is_active,
    ma.email,
    ma.desired_role,
    ma.linked_user_id,
    ma.last_invitation_sent_at,
    ma.last_sign_in_at,
    ma.activated_at,
    coalesce(ma.invitation_count, 0)
  from public.members m
  left join public.member_accounts ma on ma.member_id = m.id
  order by m.display_name;
end;
$$;

create or replace function public.upsert_member_account(
  target_member_id uuid,
  new_email text,
  new_role public.app_role default 'member'::public.app_role
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(nullif(btrim(new_email), ''));
  v_old public.member_accounts%rowtype;
  v_auth_user_id uuid;
  v_result jsonb;
  v_had_old boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Účty členů může měnit pouze administrátor.';
  end if;
  if new_role not in ('member'::public.app_role, 'admin'::public.app_role) then
    raise exception 'Podporované role jsou pouze uživatel a správce.';
  end if;
  if not exists (select 1 from public.members m where m.id = target_member_id) then
    raise exception 'Člen neexistuje.';
  end if;
  if v_email is not null
     and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'E-mail nemá platný formát.';
  end if;

  select * into v_old
  from public.member_accounts ma
  where ma.member_id = target_member_id
  for update;
  v_had_old := found;

  if v_email is null then
    if v_had_old and v_old.linked_user_id is not null then
      update public.profiles
      set member_id = null
      where user_id = v_old.linked_user_id
        and member_id = target_member_id;

      delete from public.user_roles
      where user_id = v_old.linked_user_id
        and role in ('member'::public.app_role, 'admin'::public.app_role);
    end if;

    delete from public.member_accounts
    where member_id = target_member_id;

    return jsonb_build_object(
      'memberId', target_member_id,
      'email', null,
      'desiredRole', new_role,
      'linkedUserId', null
    );
  end if;

  if v_had_old
     and v_old.email is distinct from v_email
     and v_old.linked_user_id is not null then
    update public.profiles
    set member_id = null
    where user_id = v_old.linked_user_id
      and member_id = target_member_id;

    delete from public.user_roles
    where user_id = v_old.linked_user_id
      and role in ('member'::public.app_role, 'admin'::public.app_role);
  end if;

  insert into public.member_accounts (
    member_id,
    email,
    desired_role,
    linked_user_id,
    activated_at,
    last_sign_in_at,
    created_by
  )
  values (
    target_member_id,
    v_email,
    new_role,
    case when v_had_old and v_old.email = v_email then v_old.linked_user_id end,
    case when v_had_old and v_old.email = v_email then v_old.activated_at end,
    case when v_had_old and v_old.email = v_email then v_old.last_sign_in_at end,
    auth.uid()
  )
  on conflict (member_id) do update
    set email = excluded.email,
        desired_role = excluded.desired_role,
        linked_user_id = excluded.linked_user_id,
        activated_at = excluded.activated_at,
        last_sign_in_at = excluded.last_sign_in_at;

  select u.id into v_auth_user_id
  from auth.users u
  where lower(u.email) = v_email
    and not coalesce(u.is_anonymous, false)
  order by u.created_at
  limit 1;

  if v_auth_user_id is not null then
    perform public.sync_auth_user_account(v_auth_user_id);
  end if;

  select jsonb_build_object(
    'memberId', ma.member_id,
    'email', ma.email,
    'desiredRole', ma.desired_role,
    'linkedUserId', ma.linked_user_id,
    'activatedAt', ma.activated_at,
    'lastSignInAt', ma.last_sign_in_at
  ) into v_result
  from public.member_accounts ma
  where ma.member_id = target_member_id;

  return v_result;
exception
  when unique_violation then
    raise exception 'Tento e-mail už používá jiný člen.';
end;
$$;

-- SQL cannot deliver SMTP safely. The client/Edge Function first calls this
-- authorization + rate-limit check and confirms only after the provider has
-- accepted the message via confirm_member_invitation_sent().
create or replace function public.send_member_invitation(target_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.member_accounts%rowtype;
  v_name text;
  v_active boolean;
  v_retry_after integer;
begin
  if not public.is_admin() then
    raise exception 'Pozvánku může poslat pouze administrátor.';
  end if;

  select ma.* into v_account
  from public.member_accounts ma
  where ma.member_id = target_member_id
  for update of ma;

  if not found then
    raise exception 'Člen zatím nemá uložený e-mail.';
  end if;

  select m.display_name, m.is_active
    into v_name, v_active
  from public.members m
  where m.id = target_member_id;
  if not v_active then
    raise exception 'Neaktivnímu členovi nelze poslat pozvánku.';
  end if;
  if v_account.activated_at is not null then
    raise exception 'Členský účet už je aktivní.';
  end if;

  v_retry_after := case
    when v_account.last_invitation_sent_at is null then 0
    else greatest(
      0,
      ceil(extract(epoch from (
        v_account.last_invitation_sent_at + interval '60 seconds' - now()
      )))::integer
    )
  end;

  if v_retry_after > 0 then
    raise exception 'Novou pozvánku lze poslat za % sekund.', v_retry_after;
  end if;

  return jsonb_build_object(
    'memberId', v_account.member_id,
    'displayName', v_name,
    'email', v_account.email,
    'retryAfterSeconds', 0
  );
end;
$$;

create or replace function public.confirm_member_invitation_sent(
  target_member_id uuid,
  provider_message_id text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent_at timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'Odeslání pozvánky může potvrdit pouze administrátor.';
  end if;
  if provider_message_id is not null and length(provider_message_id) > 500 then
    raise exception 'Identifikátor zprávy je příliš dlouhý.';
  end if;

  update public.member_accounts
  set last_invitation_sent_at = v_sent_at,
      invitation_count = invitation_count + 1
  where member_id = target_member_id;

  if not found then
    raise exception 'Členský účet neexistuje.';
  end if;

  insert into public.member_invitation_deliveries (
    member_id,
    sent_by,
    sent_at,
    provider_message_id
  )
  values (
    target_member_id,
    auth.uid(),
    v_sent_at,
    nullif(btrim(provider_message_id), '')
  );

  return v_sent_at;
end;
$$;

revoke execute on function public.sync_auth_user_account(uuid)
  from public, anon, authenticated;
revoke execute on function public.guard_supported_app_role()
  from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user()
  from public, anon, authenticated;
revoke execute on function public.handle_auth_user_account_change()
  from public, anon, authenticated;
revoke execute on function public.handle_member_active_change()
  from public, anon, authenticated;
revoke execute on function public.hook_allow_staff_or_anonymous_signup(jsonb)
  from public, anon, authenticated;
revoke execute on function public.get_member_session_context()
  from public, anon;
revoke execute on function public.get_admin_member_accounts()
  from public, anon;
revoke execute on function public.upsert_member_account(uuid, text, public.app_role)
  from public, anon;
revoke execute on function public.send_member_invitation(uuid)
  from public, anon;
revoke execute on function public.confirm_member_invitation_sent(uuid, text)
  from public, anon;

grant execute on function public.get_member_session_context() to authenticated;
grant execute on function public.get_admin_member_accounts() to authenticated;
grant execute on function public.upsert_member_account(uuid, text, public.app_role)
  to authenticated;
grant execute on function public.send_member_invitation(uuid) to authenticated;
grant execute on function public.confirm_member_invitation_sent(uuid, text)
  to authenticated;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.sync_auth_user_account(uuid)
  to supabase_auth_admin;
grant execute on function public.handle_new_auth_user()
  to supabase_auth_admin;
grant execute on function public.handle_auth_user_account_change()
  to supabase_auth_admin;
grant execute on function public.hook_allow_staff_or_anonymous_signup(jsonb)
  to supabase_auth_admin;
