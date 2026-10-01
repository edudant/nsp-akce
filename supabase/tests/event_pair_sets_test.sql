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
insert into public.events(id,season_id,title,type,starts_at,ends_at,status,points_weight)
 select event_id,season_id,'Set test','rehearsal',now()+interval '2 days',now()+interval '2 days 2 hours','open',1 from set_case;
grant select on set_case,set_members to authenticated,anon;
select set_config('request.jwt.claim.sub',(select admin_id::text from set_case),true);
set local role authenticated;
select public.add_attendance_batch_v4((select event_id from set_case),(select array_agg(id) from set_members),' {"interest":"yes","status":"present"}');
select public.mutate_app_v3('attendance',jsonb_build_object('id',c.event_id,'memberId',m.id,'standing',true)) from set_case c,set_members m where n=5;
create temp table saved_set as select public.save_pairs_v3(c.event_id,jsonb_build_array(
 jsonb_build_object('leaderId',(select id from set_members where n=1),'followerId',(select id from set_members where n=2),'ageGroup','old'),
 jsonb_build_object('leaderId',(select id from set_members where n=3),'followerId',(select id from set_members where n=4),'ageGroup','old','belowLine',true)
),true,'  Večerní sada  ') id from set_case c;
reset role;
grant select on saved_set to authenticated;
-- Change current participation, standing and active status after saving the snapshot.
update public.event_participants set standing=false,status='declined' where event_id=(select event_id from set_case);
update public.members set is_active=false where id=(select id from set_members where n=5);
select set_config('request.jwt.claim.sub',(select member_user_id::text from set_case),true);
set local role authenticated;
do $$ declare e jsonb; s jsonb; begin
 select ev into e from jsonb_array_elements(public.get_app_database_v3()->'events') ev where ev->>'id'=(select event_id::text from set_case);
 select v into s from jsonb_array_elements(e->'pairSets') v where v->>'id'=(select id::text from saved_set);
 if s->>'name'<>'Večerní sada' or jsonb_array_length(s->'roster')<>5 or jsonb_array_length(s->'pairs')<>2 then raise exception 'Saved set name/roster/pairs'; end if;
 if not exists(select 1 from jsonb_array_elements(s->'roster') r where r->>'memberId'=(select id::text from set_members where n=5) and (r->>'standing')::boolean and r->>'fullName'='Set member 5') then raise exception 'Standing snapshot changed'; end if;
 if not exists(select 1 from jsonb_array_elements(s->'pairs') p where (p->>'belowLine')::boolean) then raise exception 'Below-line pair missing'; end if;
 begin perform public.save_pairs_v3((select event_id from set_case),'[]',true,null); raise exception 'Expected member rejection'; exception when insufficient_privilege then null; end;
 begin perform public.pairing_roster_v6((select ev from public.events ev where id=(select event_id from set_case))); raise exception 'Expected direct helper rejection'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select admin_id::text from set_case),true);
set local role authenticated;
-- Save a set of standing/unpaired members without pairs, with the default date.
select public.add_attendance_batch_v4((select event_id from set_case),(select array_agg(id) from set_members where n<5),' {"interest":"yes","status":"present"}');
do $$ declare run_id uuid; saved jsonb; title text; before_count bigint; begin
 run_id:=public.save_pairs_v3((select event_id from set_case),'[]',true,'  ');
 select s into saved from jsonb_array_elements((select e->'pairSets' from jsonb_array_elements(public.get_app_database_v3()->'events') e where e->>'id'=(select event_id::text from set_case))) s where s->>'id'=run_id::text;
 title:=saved->>'name';
 if title<>to_char(now() at time zone 'Europe/Prague','FMDD. FMMM. YYYY HH24:MI') then raise exception 'Default date'; end if;
 if not (saved->>'published')::boolean or jsonb_array_length(saved->'roster')<>4 then raise exception 'Empty-pair set with unpaired members'; end if;
 select jsonb_array_length(e->'pairSets') into before_count from jsonb_array_elements(public.get_app_database_v3()->'events') e where e->>'id'=(select event_id::text from set_case);
 begin perform public.save_pairs_v3((select event_id from set_case),'[]',true,repeat('X',121)); raise exception 'Expected long title rejection'; exception when raise_exception then if sqlerrm='Expected long title rejection' then raise; end if; end;
 begin perform public.save_pairs_v3((select event_id from set_case),null,true,null); raise exception 'Expected null pairs rejection'; exception when raise_exception then if sqlerrm='Expected null pairs rejection' then raise; end if; end;
 if (select jsonb_array_length(e->'pairSets') from jsonb_array_elements(public.get_app_database_v3()->'events') e where e->>'id'=(select event_id::text from set_case))<>before_count then raise exception 'Invalid save left a partial set'; end if;
end $$;
reset role;
create temp table set_songs as select gen_random_uuid() id,n from generate_series(1,2) n;
insert into public.songs(id,name) select id,'Set song '||id from set_songs;
grant select on set_songs to authenticated;
set local role authenticated;
do $$ begin
 perform public.save_song_series_v6((select event_id from set_case),jsonb_build_object('name','Bulk songs','songIds',(select jsonb_agg(id) from set_songs),'confirmed',true));
 if not exists(select 1 from public.events where id=(select event_id from set_case) and singing) then raise exception 'Singing not enabled'; end if;
 if (select jsonb_array_length(e->'songSeries'->0->'songIds') from jsonb_array_elements(public.get_app_database_v3()->'events') e where e->>'id'=(select event_id::text from set_case))<>2 then raise exception 'Bulk songs not saved'; end if;
end $$;
reset role;
update public.events set singing=false where id=(select event_id from set_case);
set local role authenticated;
do $$ begin
 begin
  perform public.save_song_series_v6((select event_id from set_case),jsonb_build_object('name','Invalid','songIds',jsonb_build_array(gen_random_uuid()),'confirmed',true));
  raise exception 'Expected invalid song rejection';
 exception when raise_exception then if sqlerrm='Expected invalid song rejection' then raise; end if; end;
 if exists(select 1 from public.events where id=(select event_id from set_case) and singing) then raise exception 'Failed song save left singing enabled'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select member_user_id::text from set_case),true);
set local role authenticated;
do $$ begin
 begin perform public.save_song_series_v6((select event_id from set_case),'{}'); raise exception 'Expected song admin check'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
