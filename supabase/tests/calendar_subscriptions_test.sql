-- Full schema integration: no real users, calendar tokens or event data.
begin;
-- Exclude any legacy migration fixture events from this isolated scenario.
update public.events set visibility='private';
create temp table calendar_case as select gen_random_uuid() u1, gen_random_uuid() u2,gen_random_uuid() shared_user,gen_random_uuid() m1,gen_random_uuid() m2,gen_random_uuid() s1,gen_random_uuid() s2;
insert into auth.users(id,email,raw_user_meta_data)
 select u1,'cal-'||u1||'@example.invalid','{}'::jsonb from calendar_case
 union all select u2,'cal-'||u2||'@example.invalid','{}'::jsonb from calendar_case
 union all select shared_user,'cal-'||shared_user||'@example.invalid','{}'::jsonb from calendar_case;
insert into public.user_roles(user_id,role) select u1,'member'::public.app_role from calendar_case union all select u2,'admin'::public.app_role from calendar_case;
insert into public.members(id,display_name,short_name,pairing_role,experience_level,is_active)
 select m1,'Calendar member','CM','lead'::public.pairing_role,'advanced'::public.experience_level,true from calendar_case union all select m2,'Calendar admin','CA','follow'::public.pairing_role,'advanced'::public.experience_level,true from calendar_case;
insert into public.member_accounts(member_id,email,desired_role,linked_user_id)
 select m1,'cal-'||u1||'@example.invalid','member'::public.app_role,u1 from calendar_case union all select m2,'cal-'||u2||'@example.invalid','admin'::public.app_role,u2 from calendar_case;
update public.profiles set member_id=(select m1 from calendar_case) where user_id=(select u1 from calendar_case);
update public.profiles set member_id=(select m2 from calendar_case) where user_id=(select u2 from calendar_case);
insert into public.seasons(id,name,date_from,date_to,kind) select s1,'Calendar old',current_date-730,current_date-366,'dance' from calendar_case union all select s2,'Calendar future',current_date,current_date+730,'carols' from calendar_case;
create temp table calendar_events (name text, id uuid default gen_random_uuid(), kind public.event_type, status public.event_status, visibility public.event_visibility, start_time timestamptz, season uuid);
insert into calendar_events(name,kind,status,visibility,start_time,season)
 select name,kind::public.event_type,status::public.event_status,visibility::public.event_visibility,starts,case when name='boundary' then s1 else s2 end from calendar_case cross join (values
 ('boundary','rehearsal','open','members',now()-interval '12 months'),
 ('too old','rehearsal','open','members',now()-interval '12 months'-interval '1 second'),
 ('future','performance','open','shared',now()+interval '2 years'),
 ('draft','rehearsal','draft','public',now()+interval '1 day'),
 ('private','performance','open','private',now()+interval '1 day'),
 ('cancelled','performance','cancelled','public',now()+interval '1 day')
 ) v(name,kind,status,visibility,starts);
insert into public.events(id,season_id,type,title,starts_at,ends_at,status,visibility,note,response_deadline)
 select id,season,kind,name,start_time,start_time+interval '1 hour',status,visibility,'Poznámka k akci',start_time-interval '1 day' from calendar_events;
