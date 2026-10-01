-- Synthetic users and sets; everything rolls back.
begin;
create temp table set_case as select gen_random_uuid() admin_id, gen_random_uuid() member_user_id,
 gen_random_uuid() season_id, gen_random_uuid() event_id;
create temp table set_members as select gen_random_uuid() id,n from generate_series(1,5) n;
insert into auth.users(id,email,raw_user_meta_data)
 select admin_id,'sets-'||admin_id||'@example.invalid','{}'::jsonb from set_case
 union all select member_user_id,'sets-'||member_user_id||'@example.invalid','{}'::jsonb from set_case;
insert into public.user_roles(user_id,role)
 select admin_id,'admin'::public.app_role from set_case
 union all select member_user_id,'member'::public.app_role from set_case;
insert into public.members(id,display_name,short_name,pairing_role,experience_level,age_group,age_groups,is_active)
 select id,'Set member '||n,'S'||n,case when n in (2,4) then 'follow'::public.pairing_role else 'lead'::public.pairing_role end,
 'advanced','old',array['old']::public.member_age_group[],true from set_members;
insert into public.member_accounts(member_id,email,desired_role,linked_user_id)
 select m.id,'sets-'||c.member_user_id||'@example.invalid','member',c.member_user_id from set_case c,set_members m where n=1;
update public.profiles set member_id=(select id from set_members where n=1) where user_id=(select member_user_id from set_case);
insert into public.seasons(id,name,date_from,date_to,kind)
 select season_id,'Set test',current_date-1,current_date+30,'dance' from set_case;
insert into public.events(id,season_id,title,type,starts_at,ends_at,response_deadline,status,points_weight)
 select event_id,season_id,'Set test','performance',now()+interval '2 days',now()+interval '2 days 2 hours',now()+interval '1 day','open',1 from set_case;
grant select on set_case,set_members to authenticated,anon;
select set_config('request.jwt.claim.sub',(select admin_id::text from set_case),true);
set local role authenticated;
select public.add_attendance_batch_v4((select event_id from set_case),(select array_agg(id) from set_members),' {"interest":"yes","status":"present"}');
select public.mutate_app_v3('attendance',jsonb_build_object('id',c.event_id,'memberId',m.id,'standing',true)) from set_case c,set_members m where n=5;

create temp table status_runs as select public.save_pairs_v3(c.event_id,jsonb_build_array(
 jsonb_build_object('leaderId',(select id from set_members where n=1),'followerId',(select id from set_members where n=2),'ageGroup','old')
),true,'Ranní') first_run from set_case c;
reset role;
grant select on status_runs to authenticated;
update public.pairing_runs set generated_at=now()-interval '1 hour' where id=(select first_run from status_runs);
select set_config('app.confirming_actual_pairs','1',true);
update public.event_pairs set is_confirmed_actual=true where pairing_run_id=(select first_run from status_runs);
select set_config('app.confirming_actual_pairs','',true);
set local role authenticated;
select public.save_pairs_v3(c.event_id,jsonb_build_array(
 jsonb_build_object('leaderId',(select id from set_members where n=3),'followerId',(select id from set_members where n=4),'ageGroup','old'),
 jsonb_build_object('leaderId',(select id from set_members where n=1),'followerId',(select id from set_members where n=2),'ageGroup','old','belowLine',true)
),true,'Večerní') from set_case c;
-- Future closure is an explicit admin choice; automatic attendance and points still apply.
select public.mutate_app_v3('attendance',jsonb_build_object('id',c.event_id,'memberId',m.id,'status','partial','attendancePercent',75)) from set_case c,set_members m where n=1;
select public.mutate_app_v3('attendance',jsonb_build_object('id',c.event_id,'memberId',m.id,'status','unknown')) from set_case c,set_members m where n=2;
select public.mutate_app_v3('event',jsonb_build_object('id',event_id,'status','closed')) from set_case;
do $$ declare e jsonb; begin
 select ev into e from jsonb_array_elements(public.get_app_database_v3()->'events') ev where ev->>'id'=(select event_id::text from set_case);
 if e->>'status'<>'closed' or not (e->>'canClose')::boolean then raise exception 'Future closure'; end if;
 if (select attendance_percent from public.attendance where event_id=(select event_id from set_case) and member_id=(select id from set_members where n=1))<>75 then raise exception 'Manual percent changed'; end if;
 if (select status from public.attendance where event_id=(select event_id from set_case) and member_id=(select id from set_members where n=2))<>'full' then raise exception 'Closure prefill'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select member_user_id::text from set_case),true);
set local role authenticated;
do $$ declare e jsonb; begin
 select ev into e from jsonb_array_elements(public.get_app_database_v3()->'events') ev where ev->>'id'=(select event_id::text from set_case);
 if jsonb_array_length(e->'pairSets')<>2 or e->'pairSets'->0->>'name'<>'Večerní' or e->'pairSets'->1->>'name'<>'Ranní' then raise exception 'Performance sets/order'; end if;
 if e->'pairingName'<>'"Večerní"' or jsonb_array_length(e->'pairs')<>2 then raise exception 'Legacy actual run displaced latest set'; end if;
 if e?'actualPairs' or (e->'pairs'->0)?'actual' or (e->'attendance'->0)?'actualStanding' then raise exception 'Actual confirmation leaked into model'; end if;
 if jsonb_array_length(e->'pairSets'->0->'roster')<>5 then raise exception 'Standing roster'; end if;
 begin perform public.mutate_app_v3('event',jsonb_build_object('id',(select event_id from set_case),'status','open')); raise exception 'Expected member rejection'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select admin_id::text from set_case),true);
set local role authenticated;
-- Expire the normal deadline, then explicitly reopen. Reads and the cron must preserve it.
select public.mutate_app_v3('event',jsonb_build_object('id',event_id,'responseDeadline',now()-interval '1 day','status','open')) from set_case;
reset role;
select public.confirm_due_events();
select set_config('request.jwt.claim.sub',(select member_user_id::text from set_case),true);
set local role authenticated;
do $$ declare e jsonb; begin
 select ev into e from jsonb_array_elements(public.get_app_database_v3()->'events') ev where ev->>'id'=(select event_id::text from set_case);
 if e->>'status'<>'open' or not (e->>'canRespond')::boolean then raise exception 'Manual reopening lost'; end if;
 perform public.mutate_app_v3('response',jsonb_build_object('id',(select event_id from set_case),'interest','yes'));
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select admin_id::text from set_case),true);
set local role authenticated;
do $$ declare state text; begin
 foreach state in array array['draft','open','confirmed','closed','cancelled'] loop
  perform public.mutate_app_v3('event',jsonb_build_object('id',(select event_id from set_case),'status',state));
  if (select status::text from public.events where id=(select event_id from set_case))<>state then raise exception 'Admin state %',state; end if;
 end loop;
end $$;
-- Changing the deadline without a status selection restores automatic confirmation.
select public.mutate_app_v3('event',jsonb_build_object('id',event_id,'status','open')) from set_case;
select public.mutate_app_v3('event',jsonb_build_object('id',event_id,'responseDeadline',now()-interval '2 days')) from set_case;
reset role;
select public.confirm_due_events();
do $$ begin
 if (select status from public.events where id=(select event_id from set_case))<>'confirmed' then raise exception 'Normal deadline no longer confirms'; end if;
end $$;
rollback;
