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
 select m.id,'sets-'||c.member_user_id||'@example.invalid','member',c.member_user_id from set_case c,set_members m where n=5;
update public.profiles set member_id=(select id from set_members where n=5) where user_id=(select member_user_id from set_case);
insert into public.seasons(id,name,date_from,date_to,kind)
 select season_id,'Set test',current_date-1,current_date+30,'dance' from set_case;
insert into public.events(id,season_id,title,type,starts_at,ends_at,status,points_weight)
 select event_id,season_id,'Set test','rehearsal',now()+interval '2 days',now()+interval '2 days 2 hours','open',1 from set_case;
grant select on set_case,set_members to authenticated,anon;
select set_config('request.jwt.claim.sub',(select admin_id::text from set_case),true);
set local role authenticated;
select public.add_attendance_batch_v4((select event_id from set_case),(select array_agg(id) from set_members),' {"interest":"yes","status":"present"}');
select public.mutate_app_v3('attendance',jsonb_build_object('id',c.event_id,'memberId',m.id,'standing',false)) from set_case c,set_members m where n=5;

do $$ declare created jsonb; begin
 created:=public.mutate_app_v3('member',jsonb_build_object('fullName','New photographer','shortName','NP','role','photographer','experience','advanced','ageGroup','old','ageGroups',jsonb_build_array('old'),'active',true));
 if created->>'role'<>'photographer' then raise exception 'New photographer role lost';end if;
end $$;
select public.mutate_app_v3('member',jsonb_build_object('id',id,'role','photographer')) from set_members where n=5;
create temp table edited_set as select public.save_pairs_v3(c.event_id,jsonb_build_array(
 jsonb_build_object('leaderId',(select id from set_members where n=1),'followerId',(select id from set_members where n=2),'ageGroup','old'),
 jsonb_build_object('leaderId',(select id from set_members where n=3),'followerId',(select id from set_members where n=4),'ageGroup','old','belowLine',true)
),true,null) id from set_case c;
reset role;
grant select on edited_set to authenticated;
create temp table saved_before as select pr.id,pr.generated_at,pr.rules_snapshot,(select jsonb_agg(public.pair_json_v3(p) order by p.id) from public.event_pairs p where p.pairing_run_id=pr.id) pairs from public.pairing_runs pr where pr.id=(select id from edited_set);
grant select on saved_before to authenticated;
do $$ declare e jsonb; result uuid; before_count bigint; begin
 select ev into e from jsonb_array_elements(public.get_app_database_v3()->'events') ev where ev->>'id'=(select event_id::text from set_case);
 if e->'pairSets'->0->>'name'<>to_char(now() at time zone 'Europe/Prague','FMDD. FMMM. YYYY HH24:MI') then raise exception 'Default name lacks minutes'; end if;
 if jsonb_array_length(e->'pairSets'->0->'roster')<>4 then raise exception 'Photographer included in roster'; end if;
 if (select m->>'role' from jsonb_array_elements(public.get_app_database_v3()->'members') m where m->>'id'=(select id::text from set_members where n=5))<>'photographer' then raise exception 'Photographer role lost'; end if;
 select count(*) into before_count from public.pairing_runs where event_id=(select event_id from set_case);
 -- Current participation changes must not prevent renaming the saved snapshot.
 perform public.mutate_app_v3('attendance',jsonb_build_object('id',(select event_id from set_case),'memberId',(select id from set_members where n=1),'status','absent'));
 result:=public.update_pair_set_v7((select event_id from set_case),(select id from edited_set),(select pairs from saved_before),'Přejmenovaná',true);
 if result<>(select id from edited_set) or (select count(*) from public.pairing_runs where event_id=(select event_id from set_case))<>before_count then raise exception 'Rename duplicated set'; end if;
 if (select rules_snapshot from public.pairing_runs where id=result) is distinct from (select rules_snapshot from saved_before) or (select generated_at from public.pairing_runs where id=result) is distinct from (select generated_at from saved_before) then raise exception 'Rename changed snapshot or set order'; end if;
 if (select jsonb_agg(public.pair_json_v3(p) order by p.id) from public.event_pairs p where p.pairing_run_id=result) is distinct from (select pairs from saved_before) then raise exception 'Rename rebuilt pairs'; end if;
 begin
  perform public.update_pair_set_v7((select event_id from set_case),result,jsonb_set((select pairs from saved_before),'{0,belowLine}',to_jsonb(not (select (pairs->0->>'belowLine')::boolean from saved_before))),'Invalid',true);
  raise exception 'Expected ineligible pair rejection';
 exception when raise_exception then if sqlerrm='Expected ineligible pair rejection' then raise; end if; end;
 if (select note from public.pairing_runs where id=result)<>'Přejmenovaná' or (select jsonb_agg(public.pair_json_v3(p) order by p.id) from public.event_pairs p where p.pairing_run_id=result) is distinct from (select pairs from saved_before) then raise exception 'Failed edit partially changed set'; end if;
 perform public.mutate_app_v3('attendance',jsonb_build_object('id',(select event_id from set_case),'memberId',(select id from set_members where n=1),'status','present'));
 perform public.update_pair_set_v7((select event_id from set_case),result,jsonb_set((select pairs from saved_before),'{0,belowLine}',to_jsonb(not (select (pairs->0->>'belowLine')::boolean from saved_before))),'Upravená',true);
 if (select count(*) from public.pairing_runs where event_id=(select event_id from set_case))<>before_count then raise exception 'Pair edit duplicated set'; end if;
 if (select below_line from public.event_pairs where id=((select pairs->0->>'id' from saved_before)::uuid)) is not distinct from (select (pairs->0->>'belowLine')::boolean from saved_before) then raise exception 'Pair edit lost'; end if;
 begin perform public.update_pair_set_v7(gen_random_uuid(),result,'[]','Wrong event',true);raise exception 'Expected wrong event rejection';exception when raise_exception then if sqlerrm='Expected wrong event rejection' then raise; end if; end;
 begin perform public.save_pairs_v3((select event_id from set_case),jsonb_build_array(jsonb_build_object('leaderId',(select id from set_members where n=5),'followerId',(select id from set_members where n=2),'ageGroup','old')),true,null);raise exception 'Expected photographer rejection';exception when raise_exception then if sqlerrm='Expected photographer rejection' then raise; end if; end;
 begin perform public.mutate_app_v3('adminWishes',jsonb_build_object('id',(select event_id from set_case),'memberId',(select id from set_members where n=1),'partnerIds',jsonb_build_array((select id from set_members where n=5))));raise exception 'Expected photographer wish rejection';exception when raise_exception then if sqlerrm='Expected photographer wish rejection' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select member_user_id::text from set_case),true);
