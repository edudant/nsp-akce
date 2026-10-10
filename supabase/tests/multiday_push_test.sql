begin;
update public.events set visibility='private';
create temp table push_case as select gen_random_uuid() u1,gen_random_uuid() u2,gen_random_uuid() m1,gen_random_uuid() m2,gen_random_uuid() season;
insert into auth.users(id,email,raw_user_meta_data)
 select u1,'push-'||u1||'@example.invalid','{}'::jsonb from push_case union all select u2,'push-'||u2||'@example.invalid','{}'::jsonb from push_case;
insert into public.user_roles(user_id,role) select u1,'member'::public.app_role from push_case union all select u2,'admin'::public.app_role from push_case;
insert into public.members(id,display_name,short_name,pairing_role,experience_level,is_active)
 select m1,'Push member','PM','lead'::public.pairing_role,'advanced'::public.experience_level,true from push_case union all select m2,'Push admin','PA','follow'::public.pairing_role,'advanced'::public.experience_level,true from push_case;
insert into public.member_accounts(member_id,email,desired_role,linked_user_id)
 select m1,'push-'||u1||'@example.invalid','member'::public.app_role,u1 from push_case union all select m2,'push-'||u2||'@example.invalid','admin'::public.app_role,u2 from push_case;
update public.profiles set member_id=(select m1 from push_case) where user_id=(select u1 from push_case);
update public.profiles set member_id=(select m2 from push_case) where user_id=(select u2 from push_case);
insert into public.seasons(id,name,date_from,date_to,kind) select season,'Push season',current_date,current_date+730,'dance' from push_case;
create temp table push_events(name text,id uuid default gen_random_uuid(),status public.event_status,visibility public.event_visibility,deadline timestamptz);
insert into push_events(name,status,visibility,deadline) values
 ('eligible','open','members',now()+interval '1 hour'),
 ('answered','open','members',now()+interval '2 hours'),
 ('far','open','public',now()+interval '25 hours'),
 ('past','open','public',now()-interval '1 minute'),
 ('private','open','private',now()+interval '1 hour'),
 ('cancelled','cancelled','public',now()+interval '1 hour'),
 ('confirmed','confirmed','public',now()+interval '1 hour');
insert into public.events(id,season_id,type,title,starts_at,ends_at,status,visibility,response_deadline)
 select e.id,c.season,'performance',e.name,now()+interval '3 days',now()+interval '3 days 1 hour',e.status,e.visibility,e.deadline from push_events e cross join push_case c;
insert into public.event_responses(event_id,member_id,response,note) select e.id,c.m1,'maybe','Čekám' from push_events e cross join push_case c where e.name='answered';
-- maybe requires a nonblank reason (exercise actual constraint).
grant select on push_case,push_events to authenticated;
select set_config('request.jwt.claim.sub',(select u1::text from push_case),true);
set local role authenticated;
select public.save_my_push_subscription(jsonb_build_object('endpoint','https://fcm.googleapis.com/test','keys',jsonb_build_object('p256dh',repeat('a',87),'auth',repeat('b',22))));
do $$ begin
 if not public.get_my_push_subscription('https://fcm.googleapis.com/test') then raise exception 'Opt in missing'; end if;
 begin perform public.claim_push_reminders(); raise exception 'Client can send'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.push_subscriptions; raise exception 'Client can read tokens'; exception when insufficient_privilege then null; end;
 begin perform public.save_my_push_subscription('{"endpoint":"https://localhost/secret","keys":{}}'); raise exception 'Arbitrary endpoint accepted'; exception when raise_exception then if sqlerrm='Arbitrary endpoint accepted' then raise; end if; end;
