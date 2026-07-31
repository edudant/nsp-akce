-- Transactional functional test for member accounts, member-owned data and
-- legacy pairing compatibility. All fixtures use reserved example.invalid
-- addresses, and ROLLBACK leaves the target database unchanged.

begin;

set local timezone = 'UTC';

-- Fixed UUIDs make failures easy to diagnose without introducing real names
-- or e-mail addresses into the repository.
insert into public.seasons (
  id,
  name,
  date_from,
  date_to,
  is_current
)
values (
  'f1000000-0000-4000-8000-000000000001',
  'Functional test season',
  current_date - 365,
  current_date + 365,
  false
);

insert into public.members (
  id,
  display_name,
  short_name,
  pairing_role,
  experience_level,
  is_active
)
values
  (
    'f2000000-0000-4000-8000-000000000001',
    'Functional Owner One',
    'Owner One',
    'lead',
    'advanced',
    true
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'Functional Owner Two',
    'Owner Two',
    'lead',
    'experienced',
    true
  ),
  (
    'f2000000-0000-4000-8000-000000000003',
    'Functional Partner One',
    'Partner One',
    'follow',
    'experienced',
    true
  ),
  (
    'f2000000-0000-4000-8000-000000000004',
    'Functional Partner Two',
    'Partner Two',
    'follow',
    'advanced',
    true
  ),
  (
    'f2000000-0000-4000-8000-000000000005',
    'Functional Revoked Account',
    'Revoked',
    'lead',
    'beginner',
    true
  ),
  (
    'f2000000-0000-4000-8000-000000000006',
    'Functional Invitation',
    'Invitation',
    'lead',
    'advanced',
    true
  ),
  (
    'f2000000-0000-4000-8000-000000000007',
    'Functional Inactive',
    'Inactive',
    'follow',
    'advanced',
    false
  ),
  (
    'f2000000-0000-4000-8000-000000000008',
    'Functional Duplicate Target',
    'Duplicate',
    'follow',
    'advanced',
    true
  );

insert into public.member_accounts (
  member_id,
  email,
  desired_role,
  created_by
)
values
  (
    'f2000000-0000-4000-8000-000000000001',
    'portal-owner-one@example.invalid',
    'member',
    null
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'portal-owner-two@example.invalid',
    'member',
    null
  ),
  (
    'f2000000-0000-4000-8000-000000000005',
    'old-access@example.invalid',
    'member',
    null
  ),
  (
    'f2000000-0000-4000-8000-000000000006',
    'invitation@example.invalid',
    'member',
    null
  ),
  (
    'f2000000-0000-4000-8000-000000000007',
    'inactive@example.invalid',
    'member',
    null
  );

insert into public.admin_email_allowlist (
  email,
  is_active,
  note
)
values (
  'functional-admin@example.invalid',
  true,
  'Transactional functional-test bootstrap administrator'
);

-- These inserts exercise the real on_auth_user_created trigger and therefore
-- also verify account/profile/role synchronization for known active e-mails.
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
    'f3000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'functional-admin@example.invalid',
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
    'f3000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'portal-owner-one@example.invalid',
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
    'f3000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'portal-owner-two@example.invalid',
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
    'f3000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'old-access@example.invalid',
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

do $test$
declare
  v_result jsonb;
  v_error text;