set local role authenticated;
do $$ begin
 perform public.mutate_app_v3('response',jsonb_build_object('id',(select event_id from set_case),'interest','yes'));
 if (select response from public.event_responses where event_id=(select event_id from set_case) and member_id=(select id from set_members where n=5))<>'yes' then raise exception 'Photographer RSVP'; end if;
 begin perform public.update_pair_set_v7((select event_id from set_case),(select id from edited_set),'[]','Denied',true);raise exception 'Expected member edit rejection';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Performance sets retain their order and publication state when an older set is renamed.
update public.events set type='performance',response_deadline=now()+interval '1 day' where id=(select event_id from set_case);
update public.pairing_runs set generated_at=now()-interval '1 hour' where id=(select id from edited_set);
select set_config('request.jwt.claim.sub',(select admin_id::text from set_case),true);
set local role authenticated;
create temp table newer_set as select public.save_pairs_v3((select event_id from set_case),'[]',true,'Novější') id;
reset role;
grant select on newer_set to authenticated;
do $$ declare current_pairs jsonb; begin
 select e->'pairSets'->1->'pairs' into current_pairs from jsonb_array_elements(public.get_app_database_v3()->'events') e where e->>'id'=(select event_id::text from set_case);
 perform public.update_pair_set_v7((select event_id from set_case),(select id from edited_set),current_pairs,'Starší přejmenovaná',true);
 if (select status from public.pairing_runs where id=(select id from edited_set))<>'superseded' then raise exception 'Old set resurrected'; end if;
 if (select e->'pairSets'->0->>'name' from jsonb_array_elements(public.get_app_database_v3()->'events') e where e->>'id'=(select event_id::text from set_case))<>'Novější' then raise exception 'Old rename became newest'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select member_user_id::text from set_case),true);
set local role authenticated;
do $$ declare e jsonb; begin
 select ev into e from jsonb_array_elements(public.get_app_database_v3()->'events') ev where ev->>'id'=(select event_id::text from set_case);
 if not (e->>'canRespond')::boolean or jsonb_array_length(e->'partnerOptions')<>0 then raise exception 'Photographer response/partner availability'; end if;
 perform public.mutate_app_v3('response',jsonb_build_object('id',(select event_id from set_case),'interest','no'));
 begin perform public.mutate_app_v3('wishes',jsonb_build_object('id',(select event_id from set_case),'partnerIds','[]'::jsonb));raise exception 'Expected photographer wishes rejection';exception when raise_exception then if sqlerrm='Expected photographer wishes rejection' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.update_pair_set_v7(uuid,uuid,jsonb,text,boolean)','execute') then raise exception 'Anonymous edit allowed'; end if;
end $$;
rollback;
