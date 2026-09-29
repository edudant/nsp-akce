-- Attendance provenance and closure for rehearsals and performances.
alter table public.audit_log add column actor_kind text not null default 'legacy'
 check(actor_kind in ('legacy','member','admin','system'));
alter table public.audit_log add column actor_label text;
alter table public.audit_log add column source text not null default 'manual';
create function public.audit_actor_v4() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.actor_kind := case when auth.uid() is null then 'system' when public.is_admin() then 'admin' else 'member' end;
 new.actor_label := coalesce((select display_name from public.members where id=public.current_member_id()),(select display_name from public.profiles where user_id=auth.uid()),case when auth.uid() is null then 'Systém' else 'Správce' end);
 new.source := coalesce(nullif(current_setting('app.attendance_source',true),''),'manual');
 return new;
end; $$;
create trigger audit_actor_v4 before insert on public.audit_log for each row execute function public.audit_actor_v4();
revoke all on function public.audit_actor_v4() from public,anon,authenticated;

create or replace function public.prefill_closed_rehearsal_v3() returns trigger language plpgsql security definer set search_path='' as $$
declare previous text := current_setting('app.attendance_source',true);
begin
 if new.status='closed' and old.status<>'closed' then
  if auth.uid() is not null and not public.is_admin() then raise exception 'Akci uzavírá pouze správce.'; end if;
  if new.starts_at>now() then raise exception 'Akci lze uzavřít až po začátku.'; end if;
  perform set_config('app.attendance_source','closure',true);
  insert into public.attendance(event_id,member_id,status)
   select new.id,r.member_id,case when r.response='yes' then 'full'::public.attendance_status else 'absent'::public.attendance_status end from public.event_responses r where r.event_id=new.id and r.response in ('yes','no')
   on conflict(event_id,member_id) do update set status=excluded.status where public.attendance.status='unrecorded';
  insert into public.event_participants(event_id,member_id,status)
   select new.id,a.member_id,case when a.status in ('full','partial') then 'selected'::public.participant_status else 'invited'::public.participant_status end from public.attendance a where a.event_id=new.id and a.status<>'unrecorded'
   on conflict(event_id,member_id) do update set status=excluded.status;
  perform set_config('app.attendance_source',coalesce(previous,''),true);
 end if;
 return new;
end; $$;

create function public.attendance_provenance_v4(event_id uuid,member_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'memberResponse',(select jsonb_build_object('interest',case when new_data->>'response'='unanswered' then 'unset' else new_data->>'response' end,'note',case when public.view_is_admin_v3() or public.current_member_id()=member_id then new_data->>'note' else null end,'at',occurred_at) from public.audit_log where table_name='event_responses' and record_id=jsonb_build_object('event_id',event_id,'member_id',member_id) and actor_kind='member' order by id desc limit 1),
 'adminResponse',(select jsonb_build_object('interest',case when new_data->>'response'='unanswered' then 'unset' else new_data->>'response' end,'note',case when public.view_is_admin_v3() or public.current_member_id()=member_id then new_data->>'note' else null end,'at',occurred_at) from public.audit_log where table_name='event_responses' and record_id=jsonb_build_object('event_id',event_id,'member_id',member_id) and actor_kind='admin' order by id desc limit 1),
 'adminChangedAt',(select occurred_at from public.audit_log where table_name in ('event_responses','attendance','event_participants') and record_id=jsonb_build_object('event_id',event_id,'member_id',member_id) and actor_kind='admin' order by id desc limit 1)
 );
$$;
revoke all on function public.attendance_provenance_v4(uuid,uuid) from public,anon,authenticated;

