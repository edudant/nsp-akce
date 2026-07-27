-- Keep anonymous shared-code sessions available while preventing arbitrary
-- permanent Auth users from being created outside the staff allowlist.

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

  if v_email is not null and exists (
    select 1
    from public.admin_email_allowlist allowlisted
    where allowlisted.email = v_email
      and allowlisted.is_active
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'Registrace je dostupná pouze pozvaným správcům.'
    )
  );
end;
$$;

comment on function public.hook_allow_staff_or_anonymous_signup(jsonb) is
  'Before-user-created Auth hook: allows anonymous sessions and staff allowlist only.';

grant usage on schema public to supabase_auth_admin;
grant execute
  on function public.hook_allow_staff_or_anonymous_signup(jsonb)
  to supabase_auth_admin;

revoke execute
  on function public.hook_allow_staff_or_anonymous_signup(jsonb)
  from public, anon, authenticated;
