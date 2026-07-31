-- Read-only post-migration smoke test. Every violation counter should be zero.

with
recorder_grants as (
  select count(*)::integer as value
  from public.user_roles ur
  where ur.role = 'recorder'::public.app_role
),
invalid_account_roles as (
  select count(*)::integer as value
  from public.member_accounts ma
  where ma.desired_role not in (
    'member'::public.app_role,
    'admin'::public.app_role
  )
),
invalid_account_emails as (
  select count(*)::integer as value
  from public.member_accounts ma
  where ma.email <> lower(btrim(ma.email))
     or ma.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
),
duplicate_account_emails as (
  select count(*)::integer as value
  from (
    select lower(btrim(ma.email))
    from public.member_accounts ma
    group by lower(btrim(ma.email))
    having count(*) > 1
  ) duplicates
),
linked_profile_mismatches as (
  select count(*)::integer as value
  from public.member_accounts ma
  left join public.profiles p
    on p.user_id = ma.linked_user_id
   and p.member_id = ma.member_id
  where ma.linked_user_id is not null
    and p.user_id is null
),
linked_email_mismatches as (
  select count(*)::integer as value
  from public.member_accounts ma
  join auth.users u on u.id = ma.linked_user_id
  where lower(btrim(u.email)) <> ma.email
),
inactive_linked_roles as (
  select count(*)::integer as value
  from public.member_accounts ma
  join public.members m on m.id = ma.member_id
  join public.user_roles ur on ur.user_id = ma.linked_user_id
  where not m.is_active
    and ur.role in ('member'::public.app_role, 'admin'::public.app_role)
),
account_role_mismatches as (
  select count(*)::integer as value
  from public.member_accounts ma
  join public.members m on m.id = ma.member_id
  where ma.linked_user_id is not null
    and m.is_active
    and (
      not exists (
        select 1 from public.user_roles ur
        where ur.user_id = ma.linked_user_id
          and ur.role = 'member'::public.app_role
      )
      or (
        ma.desired_role = 'admin'::public.app_role
        and not exists (
          select 1 from public.user_roles ur
          where ur.user_id = ma.linked_user_id
            and ur.role = 'admin'::public.app_role
        )
      )
      or (
        ma.desired_role = 'member'::public.app_role
        and exists (
          select 1 from public.user_roles ur
          where ur.user_id = ma.linked_user_id
            and ur.role = 'admin'::public.app_role
        )
      )
    )
),
missing_seed_programs as (
  select count(*)::integer as value
  from (
    values
      ('Postřekovo'),
      ('Postřekoviny'),
      ('Chodská svatba'),
      ('Bláhoviny'),
      ('Zelený kousky')
  ) required(name)
  where not exists (
    select 1
    from public.program_catalog pc
    where lower(btrim(pc.name)) = lower(required.name)
  )
),
unlinked_event_pairs as (
  select count(*)::integer as value
  from public.event_pairs ep
  where ep.pairing_block_id is null
),
mismatched_event_pair_blocks as (
  select count(*)::integer as value
  from public.event_pairs ep
  join public.pairing_blocks pb on pb.id = ep.pairing_block_id
  where pb.pairing_run_id <> ep.pairing_run_id
     or pb.position <> ep.round_number
),
mismatched_block_program_events as (
  select count(*)::integer as value
  from public.pairing_block_program_items bp
  join public.pairing_blocks pb on pb.id = bp.pairing_block_id
  join public.pairing_runs pr on pr.id = pb.pairing_run_id
  join public.event_program_items epi on epi.id = bp.event_program_item_id
  where pr.event_id <> epi.event_id
     or bp.pairing_run_id <> pb.pairing_run_id
),
duplicate_program_scope as (
  select count(*)::integer as value
  from (
    select bp.pairing_run_id, bp.event_program_item_id
    from public.pairing_block_program_items bp
    group by bp.pairing_run_id, bp.event_program_item_id
    having count(*) > 1
  ) duplicates
),
invalid_whole_event_blocks as (
  select count(*)::integer as value
  from public.pairing_blocks pb
  where not pb.is_legacy_round
    and pb.applies_to_all_program_items
    and (
      exists (
        select 1
        from public.pairing_blocks other
        where other.pairing_run_id = pb.pairing_run_id
          and other.id <> pb.id
          and not other.is_legacy_round
      )
      or exists (
        select 1
        from public.pairing_block_program_items bp_item
        where bp_item.pairing_block_id = pb.id
      )
    )
),
invalid_partner_wishes as (
  select count(*)::integer as value
  from public.event_partner_wishes w
  join public.members owner on owner.id = w.member_id
  join public.members partner on partner.id = w.partner_member_id
  where w.member_id = w.partner_member_id
     or owner.pairing_role = partner.pairing_role
),
new_tables_without_rls as (
  select count(*)::integer as value
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'member_accounts',
      'member_invitation_deliveries',
      'program_catalog',
      'event_program_items',
      'pairing_blocks',
      'pairing_block_program_items',
      'event_partner_wishes'
    )
    and not c.relrowsecurity
),
anon_new_table_grants as (
  select count(*)::integer as value
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.grantee = 'anon'
    and g.table_name in (
      'member_accounts',
      'member_invitation_deliveries',
      'program_catalog',
      'event_program_items',
      'pairing_blocks',
      'pairing_block_program_items',
      'event_partner_wishes'
    )
),
sensitive_pairing_column_grants as (
  select count(*)::integer as value
  from information_schema.column_privileges g
  where g.table_schema = 'public'
    and g.grantee = 'authenticated'
    and g.privilege_type = 'SELECT'
    and (
      (
        g.table_name = 'pairing_runs'
        and g.column_name in (
          'seed',
          'algorithm_version',
          'rules_snapshot',
          'generated_by',
          'published_at',
          'note',
          'updated_at'
        )
      )
      or (
        g.table_name = 'event_pairs'
        and g.column_name in (
          'score',
          'explanation',
          'manual_change_reason',
          'created_by',
          'created_at',
          'updated_at'
        )
      )
    )
),
missing_safe_pairing_rpcs as (
  select count(*)::integer as value
  from (
    values
      ('get_pairing_runs_for_app'),
      ('get_event_pairs_for_app')
  ) required(name)
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = required.name
      and p.pronargs = 0
  )
),
unsafe_shared_pair_explanation as (
  select count(*)::integer as value
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_shared_event_pairs'
    and pg_get_functiondef(p.oid) like '%ep.explanation%'
)
select jsonb_build_object(
  'recorder_grants', (select value from recorder_grants),
  'invalid_account_roles', (select value from invalid_account_roles),
  'invalid_account_emails', (select value from invalid_account_emails),
  'duplicate_account_emails', (select value from duplicate_account_emails),
  'linked_profile_mismatches', (select value from linked_profile_mismatches),
  'linked_email_mismatches', (select value from linked_email_mismatches),
  'inactive_linked_roles', (select value from inactive_linked_roles),
  'account_role_mismatches', (select value from account_role_mismatches),
  'missing_seed_programs', (select value from missing_seed_programs),
  'unlinked_event_pairs', (select value from unlinked_event_pairs),
  'mismatched_event_pair_blocks', (select value from mismatched_event_pair_blocks),
  'mismatched_block_program_events', (select value from mismatched_block_program_events),
  'duplicate_program_scope', (select value from duplicate_program_scope),
  'invalid_whole_event_blocks', (select value from invalid_whole_event_blocks),
  'invalid_partner_wishes', (select value from invalid_partner_wishes),
  'new_tables_without_rls', (select value from new_tables_without_rls),
  'anon_new_table_grants', (select value from anon_new_table_grants),
  'sensitive_pairing_column_grants', (select value from sensitive_pairing_column_grants),
  'missing_safe_pairing_rpcs', (select value from missing_safe_pairing_rpcs),
  'unsafe_shared_pair_explanation', (select value from unsafe_shared_pair_explanation)
) as member_accounts_and_programs_smoke_test;