create or replace function public.mutate_app_v3(action text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<mutation>>
declare target uuid; v_member_id uuid; e public.events; s public.seasons; series_id uuid; item jsonb; idx integer; pcent numeric; r public.event_responses; result jsonb := '{}'; begin
 target:=nullif(payload->>'id','')::uuid;
 if action not in ('response','wishes') then perform public.require_admin_v3(); end if;
 if action='season' then
  perform pg_advisory_xact_lock(628091);
  if target is not null and exists(select 1 from public.seasons existing_season where existing_season.id=target and existing_season.kind<>payload->>'kind') and exists(select 1 from public.events where season_id=target) then raise exception 'Typ sezóny s událostmi nelze změnit.'; end if;
  if coalesce((payload->>'active')::boolean,false) then update public.seasons set is_current=false where kind=payload->>'kind'; end if;
  if target is null then insert into public.seasons(name,kind,date_from,date_to,is_current) values(btrim(payload->>'name'),payload->>'kind',(payload->>'dateFrom')::date,(payload->>'dateTo')::date,(payload->>'active')::boolean) returning id into target;
  else update public.seasons set name=btrim(payload->>'name'),kind=payload->>'kind',date_from=(payload->>'dateFrom')::date,date_to=(payload->>'dateTo')::date,is_current=(payload->>'active')::boolean where id=target; end if;
 elsif action='member' then
  if target is null then insert into public.members(display_name,short_name,pairing_role,experience_level,age_group,age_groups,is_active,active_from,admin_note) values(payload->>'fullName',payload->>'shortName',case when payload->>'role'='leader' then 'lead'::public.pairing_role else 'follow'::public.pairing_role end,(payload->>'experience')::public.experience_level,nullif(payload->>'ageGroup','')::public.member_age_group,array(select jsonb_array_elements_text(coalesce(payload->'ageGroups','[]'))::public.member_age_group),(payload->>'active')::boolean,nullif(payload->>'joinedAt','')::date,payload->>'note') returning id into target;
  else update public.members set display_name=coalesce(payload->>'fullName',display_name),short_name=coalesce(payload->>'shortName',short_name),pairing_role=case when payload?'role' then case when payload->>'role'='leader' then 'lead'::public.pairing_role else 'follow'::public.pairing_role end else pairing_role end,experience_level=coalesce((payload->>'experience')::public.experience_level,experience_level),age_group=case when payload?'ageGroup' then nullif(payload->>'ageGroup','')::public.member_age_group else age_group end,age_groups=case when payload?'ageGroups' then array(select jsonb_array_elements_text(payload->'ageGroups')::public.member_age_group) else age_groups end,is_active=coalesce((payload->>'active')::boolean,is_active),active_from=case when payload?'joinedAt' then nullif(payload->>'joinedAt','')::date else active_from end,admin_note=case when payload?'note' then payload->>'note' else admin_note end where id=target; end if;
  select public.member_json_v3(m) into result from public.members m where id=target;
 elsif action='song' then
  if target is null then insert into public.songs(name,category_id,is_active) values(btrim(payload->>'name'),nullif(payload->>'categoryId','')::uuid,(payload->>'active')::boolean) returning id into target;
  else update public.songs set name=btrim(payload->>'name'),category_id=nullif(payload->>'categoryId','')::uuid,is_active=(payload->>'active')::boolean where id=target; end if;
 elsif action='category' then
  if target is null then insert into public.song_categories(name) values(btrim(payload->>'name')) returning id into target; else update public.song_categories set name=btrim(payload->>'name') where id=target; end if;
 elsif action='event' then
  if target is null then
   select * into s from public.seasons where id=(payload->>'seasonId')::uuid;
   if s.id is null then raise exception 'Vyberte sezónu.'; end if;
   insert into public.events(season_id,type,title,location,starts_at,ends_at,status,points_weight,required_pairs,old_pairs,young_pairs,response_deadline,visibility,note,singing)
    values(s.id,(payload->>'type')::public.event_type,payload->>'title',payload->>'location',((payload->>'date')||' '||(payload->>'startTime'))::timestamp at time zone 'Europe/Prague',((payload->>'date')||' '||(payload->>'endTime'))::timestamp at time zone 'Europe/Prague','open',(payload->>'weight')::numeric,coalesce((payload->>'oldPairs')::integer,0)+coalesce((payload->>'youngPairs')::integer,0),case when s.kind='dance' and payload->>'type'='performance' then coalesce((payload->>'oldPairs')::integer,0) else 0 end,case when s.kind='dance' and payload->>'type'='performance' then coalesce((payload->>'youngPairs')::integer,0) else 0 end,nullif(payload->>'responseDeadline','')::timestamptz,'public',payload->>'note',coalesce((payload->>'singing')::boolean,false)) returning id into target;
  else
   select * into e from public.events where id=target for update;
   if e.id is null then raise exception 'Událost neexistuje.'; end if;
   if payload?'seasonId' and exists(select 1 from public.seasons where id=(payload->>'seasonId')::uuid and kind='carols') and exists(select 1 from public.pairing_runs where event_id=e.id) then raise exception 'Událost s páry nelze přesunout do koled.'; end if;
   update public.events set season_id=coalesce((payload->>'seasonId')::uuid,season_id),title=coalesce(payload->>'title',title),location=coalesce(payload->>'location',location),starts_at=case when payload?'date' then ((payload->>'date')||' '||coalesce(payload->>'startTime',to_char(e.starts_at at time zone 'Europe/Prague','HH24:MI')))::timestamp at time zone 'Europe/Prague' else starts_at end,ends_at=case when payload?'date' then ((payload->>'date')||' '||coalesce(payload->>'endTime',to_char(e.ends_at at time zone 'Europe/Prague','HH24:MI')))::timestamp at time zone 'Europe/Prague' else ends_at end,status=coalesce((payload->>'status')::public.event_status,status),points_weight=coalesce((payload->>'weight')::numeric,points_weight),old_pairs=coalesce((payload->>'oldPairs')::integer,old_pairs),young_pairs=coalesce((payload->>'youngPairs')::integer,young_pairs),response_deadline=case when payload?'responseDeadline' then (payload->>'responseDeadline')::timestamptz else response_deadline end,singing=coalesce((payload->>'singing')::boolean,singing),note=case when payload?'note' then payload->>'note' else note end where id=target;
  end if;
 elsif action in ('attendance','response','wishes','adminWishes','series','deleteSeries') then
  select * into e from public.events where id=target for update;
  if e.id is null then raise exception 'Událost neexistuje.'; end if;
  v_member_id:=case when action in ('response','wishes') then public.current_member_id() else nullif(payload->>'memberId','')::uuid end;
  if action in ('response','wishes') and (v_member_id is null or not public.can_member_respond(e.id)) then raise exception 'Odpovědi jsou uzamčené.' using errcode='42501'; end if;
  if action='attendance' and coalesce((payload->>'selected')::boolean,false) and not (payload?'status') then payload := payload || '{"status":"present"}'::jsonb; end if;
  if action in ('attendance','response') then
   if payload?'status' or payload?'attendancePercent' then
    pcent:=nullif(payload->>'attendancePercent','')::numeric;
    insert into public.attendance(event_id,member_id,status,attendance_percent,confirmed_by,confirmed_at) values(e.id,v_member_id,case payload->>'status' when 'present' then 'full'::public.attendance_status when 'partial' then 'partial'::public.attendance_status when 'absent' then 'absent'::public.attendance_status when 'excused' then 'excused'::public.attendance_status else 'unrecorded'::public.attendance_status end,pcent,auth.uid(),now()) on conflict(event_id,member_id) do update set status=case when payload?'status' then excluded.status else public.attendance.status end,attendance_percent=coalesce(pcent,public.attendance.attendance_percent),confirmed_at=now(),confirmed_by=auth.uid();
   end if;
   if payload?'interest' then
    insert into public.event_responses(event_id,member_id,response,note) values(e.id,v_member_id,case when payload->>'interest'='unset' then 'unanswered'::public.event_response_status else (payload->>'interest')::public.event_response_status end,nullif(btrim(payload->>'note'),'')) on conflict(event_id,member_id) do update set response=excluded.response,note=case when payload?'note' then excluded.note else public.event_responses.note end;
   end if;
   if payload?'selected' or payload?'standing' then
    insert into public.event_participants(event_id,member_id,status,standing) values(e.id,v_member_id,case when coalesce((payload->>'selected')::boolean,false) then 'selected'::public.participant_status else 'invited'::public.participant_status end,coalesce((payload->>'standing')::boolean,false)) on conflict(event_id,member_id) do update set status=case when payload?'selected' then excluded.status else public.event_participants.status end,standing=case when payload?'standing' then excluded.standing else public.event_participants.standing end;
   end if;
  elsif action in ('wishes','adminWishes') then
   if action='wishes' and not public.can_member_set_partner_wishes(e.id) then raise exception 'Přání zde nelze měnit.'; end if;
   delete from public.event_partner_wishes where event_id=e.id and public.event_partner_wishes.member_id=v_member_id;
   for item in select value from jsonb_array_elements(payload->'partnerIds') loop insert into public.event_partner_wishes(event_id,member_id,partner_member_id) values(e.id,v_member_id,(item#>>'{}')::uuid); end loop;
  elsif action='deleteSeries' then delete from public.song_series where id=(payload->>'seriesId')::uuid and event_id=e.id;
  elsif action='series' then
   if not e.singing then raise exception 'Nejprve zapněte zpívání.'; end if;
   series_id:=nullif(payload->>'seriesId','')::uuid;
   if series_id is null then insert into public.song_series(event_id,name,confirmed,position) values(e.id,payload->>'name',coalesce((payload->>'confirmed')::boolean,false),coalesce((select max(position)+1 from public.song_series where event_id=e.id),1)) returning id into series_id;
   else update public.song_series set name=payload->>'name',confirmed=coalesce((payload->>'confirmed')::boolean,false) where id=series_id and event_id=e.id; if not found then raise exception 'Série neexistuje.'; end if; end if;
   if (payload->>'confirmed')::boolean and jsonb_array_length(payload->'songIds')=0 then raise exception 'Prázdnou sérii nelze potvrdit.'; end if;
   delete from public.song_series_items where public.song_series_items.series_id=mutation.series_id;
   idx:=0; for item in select value from jsonb_array_elements(payload->'songIds') loop
    idx:=idx+1;
    if not exists(select 1 from public.songs where id=(item#>>'{}')::uuid) then raise exception 'Píseň neexistuje.'; end if;
    insert into public.song_series_items(event_id,series_id,song_id,position) values(e.id,series_id,(item#>>'{}')::uuid,idx);
   end loop;
  end if;
 else raise exception 'Neznámá akce.'; end if;
 return result||jsonb_build_object('id',target); end; $$;

create or replace function public.event_json_v3(e public.events) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; roster boolean; run_id uuid; kind text; begin
 roster:=public.view_is_admin_v3() or e.type='rehearsal' or public.event_confirmed_v3(e);
 select s.kind into kind from public.seasons s where s.id=e.season_id;
 select pr.id into run_id from public.pairing_runs pr where pr.event_id=e.id and (public.view_is_admin_v3() or pr.status='published') order by
  case when not public.view_is_admin_v3() and e.status='closed' and exists(select 1 from public.event_pairs p where p.pairing_run_id=pr.id and p.is_confirmed_actual) then 0 else 1 end,
  pr.generated_at desc limit 1;
 select jsonb_build_object('id',e.id,'seasonId',e.season_id,'seasonKind',kind,'title',e.title,'type',e.type,'date',to_char(e.starts_at at time zone 'Europe/Prague','YYYY-MM-DD'),'startTime',to_char(e.starts_at at time zone 'Europe/Prague','HH24:MI'),'endTime',to_char(e.ends_at at time zone 'Europe/Prague','HH24:MI'),'location',coalesce(e.location,''),'status',case when e.status='open' and public.event_confirmed_v3(e) then 'confirmed' else e.status::text end,'weight',e.points_weight,'capacityPairs',e.old_pairs+e.young_pairs,'oldPairs',e.old_pairs,'youngPairs',e.young_pairs,'program',e.program,'note',e.note,'responseDeadline',e.response_deadline,'canClose',e.starts_at<=now(),'canRespond',public.current_member_id() is not null and public.can_member_respond(e.id),'attendanceScope',case when roster then 'all' when public.current_member_id() is not null then 'self' else 'none' end,'eventDetailsAvailable',true,'singing',e.singing,
 'partnerOptions',coalesce((select jsonb_agg(b.id) from public.members a cross join public.members b where a.id=public.current_member_id() and b.is_active and a.id<>b.id and a.pairing_role<>b.pairing_role and a.age_groups && b.age_groups and e.type='performance' and kind='dance' and not exists(select 1 from public.pairing_preferences pp where pp.member_a_id=least(a.id,b.id) and pp.member_b_id=greatest(a.id,b.id) and pp.kind='forbidden' and (pp.valid_from is null or pp.valid_from<=(e.starts_at at time zone 'Europe/Prague')::date) and (pp.valid_to is null or pp.valid_to>=(e.starts_at at time zone 'Europe/Prague')::date))),'[]'),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('memberId',m.id,'status',case a.status when 'full' then 'present' when 'partial' then 'partial' when 'absent' then 'absent' when 'excused' then 'excused' else 'unknown' end,'attendancePercent',a.attendance_percent,'attendedMinutes',a.minutes_present,'earnedPoints',case when e.status='closed' then coalesce(a.effective_points,0) else 0 end,'interest',case when r.response='unanswered' or r.response is null then 'unset' else r.response::text end,'note',r.note,'selected',coalesce(p.status='selected',false),'standing',coalesce(p.standing,false),'actualStanding',e.type='performance' and coalesce(p.actual_standing,false)) || public.attendance_provenance_v4(e.id,m.id) order by m.display_name) from public.members m left join public.attendance a on a.member_id=m.id and a.event_id=e.id left join public.event_responses r on r.member_id=m.id and r.event_id=e.id left join public.event_participants p on p.member_id=m.id and p.event_id=e.id where m.is_active and (roster or m.id=public.current_member_id())),'[]'),
 'pairs',coalesce((select jsonb_agg(public.pair_json_v3(p) order by p.below_line,p.age_group,p.id) from public.event_pairs p where p.pairing_run_id=run_id),'[]'),
 'actualPairs',coalesce((select jsonb_agg(public.pair_json_v3(p)) from public.event_pairs p join public.pairing_runs pr on pr.id=p.pairing_run_id where pr.event_id=e.id and e.type='performance' and p.is_confirmed_actual),'[]'),
 'pairsPublished',coalesce((select status='published' from public.pairing_runs where id=run_id),false),
 'pairSets',coalesce((select jsonb_agg(jsonb_build_object('id',pr.id,'name',coalesce(pr.note,'Sada párů'),'createdAt',pr.generated_at,'published',pr.status='published','pairs',coalesce((select jsonb_agg(public.pair_json_v3(p)) from public.event_pairs p where p.pairing_run_id=pr.id),'[]')) order by pr.generated_at desc) from public.pairing_runs pr where pr.event_id=e.id and e.type='rehearsal' and (public.view_is_admin_v3() or pr.status='published')),'[]'),
 'songSeries',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'name',ss.name,'confirmed',ss.confirmed,'songIds',coalesce((select jsonb_agg(si.song_id order by si.position) from public.song_series_items si where si.series_id=ss.id),'[]')) order by ss.position,ss.id) from public.song_series ss where ss.event_id=e.id and (public.view_is_admin_v3() or ss.confirmed)),'[]'),
 'programItems',coalesce((select jsonb_agg(jsonb_build_object('id',pi.id,'catalogId',pi.catalog_program_id,'name',coalesce(pc.name,pi.custom_name),'custom',pi.catalog_program_id is null,'sortOrder',pi.position) order by pi.position) from public.event_program_items pi left join public.program_catalog pc on pc.id=pi.catalog_program_id where pi.event_id=e.id),'[]')
 ) into result; return result; end; $$;