create temp table calendar_tokens(kind text,token text);
grant select on calendar_case,calendar_events to authenticated;
grant all on calendar_tokens to authenticated;
select set_config('request.jwt.claim.sub',(select u1::text from calendar_case),true);
set local role authenticated;
do $$ declare t jsonb; begin
 if public.get_calendar_subscriptions()<>'[]'::jsonb then raise exception 'Initial metadata';end if;
 begin perform public.create_calendar_subscription('invalid');raise exception 'Invalid kind accepted';exception when raise_exception then if sqlerrm='Invalid kind accepted' then raise;end if;end;
 foreach t in array array[public.create_calendar_subscription('all'),public.create_calendar_subscription('rehearsal'),public.create_calendar_subscription('performance')] loop
 if length(t->>'token')<>64 then raise exception 'Not 256bit';end if;
 end loop;
 insert into calendar_tokens select 'old',public.create_calendar_subscription('all')->>'token';
 insert into calendar_tokens select 'all',public.create_calendar_subscription('all')->>'token';
 insert into calendar_tokens select 'rehearsal',public.create_calendar_subscription('rehearsal')->>'token';
 insert into calendar_tokens select 'performance',public.create_calendar_subscription('performance')->>'token';
 if public.get_calendar_subscriptions()::text like '%token%' then raise exception 'Token leaked in metadata';end if;
 begin perform 1 from public.calendar_subscriptions;raise exception 'Direct read allowed';exception when insufficient_privilege then null;end;
 begin insert into public.calendar_subscriptions(user_id,member_id,kind,token_hash) select u1,m1,'all','bad' from calendar_case;raise exception 'Direct write allowed';exception when insufficient_privilege then null;end;
 begin perform public.get_calendar_feed('bad');raise exception 'Client projection allowed';exception when insufficient_privilege then null;end;
end $$;
-- Real member/admin mutations exercise current response and provenance, never notes.
select public.mutate_app_v3('response',jsonb_build_object('id',(select id from calendar_events where name='future'),'interest','maybe','note','SECRET member note'));
reset role;
select set_config('request.jwt.claim.sub',(select u2::text from calendar_case),true);
set local role authenticated;
do $$ begin
 if public.get_calendar_subscriptions()<>'[]'::jsonb then raise exception 'Owner isolation';end if;
 perform public.revoke_calendar_subscription('all');
 perform public.create_calendar_subscription('all');
end $$;
select public.mutate_app_v3('attendance',jsonb_build_object('id',(select id from calendar_events where name='future'),'memberId',(select m1 from calendar_case),'interest','no','note','SECRET admin note'));
reset role;
-- Check server projection using service_role, without table grants.
grant select on calendar_tokens to service_role;
set local role service_role;
do $$ declare feed jsonb; begin
 if public.get_calendar_feed('bad') is not null then raise exception 'Invalid token';end if;
 if jsonb_array_length(public.get_calendar_feed((select encode(extensions.digest(token,'sha256'),'hex') from calendar_tokens where kind='all')))<>3 then raise exception 'Service projection';end if;
end $$;
reset role;
do $$ declare feed jsonb; row jsonb; begin
 if public.get_calendar_feed((select encode(extensions.digest(token,'sha256'),'hex') from calendar_tokens where kind='old')) is not null then raise exception 'Replaced token active';end if;
 feed:=public.get_calendar_feed((select encode(extensions.digest(token,'sha256'),'hex') from calendar_tokens where kind='all'));
 if jsonb_array_length(feed)<>3 then raise exception 'Period/draft/privacy selection: %',feed;end if;
 if jsonb_array_length(public.get_calendar_feed((select encode(extensions.digest(token,'sha256'),'hex') from calendar_tokens where kind='rehearsal')))<>1 then raise exception 'Rehearsal filter';end if;
 if jsonb_array_length(public.get_calendar_feed((select encode(extensions.digest(token,'sha256'),'hex') from calendar_tokens where kind='performance')))<>2 then raise exception 'Performance filter';end if;
 select value into row from jsonb_array_elements(feed) where value->>'title'='future';
 if row->>'response'<>'no' or row->>'memberResponse'<>'maybe' or row->>'adminResponse'<>'no' then raise exception 'Response provenance: %',row;end if;
 if feed::text like '%SECRET%' or feed::text like '%memberId%' or feed::text like '%attendance%' then raise exception 'Private data exported';end if;
 if (row->>'updatedAt')::timestamptz < (row->>'adminResponseAt')::timestamptz then raise exception 'Response timestamp missing';end if;
 select value into row from jsonb_array_elements(feed) where value->>'title'='boundary';
 if row->>'response'<>'unanswered' then raise exception 'Missing response';end if;
 select value into row from jsonb_array_elements(feed) where value->>'title'='cancelled';
 if row->>'status'<>'cancelled' then raise exception 'Cancellation lost';end if;
 if exists(select 1 from public.calendar_subscriptions group by user_id,kind having count(*) filter(where revoked_at is null)>1) then raise exception 'Active uniqueness';end if;
 if exists(select 1 from public.calendar_subscriptions c join calendar_tokens t on c.token_hash=t.token) then raise exception 'Plaintext token stored';end if;