begin
  -- Known active member e-mails are allowed, including an already linked
  -- address used for a subsequent login. GoTrue's unique Auth identity plus
  -- member_accounts.email uniqueness prevent a second account being created.
  v_result := public.hook_allow_staff_or_anonymous_signup(
    jsonb_build_object(
      'user',
      jsonb_build_object(
        'id', 'f3000000-0000-4000-8000-000000000099',
        'email', '  PORTAL-OWNER-ONE@EXAMPLE.INVALID ',
        'is_anonymous', false
      )
    )
  );
  if v_result <> '{}'::jsonb then
    raise exception 'Known active member hook assertion failed: %', v_result;
  end if;

  v_result := public.hook_allow_staff_or_anonymous_signup(
    jsonb_build_object(
      'user',
      jsonb_build_object(
        'id', 'f3000000-0000-4000-8000-000000000098',
        'email', 'unknown@example.invalid',
        'is_anonymous', false
      )
    )
  );
  if coalesce((v_result #>> '{error,http_code}')::integer, 0) <> 403 then
    raise exception 'Unknown member hook assertion failed: %', v_result;
  end if;

  v_result := public.hook_allow_staff_or_anonymous_signup(
    jsonb_build_object(
      'user',
      jsonb_build_object(
        'id', 'f3000000-0000-4000-8000-000000000097',
        'email', 'inactive@example.invalid',
        'is_anonymous', false
      )
    )
  );
  if coalesce((v_result #>> '{error,http_code}')::integer, 0) <> 403 then
    raise exception 'Inactive member hook assertion failed: %', v_result;
  end if;

  if not exists (
    select 1
    from public.member_accounts ma
    where ma.member_id = 'f2000000-0000-4000-8000-000000000001'
      and ma.linked_user_id = 'f3000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Known Auth user was not linked to its member account.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.user_id
    where p.user_id = 'f3000000-0000-4000-8000-000000000002'
      and p.member_id = 'f2000000-0000-4000-8000-000000000001'
      and ur.role = 'member'::public.app_role
  ) then
    raise exception 'Known Auth user did not receive its member profile and role.';
  end if;

  -- There is exactly one administrator in this fixture. The guard must reject
  -- removing it and leave the original grant intact.
  v_error := null;
  begin
    delete from public.user_roles
    where user_id = 'f3000000-0000-4000-8000-000000000001'
      and role = 'admin'::public.app_role;
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error is null
     or v_error not like 'Nelze odebrat poslední administrátorskou roli.%' then
    raise exception 'Last-admin guard assertion failed; error=%', v_error;
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = 'f3000000-0000-4000-8000-000000000001'
      and role = 'admin'::public.app_role
  ) then
    raise exception 'Last administrator role disappeared after rejected delete.';
  end if;
end;
$test$;

-- Exercise administrator-only account and invitation RPCs with the same role
-- and JWT settings PostgREST supplies in production.
select set_config(
  'request.jwt.claim.sub',
  'f3000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

do $test$
declare
  v_result jsonb;
  v_sent_at timestamptz;
  v_error text;
begin
  -- A duplicate normalized member e-mail must be rejected. This is the
  -- database-side duplicate protection paired with the Auth hook assertion
  -- above (an existing address is a login, never a second member identity).
  v_error := null;
  begin
    perform public.upsert_member_account(
      'f2000000-0000-4000-8000-000000000008',
      'PORTAL-OWNER-ONE@EXAMPLE.INVALID',
      'member'::public.app_role
    );
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error is null
     or v_error not like 'Tento e-mail už používá jiný člen.%' then
    raise exception 'Duplicate member e-mail assertion failed; error=%', v_error;
  end if;

  -- Replacing an e-mail must synchronously unlink the old Auth identity and
  -- revoke all of its application roles before this RPC returns.
  v_result := public.upsert_member_account(
    'f2000000-0000-4000-8000-000000000005',
    'replacement-access@example.invalid',
    'member'::public.app_role
  );
  if v_result ->> 'email' <> 'replacement-access@example.invalid'
     or v_result ->> 'linkedUserId' is not null then
    raise exception 'Replacement member-account result is invalid: %', v_result;
  end if;

  -- First invitation authorization succeeds and returns only the stored
  -- address. Confirmation creates the delivery audit and starts the cooldown.
  v_result := public.send_member_invitation(
    'f2000000-0000-4000-8000-000000000006'
  );
  if v_result ->> 'email' <> 'invitation@example.invalid'
     or coalesce((v_result ->> 'retryAfterSeconds')::integer, -1) <> 0 then
    raise exception 'Initial invitation authorization failed: %', v_result;
  end if;

  v_sent_at := public.confirm_member_invitation_sent(
    'f2000000-0000-4000-8000-000000000006',
    'functional-provider-message-1'
  );
  if v_sent_at is null then
    raise exception 'Invitation confirmation did not return a timestamp.';
  end if;

  v_error := null;
  begin
    perform public.send_member_invitation(
      'f2000000-0000-4000-8000-000000000006'
    );
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null
     or v_error not like 'Novou pozvánku lze poslat za % sekund.%' then
    raise exception 'Invitation 60-second cooldown assertion failed; error=%', v_error;
  end if;
end;
$test$;

reset role;

do $test$
begin
  if exists (
    select 1 from public.user_roles
    where user_id = 'f3000000-0000-4000-8000-000000000004'
      and role in ('member'::public.app_role, 'admin'::public.app_role)
  ) then
    raise exception 'Old Auth identity kept an application role after e-mail change.';
  end if;
  if exists (
    select 1 from public.profiles
    where user_id = 'f3000000-0000-4000-8000-000000000004'
      and member_id is not null
  ) then
    raise exception 'Old Auth identity kept its member profile link after e-mail change.';
  end if;
  if not exists (
    select 1 from public.member_accounts
    where member_id = 'f2000000-0000-4000-8000-000000000005'
      and email = 'replacement-access@example.invalid'
      and linked_user_id is null
  ) then
    raise exception 'Replacement member account was not persisted as unlinked.';
  end if;

  if not exists (
    select 1
    from public.member_accounts ma
    where ma.member_id = 'f2000000-0000-4000-8000-000000000006'
      and ma.invitation_count = 1
      and ma.last_invitation_sent_at is not null
  ) then
    raise exception 'Invitation aggregate audit fields were not updated.';
  end if;
  if (
    select count(*)
    from public.member_invitation_deliveries d
    where d.member_id = 'f2000000-0000-4000-8000-000000000006'
      and d.sent_by = 'f3000000-0000-4000-8000-000000000001'
      and d.provider_message_id = 'functional-provider-message-1'
  ) <> 1 then
    raise exception 'Invitation delivery audit row is missing or duplicated.';
  end if;

  if public.hook_allow_staff_or_anonymous_signup(
    jsonb_build_object(
      'user',
      jsonb_build_object(
        'email', 'old-access@example.invalid',
        'is_anonymous', false
      )
    )
  ) #>> '{error,http_code}' <> '403' then
    raise exception 'Old e-mail remained authorized by the Auth hook.';
  end if;
  if public.hook_allow_staff_or_anonymous_signup(
    jsonb_build_object(
      'user',
      jsonb_build_object(
        'email', 'replacement-access@example.invalid',
        'is_anonymous', false
      )
    )
  ) <> '{}'::jsonb then
    raise exception 'Replacement e-mail was not authorized by the Auth hook.';
  end if;
end;
$test$;

-- The stale Auth session must lose access immediately, without waiting for its
-- JWT to expire.
select set_config(
  'request.jwt.claim.sub',
  'f3000000-0000-4000-8000-000000000004',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"f3000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

do $test$
declare
  v_error text;
begin
  if public.current_member_id() is not null
     or public.has_role('member'::public.app_role) then
    raise exception 'Old session retained member authorization after e-mail change.';
  end if;

  v_error := null;
  begin
    perform public.get_member_history();
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null
     or v_error not like 'Účet není propojený s aktivním členem.%' then
    raise exception 'Old session history denial assertion failed; error=%', v_error;
  end if;
end;
$test$;

reset role;

-- Member-history fixtures deliberately contain different private notes so the
-- following assertions can detect accidental cross-member joins.
insert into public.events (
  id,
  season_id,
  type,
  title,
  starts_at,
  ends_at,
  status,
  response_deadline,
  visibility,
  created_by
)
values
  (
    'f4000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'rehearsal',
    'Functional open RSVP',
    now() + interval '14 days',
    now() + interval '14 days 2 hours',
    'open',
    now() + interval '7 days',
    'shared',
    null
  ),
  (
    'f4000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'performance',
    'Functional expired RSVP',
    now() + interval '10 days',
    now() + interval '10 days 2 hours',
    'open',
    now() - interval '1 second',
    'members',
    null
  ),
  (
    'f4000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000001',
    'rehearsal',
    'Functional history event',
    now() - interval '14 days',
    now() - interval '14 days' + interval '2 hours',
    'closed',
    now() - interval '21 days',
    'shared',
    null
  );

-- Administrators replace the ordered event program through one transaction.
-- A retained item keeps its UUID even when its position changes.
select set_config(
  'request.jwt.claim.sub',
  'f3000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

do $test$
declare
  v_catalog_id uuid;
  v_catalog_item_id uuid;
  v_custom_item_id uuid;
  v_result jsonb;
begin
  select pc.id into v_catalog_id
  from public.program_catalog pc
  where pc.name = 'Postřekovo';

  v_result := public.update_event_program(
    'f4000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object('catalogId', v_catalog_id),
      jsonb_build_object('customName', 'Functional custom program')
    )
  );
  v_catalog_item_id := (v_result -> 0 ->> 'id')::uuid;
  v_custom_item_id := (v_result -> 1 ->> 'id')::uuid;

  v_result := public.update_event_program(
    'f4000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'id', v_custom_item_id,
        'customName', 'Functional custom program'
      ),
      jsonb_build_object(
        'id', v_catalog_item_id,
        'catalogId', v_catalog_id
      )
    )
  );

  if (v_result -> 0 ->> 'id')::uuid <> v_custom_item_id
     or (v_result -> 1 ->> 'id')::uuid <> v_catalog_item_id then
    raise exception 'Event-program reorder did not preserve retained item IDs: %',
      v_result;
  end if;
  if (
    select e.program
    from public.events e
    where e.id = 'f4000000-0000-4000-8000-000000000001'
  ) <> 'Functional custom program, Postřekovo' then
    raise exception 'Legacy event.program projection was not synchronized.';
  end if;
end;
$test$;

reset role;

insert into public.event_responses (
  event_id,
  member_id,
  response,
  note,
  responded_by,
  responded_at
)
values
  (
    'f4000000-0000-4000-8000-000000000003',
    'f2000000-0000-4000-8000-000000000001',
    'yes',
    'functional-own-history-note',
    'f3000000-0000-4000-8000-000000000002',
    now() - interval '20 days'
  ),
  (
    'f4000000-0000-4000-8000-000000000003',
    'f2000000-0000-4000-8000-000000000002',
    'no',
    'functional-foreign-history-note',
    'f3000000-0000-4000-8000-000000000003',
    now() - interval '20 days'
  );

insert into public.attendance (
  event_id,
  member_id,
  status,
  calculated_points,
  confirmed_by,
  confirmed_at
)
values
  (
    'f4000000-0000-4000-8000-000000000003',
    'f2000000-0000-4000-8000-000000000001',
    'full',
    1,
    'f3000000-0000-4000-8000-000000000001',
    now() - interval '14 days'
  ),
  (
    'f4000000-0000-4000-8000-000000000003',
    'f2000000-0000-4000-8000-000000000002',
    'absent',
    0,
    'f3000000-0000-4000-8000-000000000001',
    now() - interval '14 days'
  );

insert into public.event_partner_wishes (
  event_id,
  member_id,
  partner_member_id
)
values (
  'f4000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000002',
  'f2000000-0000-4000-8000-000000000004'
);

select set_config(
  'request.jwt.claim.sub',
  'f3000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"f3000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

do $test$
declare
  v_result jsonb;
  v_history jsonb;
  v_leaderboard jsonb;
  v_error text;
begin
  v_result := public.set_my_event_response(
    'f4000000-0000-4000-8000-000000000001',
    'yes'::public.event_response_status,
    'functional-current-response'
  );
  if v_result ->> 'memberId' <> 'f2000000-0000-4000-8000-000000000001'
     or v_result ->> 'response' <> 'yes' then
    raise exception 'Valid member RSVP assertion failed: %', v_result;
  end if;

  v_error := null;
  begin
    perform public.set_my_event_response(
      'f4000000-0000-4000-8000-000000000002',
      'yes'::public.event_response_status,
      null
    );
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null
     or v_error not like 'Na tuto událost už nelze odpovědět.%' then
    raise exception 'Expired RSVP deadline assertion failed; error=%', v_error;
  end if;

  v_result := public.set_my_partner_wishes(
    'f4000000-0000-4000-8000-000000000001',
    array['f2000000-0000-4000-8000-000000000003'::uuid]
  );
  if jsonb_array_length(v_result) <> 1
     or v_result -> 0 ->> 'partnerMemberId'
        <> 'f2000000-0000-4000-8000-000000000003' then
    raise exception 'Own partner-wish RPC assertion failed: %', v_result;
  end if;

  -- Direct table reads run as authenticated and therefore prove that RLS, not
  -- merely an RPC WHERE clause, hides the other member's rows.
  if (
    select count(*) from public.event_partner_wishes
    where event_id = 'f4000000-0000-4000-8000-000000000001'
  ) <> 1
     or exists (
       select 1 from public.event_partner_wishes
       where member_id = 'f2000000-0000-4000-8000-000000000002'
     ) then
    raise exception 'Partner-wish RLS exposed another member''s wishes.';
  end if;

  if exists (
    select 1 from public.event_responses
    where member_id = 'f2000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Event-response RLS exposed another member''s response.';
  end if;
  if exists (
    select 1 from public.attendance
    where member_id = 'f2000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Attendance RLS exposed another member''s history.';
  end if;

  if exists (select 1 from public.member_accounts) then
    raise exception 'Member-account RLS exposed member e-mail addresses.';
  end if;

  -- Members may see the whole name-and-score leaderboard, but it must not
  -- contain account e-mails or other account metadata.
  v_leaderboard := public.get_member_leaderboard();
  if not exists (
       select 1
       from jsonb_array_elements(v_leaderboard -> 'scores') score
       where score ->> 'memberId'
         = 'f2000000-0000-4000-8000-000000000002'
     )
     or not exists (
       select 1
       from jsonb_array_elements(v_leaderboard -> 'scores') score
       where score ->> 'memberId'
         = 'f2000000-0000-4000-8000-000000000003'
     )
     or position('example.invalid' in v_leaderboard::text) > 0
     or position('"email"' in lower(v_leaderboard::text)) > 0 then
    raise exception 'Full member leaderboard is incomplete or leaks e-mail data: %',
      v_leaderboard;
  end if;

  v_history := public.get_member_history();
  if v_history #>> '{member,memberId}'
       <> 'f2000000-0000-4000-8000-000000000001'
     or position('functional-own-history-note' in v_history::text) = 0
     or position('functional-foreign-history-note' in v_history::text) > 0 then
    raise exception 'Own member-history RPC leaked or omitted data: %', v_history;
  end if;

  v_error := null;
  begin
    perform public.get_admin_member_history(
      'f2000000-0000-4000-8000-000000000002'
    );
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null
     or v_error not like 'Historii jiného člena může zobrazit pouze administrátor.%' then
    raise exception 'Foreign member-history RPC denial failed; error=%', v_error;
  end if;
end;
$test$;

reset role;

-- An insert produced by a legacy client supplies only round_number. The
-- compatibility trigger must create the named block and link the pair, which
-- is also the invariant established by the migration backfill.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

insert into public.pairing_runs (
  id,
  event_id,
  seed,
  algorithm_version,
  status,
  generated_by
)
values (
  'f5000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  42,
  'functional-legacy',
  'draft',
  null
);

insert into public.event_pairs (
  id,
  pairing_run_id,
  round_number,
  member_a_id,
  member_b_id,
  explanation,
  created_by
)
values (
  'f6000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000001',
  7,
  'f2000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000003',
  'Functional legacy round',
  null
);

do $test$
declare
  v_pairing_block_id uuid;
begin
  select ep.pairing_block_id into v_pairing_block_id
  from public.event_pairs ep
  where ep.id = 'f6000000-0000-4000-8000-000000000001';

  if v_pairing_block_id is null then
    raise exception 'Legacy event pair was not linked to a pairing block.';
  end if;
  if not exists (
    select 1
    from public.pairing_blocks pb
    where pb.id = v_pairing_block_id
      and pb.pairing_run_id = 'f5000000-0000-4000-8000-000000000001'
      and pb.name = 'Kolo 7'
      and pb.position = 7
      and pb.applies_to_all_program_items
      and pb.is_legacy_round
  ) then
    raise exception 'Legacy round block/backfill invariant is invalid.';
  end if;
end;
$test$;

update public.event_pairs
set explanation = 'functional-private-partner-wish-reason'
where id = 'f6000000-0000-4000-8000-000000000001';

update public.pairing_runs
set status = 'published'
where id = 'f5000000-0000-4000-8000-000000000001';

insert into public.shared_access_sessions (user_id, expires_at)
values (
  'f3000000-0000-4000-8000-000000000002',
  now() + interval '1 hour'
);

select set_config(
  'request.jwt.claim.sub',
  'f3000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"f3000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

do $test$
declare
  v_error text;
  v_explanation text;
  v_shared_attendance jsonb;
begin
  select p.explanation into v_explanation
  from public.get_event_pairs_for_app() p
  where p.id = 'f6000000-0000-4000-8000-000000000001';

  if v_explanation <> 'Zveřejněný taneční pár.'
     or v_explanation like '%functional-private%' then
    raise exception 'Member pairing projection leaked private explanation: %',
      v_explanation;
  end if;

  v_error := null;
  begin
    perform ep.explanation
    from public.event_pairs ep
    where ep.id = 'f6000000-0000-4000-8000-000000000001';
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null then
    raise exception 'Member could select the private event-pair explanation column.';
  end if;

  v_shared_attendance := public.get_shared_event_attendance(
    'f4000000-0000-4000-8000-000000000003'
  );
  if v_shared_attendance <> '[]'::jsonb then
    raise exception 'Shared event detail exposed person-level attendance: %',
      v_shared_attendance;
  end if;
end;
$test$;

reset role;

-- The published legacy block applies to the whole event, so removing either
-- program item must be rejected and the original ordered program left intact.
select set_config(
  'request.jwt.claim.sub',
  'f3000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"f3000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

do $test$
declare
  v_custom_item_id uuid;
  v_error text;
begin
  select epi.id into v_custom_item_id
  from public.event_program_items epi
  where epi.event_id = 'f4000000-0000-4000-8000-000000000001'
    and epi.custom_name = 'Functional custom program';

  v_error := null;
  begin
    perform public.update_event_program(
      'f4000000-0000-4000-8000-000000000001',
      jsonb_build_array(
        jsonb_build_object(
          'id', v_custom_item_id,
          'customName', 'Functional custom program'
        )
      )
    );
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error is null
     or v_error not like '%nelze odebrat, protože je použité v publikovaném návrhu párů.%' then
    raise exception 'Published program-removal guard assertion failed; error=%',
      v_error;
  end if;
  if (
    select count(*)
    from public.event_program_items epi
    where epi.event_id = 'f4000000-0000-4000-8000-000000000001'
  ) <> 2 then
    raise exception 'Rejected program removal changed persisted event items.';
  end if;
end;
$test$;

reset role;

rollback;