create function public.get_event_audit_v4(target_event_id uuid,target_member_id uuid default null,member_preview boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare can_admin boolean := public.is_admin() and not member_preview; result jsonb;
begin
 if member_preview then perform public.require_admin_v3(); end if;
 if not public.can_read_app_v3() or not exists(select 1 from public.events e where e.id=target_event_id and (can_admin or (e.status<>'draft' and e.visibility in ('public','members','shared')))) then raise exception 'Akce není dostupná.' using errcode='42501'; end if;
 if not can_admin and (public.current_member_id() is null or (target_member_id is not null and target_member_id<>public.current_member_id())) then raise exception 'Audit není dostupný.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'at',a.occurred_at,'actorKind',a.actor_kind,'actorName',coalesce(a.actor_label,'Dřívější změna'),'source',a.source,'kind',case a.table_name when 'event_responses' then 'response' when 'attendance' then 'attendance' when 'events' then 'status' else 'selection' end,'memberId',a.record_id->>'member_id','action',a.action,'before',public.audit_values_v4(a.table_name,a.old_data),'after',public.audit_values_v4(a.table_name,a.new_data)) order by a.id desc),'[]') into result
 from public.audit_log a where
 ((a.table_name in ('event_responses','attendance','event_participants') and a.record_id->>'event_id'=target_event_id::text and (case when can_admin then target_member_id is null or a.record_id->>'member_id'=target_member_id::text else a.record_id->>'member_id'=public.current_member_id()::text end))
 or (a.table_name='events' and a.record_id->>'id'=target_event_id::text and (a.old_data->'status' is distinct from a.new_data->'status') and target_member_id is null))
 and public.audit_values_v4(a.table_name,a.old_data) is distinct from public.audit_values_v4(a.table_name,a.new_data);
 return result;
end; $$;
create function public.audit_values_v4(table_name text,data jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when data is null then null else coalesce((select jsonb_object_agg(key,value) from jsonb_each(data) where key = any(case table_name when 'event_responses' then array['response','note'] when 'attendance' then array['status','attendance_percent'] when 'event_participants' then array['status','standing','actual_standing'] else array['status'] end)),'{}') end;
$$;
revoke all on function public.audit_values_v4(text,jsonb) from public,anon,authenticated;
revoke all on function public.get_event_audit_v4(uuid,uuid,boolean) from public,anon;
grant execute on function public.get_event_audit_v4(uuid,uuid,boolean) to authenticated;
