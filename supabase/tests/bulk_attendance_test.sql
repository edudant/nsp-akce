-- Synthetic fixtures only. Run after migrations; all writes roll back.
begin;
create temp table bulk_case as select gen_random_uuid() admin_id,
 gen_random_uuid() member_user_id, gen_random_uuid() season_id, gen_random_uuid() event_id;
create temp table bulk_members as select gen_random_uuid() id, n from generate_series(1,50) n;
insert into auth.users(id,email,raw_user_meta_data)
 select admin_id,'bulk-'||admin_id||'@example.invalid','{}'::jsonb from bulk_case
 union all select member_user_id,'bulk-'||member_user_id||'@example.invalid','{}'::jsonb from bulk_case;
insert into public.user_roles(user_id,role)
 select admin_id,'admin'::public.app_role from bulk_case
 union all select member_user_id,'member'::public.app_role from bulk_case;
insert into public.members(id,display_name,short_name,pairing_role,experience_level,age_groups,is_active)
 select id,'Bulk test '||id,'B'||n,'lead','advanced',array['old']::public.member_age_group[],true from bulk_members;
insert into public.member_accounts(member_id,email,desired_role,linked_user_id)
 select m.id,'bulk-'||c.member_user_id||'@example.invalid','member',c.member_user_id
 from bulk_case c,bulk_members m where n=1;
update public.profiles set member_id=(select id from bulk_members where n=1)
 where user_id=(select member_user_id from bulk_case);
insert into public.seasons(id,name,date_from,date_to,kind)
 select season_id,'Bulk test',current_date-1,current_date+30,'dance' from bulk_case;
insert into public.events(id,season_id,title,type,starts_at,ends_at,response_deadline,status,points_weight)
 select event_id,season_id,'Bulk test','performance',now()+interval '2 days',now()+interval '2 days 2 hours',now()+interval '1 day','open',2 from bulk_case;
grant select on bulk_case,bulk_members to authenticated,anon;

-- Force a failure after attendance writes to check rollback across all tables.
create function pg_temp.reject_bulk_response() returns trigger language plpgsql as $$
begin
 if new.event_id=(select event_id from bulk_case) and new.note='test rollback'
  and new.member_id=(select id from bulk_members where n=50) then
  raise exception 'Synthetic response failure';
 end if;
 return new;
end $$;
create trigger reject_bulk_test_response before insert or update on public.event_responses
 for each row execute function pg_temp.reject_bulk_response();

select set_config('request.jwt.claim.sub',(select member_user_id::text from bulk_case),true);
set local role authenticated;
select public.mutate_app_v3('response',jsonb_build_object('id',c.event_id,'interest','no')) from bulk_case c;
do $$ begin
 begin
  perform public.add_attendance_batch_v4((select event_id from bulk_case),(select array_agg(id) from bulk_members),'{"interest":"yes","status":"present"}');
  raise exception 'Expected non-admin rejection';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;

select set_config('request.jwt.claim.sub',(select admin_id::text from bulk_case),true);
set local role authenticated;
do $$
<<bulk_attendance_test>>
declare
 event_id uuid := (select c.event_id from bulk_case c);
 ids uuid[] := (select array_agg(id order by n) from bulk_members);
 provenance jsonb;
 original_audit_count bigint;
 invalid jsonb;
begin
 -- Duplicate selections are deduplicated inside a single write transaction.
 perform public.add_attendance_batch_v4(event_id,ids||ids[1],'{"interest":"maybe","note":" Směna ","status":"partial","attendancePercent":75}');
 if (select count(*) from public.attendance a where a.event_id=bulk_attendance_test.event_id and a.status='partial' and a.attendance_percent=75 and a.effective_points=1.5)<>50 then
  raise exception 'Bulk percentages or calculated points';
 end if;
 if (select count(*) from public.event_participants p where p.event_id=bulk_attendance_test.event_id and p.status='selected')<>50 then raise exception 'Bulk selection'; end if;
 if (select count(*) from public.event_responses r where r.event_id=bulk_attendance_test.event_id and r.response='maybe' and r.note='Směna')<>50 then raise exception 'Bulk responses'; end if;
 provenance := public.get_app_database_v3();
 select record into provenance from jsonb_array_elements(provenance->'events') e,
  jsonb_array_elements(e->'attendance') record where e->>'id'=event_id::text and record->>'memberId'=ids[1]::text;
 if provenance->'memberResponse'->>'interest'<>'no' or provenance->'adminResponse'->>'interest'<>'maybe' then
  raise exception 'Original member response or admin provenance lost';
 end if;
 original_audit_count := jsonb_array_length(public.get_event_audit_v4(event_id));
 if original_audit_count<150 then raise exception 'Missing bulk audit entries'; end if;

 foreach invalid in array array[
  '{"interest":"maybe","note":"  ","status":"present"}'::jsonb,
  '{"interest":"substitute","status":"present"}'::jsonb,
  '{"interest":"yes","status":"invalid"}'::jsonb,
  '{"interest":"yes","status":"partial","attendancePercent":100}'::jsonb,
  '{"interest":"yes","status":"partial"}'::jsonb
 ] loop
  begin
   perform public.add_attendance_batch_v4(event_id,ids,invalid);
   raise exception 'Expected validation rejection' using errcode='ZX001';
  exception when raise_exception then null;
  end;
 end loop;
 begin
  perform public.add_attendance_batch_v4(event_id,ids||gen_random_uuid(),'{"interest":"no","status":"absent"}');
  raise exception 'Expected missing member rejection' using errcode='ZX001';
 exception when raise_exception then null;
 end;
 begin
  perform public.add_attendance_batch_v4(event_id,ids,'{"interest":"yes","status":"present","note":"test rollback"}');
  raise exception 'Expected response trigger rejection' using errcode='ZX001';
 exception when raise_exception then null;
 end;
 if jsonb_array_length(public.get_event_audit_v4(event_id))<>original_audit_count then raise exception 'Rejected batch wrote audit'; end if;
 if (select count(*) from public.attendance a where a.event_id=bulk_attendance_test.event_id and a.attendance_percent=75)<>50 then raise exception 'Rejected batch changed attendance'; end if;

 perform public.add_attendance_batch_v4(event_id,ids,'{"interest":"no","status":"absent"}');
 if exists(select 1 from public.event_participants p where p.event_id=bulk_attendance_test.event_id and p.status='selected') then raise exception 'Absentees selected for pairing'; end if;
 perform public.add_attendance_batch_v4(event_id,ids,'{"interest":"yes","status":"unknown"}');
 if (select count(*) from public.attendance a where a.event_id=bulk_attendance_test.event_id and a.status='unrecorded' and a.attendance_percent is null)<>50 then raise exception 'Unrecorded attendance'; end if;
 if (select count(*) from public.event_participants p where p.event_id=bulk_attendance_test.event_id and p.status='selected')<>50 then raise exception 'Unrecorded selected roster'; end if;
end $$;
reset role;

set local role anon;
do $$ begin
 begin
  perform public.add_attendance_batch_v4((select event_id from bulk_case),(select array_agg(id) from bulk_members),'{"interest":"yes","status":"present"}');
  raise exception 'Expected anonymous rejection';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select 'passed' as bulk_attendance_checks;
rollback;
