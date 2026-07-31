-- Regression test for administrator member-profile writes. The private
-- admin_note column must stay unreadable through the REST table endpoint,
-- while the guarded RPC must support both update and insert. ROLLBACK keeps
-- the database unchanged.

begin;

insert into public.members (
  id,
  display_name,
  short_name,
  pairing_role,
  experience_level,
  active_from,
  is_active,
  admin_note
)
values (
  'f4000000-0000-4000-8000-000000000001',
  'Profile write target',
  'Write target',
  'lead',
  'advanced',
  date '2020-01-01',
  true,
  'Original private note'
);

insert into public.admin_email_allowlist (email, is_active, note)
values (
  'profile-write-admin@example.invalid',
  true,
  'Transactional profile-write test administrator'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token,
  is_sso_user,
  is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'f4100000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'profile-write-admin@example.invalid',
    '',
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f4100000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'profile-write-member@example.invalid',
    '',
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  );

insert into public.user_roles (user_id, role)
values (
  'f4100000-0000-4000-8000-000000000002',
  'member'::public.app_role
);

select set_config(
  'request.jwt.claim.sub',
  'f4100000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"f4100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

do $test$
declare
  v_result jsonb;
  v_created_id uuid;
  v_note text;
  v_error_state text;
begin
  -- This is the exact access shape that used to fail in the application.
  -- It must keep failing because granting direct SELECT on admin_note would
  -- expose a member's private administrative note through PostgREST.
  v_error_state := null;
  begin
    update public.members
    set display_name = display_name
    where id = 'f4000000-0000-4000-8000-000000000001'
    returning admin_note into v_note;
  exception when others then
    get stacked diagnostics v_error_state = returned_sqlstate;
  end;
  if v_error_state is distinct from '42501' then
    raise exception 'Direct private-column RETURNING should fail with 42501, got %.',
      v_error_state;
  end if;

  v_result := public.save_member_profile(
    'f4000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'display_name', 'Updated profile target',
      'active_from', '2004-03-02',
      'admin_note', 'Updated private note'
    )
  );
  if v_result ->> 'display_name' <> 'Updated profile target'
     or v_result ->> 'active_from' <> '2004-03-02'
     or v_result ->> 'admin_note' <> 'Updated private note' then
    raise exception 'Administrator profile update returned unexpected data: %',
      v_result;
  end if;

  select staff.admin_note into v_note
  from public.get_staff_members() staff
  where staff.id = 'f4000000-0000-4000-8000-000000000001';
  if v_note <> 'Updated private note' then
    raise exception 'Administrator profile update was not persisted.';
  end if;

  v_result := public.save_member_profile(
    null,
    jsonb_build_object(
      'display_name', 'Created profile target',
      'short_name', 'Created target',
      'pairing_role', 'follow',
      'experience_level', 'beginner',
      'active_from', '2001-09-15',
      'is_active', true,
      'admin_note', 'Created private note'
    )
  );
  v_created_id := (v_result ->> 'id')::uuid;
  if v_created_id is null
     or v_result ->> 'active_from' <> '2001-09-15'
     or v_result ->> 'admin_note' <> 'Created private note' then
    raise exception 'Administrator profile insert returned unexpected data: %',
      v_result;
  end if;

  -- EXECUTE is granted to authenticated so PostgREST can expose the RPC, but
  -- its own role check must reject every non-administrator.
  perform set_config(
    'request.jwt.claim.sub',
    'f4100000-0000-4000-8000-000000000002',
    true
  );
  perform set_config(
    'request.jwt.claims',
    '{"sub":"f4100000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  v_error_state := null;
  begin
    perform public.save_member_profile(
      'f4000000-0000-4000-8000-000000000001',
      jsonb_build_object('display_name', 'Unauthorized update')
    );
  exception when others then
    get stacked diagnostics v_error_state = returned_sqlstate;
  end;
  if v_error_state is distinct from 'P0001' then
    raise exception 'Non-admin profile update was not rejected; SQLSTATE=%.',
      v_error_state;
  end if;
end;
$test$;

reset role;

do $test$
declare
  v_function_oid oid;
begin
  if has_column_privilege(
    'authenticated',
    'public.members',
    'admin_note',
    'SELECT'
  ) then
    raise exception 'authenticated unexpectedly has SELECT on members.admin_note.';
  end if;

  select p.oid into v_function_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'save_member_profile'
    and p.proargtypes = '2950 3802'::oidvector;

  if v_function_oid is null then
    raise exception 'save_member_profile(uuid, jsonb) was not found.';
  end if;
  if has_function_privilege('anon', v_function_oid, 'EXECUTE') then
    raise exception 'anon unexpectedly has EXECUTE on save_member_profile.';
  end if;
  if not has_function_privilege('authenticated', v_function_oid, 'EXECUTE') then
    raise exception 'authenticated is missing EXECUTE on save_member_profile.';
  end if;
end;
$test$;

rollback;