end $$;
-- A later member response takes precedence over the earlier admin response.
select set_config('request.jwt.claim.sub',(select u1::text from calendar_case),true);
set local role authenticated;
select public.mutate_app_v3('response',jsonb_build_object('id',(select id from calendar_events where name='future'),'interest','yes'));
reset role;
do $$ declare row jsonb; begin
 select value into row from jsonb_array_elements(public.get_calendar_feed((select encode(extensions.digest(token,'sha256'),'hex') from calendar_tokens where kind='all'))) where value->>'title'='future';
 if row->>'response'<>'yes' or row->>'memberResponse'<>'yes' or row->>'adminResponse'<>'no' then raise exception 'Later member response lost';end if;
end $$;
-- Admin without an active profile link must also be rejected.
update public.profiles set member_id=null where user_id=(select u2 from calendar_case);
select set_config('request.jwt.claim.sub',(select u2::text from calendar_case),true);
set local role authenticated;
do $$ begin
 begin perform public.create_calendar_subscription('all');raise exception 'Unlinked admin allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Active member and BOTH account links checked on every request.
update public.members set is_active=false where id=(select m1 from calendar_case);
do $$ begin
 if public.get_calendar_feed((select encode(extensions.digest(token,'sha256'),'hex') from calendar_tokens where kind='all')) is not null then raise exception 'Inactive member feed';end if;
end $$;
select set_config('request.jwt.claim.sub',(select u1::text from calendar_case),true);
set local role authenticated;
do $$ begin
 begin perform public.create_calendar_subscription('all');raise exception 'Inactive allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.members set is_active=true where id=(select m1 from calendar_case);
update public.profiles set member_id=null where user_id=(select u1 from calendar_case);
do $$ begin
 if public.get_calendar_feed((select encode(extensions.digest(token,'sha256'),'hex') from calendar_tokens where kind='all')) is not null then raise exception 'Profile relink allowed';end if;
end $$;
update public.profiles set member_id=(select m1 from calendar_case) where user_id=(select u1 from calendar_case);
update public.member_accounts set linked_user_id=null where member_id=(select m1 from calendar_case);
do $$ begin
 if public.get_calendar_feed((select encode(extensions.digest(token,'sha256'),'hex') from calendar_tokens where kind='all')) is not null then raise exception 'Account relink allowed';end if;
end $$;
update public.member_accounts set linked_user_id=(select u1 from calendar_case) where member_id=(select m1 from calendar_case);
select set_config('request.jwt.claim.sub',(select u1::text from calendar_case),true);
set local role authenticated;
select public.revoke_calendar_subscription('all');
reset role;
do $$ begin
 if public.get_calendar_feed((select encode(extensions.digest(token,'sha256'),'hex') from calendar_tokens where kind='all')) is not null then raise exception 'Revoked token active';end if;
 if public.get_calendar_feed((select encode(extensions.digest(token,'sha256'),'hex') from calendar_tokens where kind='rehearsal')) is null then raise exception 'Revoked other kind';end if;
 if has_function_privilege('anon','public.get_calendar_feed(text)','execute') or has_function_privilege('authenticated','public.get_calendar_feed(text)','execute') or has_function_privilege('anon','public.create_calendar_subscription(text)','execute') then raise exception 'Public function access';end if;
end $$;
select set_config('request.jwt.claim.sub',(select shared_user::text from calendar_case),true);
set local role authenticated;
do $$ begin
 begin perform public.get_calendar_subscriptions();raise exception 'Shared allowed';exception when insufficient_privilege then null;end;
 begin perform public.create_calendar_subscription('all');raise exception 'Shared create allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