end $$;
reset role;
-- Service claims only unanswered, linked active members and deadlines within 24h.
do $$ declare jobs jsonb; lease uuid; begin
 jobs:=public.claim_push_reminders();
 if jsonb_array_length(jobs)<>1 or jobs->0->>'title'<>'eligible' then raise exception 'Eligibility: %',jobs; end if;
 lease:=(jobs->0->>'leaseId')::uuid;
 if not public.push_reminder_is_current(lease) then raise exception 'Fresh lease rejected'; end if;
 insert into public.event_responses(event_id,member_id,response) select e.id,c.m1,'yes' from push_events e cross join push_case c where e.name='eligible';
 if public.push_reminder_is_current(lease) then raise exception 'Response after claim ignored'; end if;
 delete from public.event_responses where event_id=(select id from push_events where name='eligible');
 if public.claim_push_reminders()<>'[]'::jsonb then raise exception 'Duplicate claim'; end if;
 update public.push_reminder_deliveries set claimed_at=now()-interval '11 minutes';
 jobs:=public.claim_push_reminders();
 if jsonb_array_length(jobs)<>1 or (jobs->0->>'leaseId')::uuid=lease then raise exception 'Retry lease missing'; end if;
 perform public.finish_push_reminder(lease,false);
 if exists(select 1 from public.push_reminder_deliveries where sent_at is not null) then raise exception 'Old lease marked new delivery'; end if;
 perform public.finish_push_reminder((jobs->0->>'leaseId')::uuid,false);
 if public.claim_push_reminders()<>'[]'::jsonb then raise exception 'Sent reminder claimed again'; end if;
end $$;
-- A changed deadline gets a new reminder. An inactive or relinked account does not.
update public.events set response_deadline=now()+interval '3 hours' where id=(select id from push_events where name='eligible');
update public.members set is_active=false where id=(select m1 from push_case);
do $$ begin if public.claim_push_reminders()<>'[]'::jsonb then raise exception 'Inactive member notified'; end if; end $$;
update public.members set is_active=true where id=(select m1 from push_case);
update public.member_accounts set linked_user_id=null where member_id=(select m1 from push_case);
do $$ begin if public.claim_push_reminders()<>'[]'::jsonb then raise exception 'Unlinked member notified'; end if; end $$;
update public.member_accounts set linked_user_id=(select u1 from push_case) where member_id=(select m1 from push_case);
do $$ begin if jsonb_array_length(public.claim_push_reminders())<>1 then raise exception 'Changed deadline missing'; end if; end $$;
-- Another owner cannot inspect or revoke the subscription.
select set_config('request.jwt.claim.sub',(select u2::text from push_case),true);
set local role authenticated;
do $$ begin
 if public.get_my_push_subscription('https://fcm.googleapis.com/test') then raise exception 'Other owner sees subscription'; end if;
 perform public.delete_my_push_subscription('https://fcm.googleapis.com/test');
end $$;
-- Admin creates/edits a multiday event with an earlier end clock time.
do $$ declare result jsonb; eid uuid; begin
 result:=public.mutate_app_v3('event',jsonb_build_object('seasonId',(select season from push_case),'type','performance','title','Vícedenní','date','2027-06-01','endDate','2027-06-03','startTime','19:00','endTime','10:00','weight',2,'responseDeadline','2027-05-30T12:00:00Z'));
 eid:=(result->>'id')::uuid;
 perform public.mutate_app_v3('event',jsonb_build_object('id',eid,'endDate','2027-06-04'));
end $$;
reset role;
do $$ declare e public.events; j jsonb; begin
 select * into e from public.events where title='Vícedenní';
 if (e.ends_at at time zone 'Europe/Prague')::date<>'2027-06-04' or e.ends_at<=e.starts_at then raise exception 'Multi day persistence'; end if;
 j:=public.event_json_v3(e);
 if j->>'endDate'<>'2027-06-04' or j->>'endTime'<>'10:00' then raise exception 'Multi day projection: %',j; end if;
 if (select count(*) from public.push_subscriptions)<>1 then raise exception 'Foreign revocation'; end if;
end $$;
-- Opt out removes outstanding deliveries as well.
select set_config('request.jwt.claim.sub',(select u1::text from push_case),true);
set local role authenticated;
select public.delete_my_push_subscription('https://fcm.googleapis.com/test');
reset role;
do $$ begin
 if exists(select 1 from public.push_subscriptions) or exists(select 1 from public.push_reminder_deliveries) then raise exception 'Opt out incomplete'; end if;
end $$;
rollback;
