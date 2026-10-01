-- Photographers can respond to events but are not dance participants.
alter type public.pairing_role add value if not exists 'photographer';

create or replace function public.member_json_v3(m public.members) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'fullName',m.display_name,'shortName',m.short_name,'role',case m.pairing_role::text when 'lead' then 'leader' when 'follow' then 'follower' else m.pairing_role::text end,'ageGroup',m.age_group,'ageGroups',m.age_groups,'active',m.is_active,'joinedAt',coalesce(m.active_from::text,''),'experienceKnown',public.view_is_admin_v3()) ||
 case when public.view_is_admin_v3() then jsonb_build_object('experience',m.experience_level,'note',m.admin_note,'account',(select jsonb_build_object('memberId',ma.member_id,'email',ma.email,'role',ma.desired_role,'linkedUserId',ma.linked_user_id,'activatedAt',ma.activated_at,'lastInvitationSentAt',ma.last_invitation_sent_at,'lastSignInAt',ma.last_sign_in_at) from public.member_accounts ma where ma.member_id=m.id)) else '{}'::jsonb end;
$$;

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
  if target is null then insert into public.members(display_name,short_name,pairing_role,experience_level,age_group,age_groups,is_active,active_from,admin_note) values(payload->>'fullName',payload->>'shortName',(case payload->>'role' when 'leader' then 'lead' when 'follower' then 'follow' when 'musician' then 'musician' when 'photographer' then 'photographer' else payload->>'role' end)::public.pairing_role,(payload->>'experience')::public.experience_level,nullif(payload->>'ageGroup','')::public.member_age_group,array(select jsonb_array_elements_text(coalesce(payload->'ageGroups','[]'))::public.member_age_group),(payload->>'active')::boolean,nullif(payload->>'joinedAt','')::date,payload->>'note') returning id into target;
  else update public.members set display_name=coalesce(payload->>'fullName',display_name),short_name=coalesce(payload->>'shortName',short_name),pairing_role=case when payload?'role' then (case payload->>'role' when 'leader' then 'lead' when 'follower' then 'follow' when 'musician' then 'musician' when 'photographer' then 'photographer' else payload->>'role' end)::public.pairing_role else pairing_role end,experience_level=coalesce((payload->>'experience')::public.experience_level,experience_level),age_group=case when payload?'ageGroup' then nullif(payload->>'ageGroup','')::public.member_age_group else age_group end,age_groups=case when payload?'ageGroups' then array(select jsonb_array_elements_text(payload->'ageGroups')::public.member_age_group) else age_groups end,is_active=coalesce((payload->>'active')::boolean,is_active),active_from=case when payload?'joinedAt' then nullif(payload->>'joinedAt','')::date else active_from end,admin_note=case when payload?'note' then payload->>'note' else admin_note end where id=target; end if;
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
   update public.events set season_id=coalesce((payload->>'seasonId')::uuid,season_id),title=coalesce(payload->>'title',title),location=coalesce(payload->>'location',location),starts_at=case when payload?'date' then ((payload->>'date')||' '||coalesce(payload->>'startTime',to_char(e.starts_at at time zone 'Europe/Prague','HH24:MI')))::timestamp at time zone 'Europe/Prague' else starts_at end,ends_at=case when payload?'date' then ((payload->>'date')||' '||coalesce(payload->>'endTime',to_char(e.ends_at at time zone 'Europe/Prague','HH24:MI')))::timestamp at time zone 'Europe/Prague' else ends_at end,status=coalesce((payload->>'status')::public.event_status,status),status_is_manual=case when payload?'status' and payload->>'status' is not null then true when payload?'responseDeadline' and nullif(payload->>'responseDeadline','')::timestamptz is distinct from response_deadline then false else status_is_manual end,points_weight=coalesce((payload->>'weight')::numeric,points_weight),old_pairs=coalesce((payload->>'oldPairs')::integer,old_pairs),young_pairs=coalesce((payload->>'youngPairs')::integer,young_pairs),response_deadline=case when payload?'responseDeadline' then (payload->>'responseDeadline')::timestamptz else response_deadline end,singing=coalesce((payload->>'singing')::boolean,singing),note=case when payload?'note' then payload->>'note' else note end where id=target;
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

create or replace function public.pairing_member_available_v5(e public.events, target_member_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.members m
 left join public.event_participants p on p.member_id=m.id and p.event_id=e.id
 left join public.attendance a on a.member_id=m.id and a.event_id=e.id
 where m.id=target_member_id and m.pairing_role::text in ('lead','follow') and not coalesce(p.standing,false) and
 case when e.status='closed' then a.status in ('full','partial')
 else m.is_active and p.status='selected' and coalesce(a.status,'unrecorded') not in ('absent','excused') end);
$$;

create or replace function public.pairing_roster_v6(e public.events) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('memberId',m.id,'fullName',m.display_name,
   'role',case m.pairing_role when 'lead' then 'leader' else 'follower' end,
   'ageGroups',m.age_groups,'standing',coalesce(p.standing,false)) order by m.display_name),'[]')
 from public.members m
 left join public.event_participants p on p.member_id=m.id and p.event_id=e.id
 left join public.attendance a on a.member_id=m.id and a.event_id=e.id
 where m.pairing_role::text in ('lead','follow') and case when e.status='closed' then a.status in ('full','partial')
 else m.is_active and p.status='selected' and coalesce(a.status,'unrecorded') not in ('absent','excused') end;
$$;

create or replace function public.event_json_v3(e public.events) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; roster boolean; run_id uuid; kind text; begin
 roster:=public.view_is_admin_v3() or e.type='rehearsal' or public.event_confirmed_v3(e);
 select s.kind into kind from public.seasons s where s.id=e.season_id;
 select pr.id into run_id from public.pairing_runs pr where pr.event_id=e.id and (public.view_is_admin_v3() or pr.status in ('published','superseded')) order by pr.generated_at desc,pr.id desc limit 1;
 select jsonb_build_object('id',e.id,'seasonId',e.season_id,'seasonKind',kind,'title',e.title,'type',e.type,'date',to_char(e.starts_at at time zone 'Europe/Prague','YYYY-MM-DD'),'startTime',to_char(e.starts_at at time zone 'Europe/Prague','HH24:MI'),'endTime',to_char(e.ends_at at time zone 'Europe/Prague','HH24:MI'),'location',coalesce(e.location,''),'status',case when e.status='open' and public.event_confirmed_v3(e) then 'confirmed' else e.status::text end,'weight',e.points_weight,'capacityPairs',e.old_pairs+e.young_pairs,'oldPairs',e.old_pairs,'youngPairs',e.young_pairs,'program',e.program,'note',e.note,'responseDeadline',e.response_deadline,'canClose',e.starts_at<=now() or e.status='closed','canRespond',public.current_member_id() is not null and public.can_member_respond(e.id),'attendanceScope',case when roster then 'all' when public.current_member_id() is not null then 'self' else 'none' end,'eventDetailsAvailable',true,'singing',e.singing,
 'partnerOptions',coalesce((select jsonb_agg(b.id) from public.members a cross join public.members b where a.id=public.current_member_id() and b.is_active and a.id<>b.id and a.pairing_role::text in ('lead','follow') and b.pairing_role::text in ('lead','follow') and a.pairing_role<>b.pairing_role and a.age_groups && b.age_groups and e.type='performance' and kind='dance' and not exists(select 1 from public.pairing_preferences pp where pp.member_a_id=least(a.id,b.id) and pp.member_b_id=greatest(a.id,b.id) and pp.kind='forbidden' and (pp.valid_from is null or pp.valid_from<=(e.starts_at at time zone 'Europe/Prague')::date) and (pp.valid_to is null or pp.valid_to>=(e.starts_at at time zone 'Europe/Prague')::date))),'[]'),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('memberId',m.id,'status',case a.status when 'full' then 'present' when 'partial' then 'partial' when 'absent' then 'absent' when 'excused' then 'excused' else 'unknown' end,'attendancePercent',a.attendance_percent,'attendedMinutes',a.minutes_present,'earnedPoints',case when e.status='closed' then coalesce(a.effective_points,0) else 0 end,'interest',case when r.response='unanswered' or r.response is null then 'unset' else r.response::text end,'note',r.note,'selected',coalesce(p.status='selected',false),'standing',coalesce(p.standing,false)) || public.attendance_provenance_v4(e.id,m.id) order by m.display_name) from public.members m left join public.attendance a on a.member_id=m.id and a.event_id=e.id left join public.event_responses r on r.member_id=m.id and r.event_id=e.id left join public.event_participants p on p.member_id=m.id and p.event_id=e.id where (m.is_active or (public.view_is_admin_v3() and (a.member_id is not null or p.member_id is not null or r.member_id is not null))) and (roster or m.id=public.current_member_id())),'[]'),
 'pairs',coalesce((select jsonb_agg(public.pair_json_v3(p) order by p.below_line,p.age_group,p.id) from public.event_pairs p where p.pairing_run_id=run_id),'[]'),
 'pairingName',(select note from public.pairing_runs where id=run_id),
 'pairingCreatedAt',(select generated_at from public.pairing_runs where id=run_id),
 'pairingRoster',coalesce((select rules_snapshot->'roster' from public.pairing_runs where id=run_id),public.pairing_roster_v6(e)),
 'pairsPublished',coalesce((select status in ('published','superseded') from public.pairing_runs where id=run_id),false),
 'pairSets',coalesce((select jsonb_agg(jsonb_build_object('id',pr.id,'name',coalesce(pr.note,'Sada párů'),'createdAt',pr.generated_at,'roster',coalesce(pr.rules_snapshot->'roster',public.pairing_roster_v6(e)),'published',pr.status in ('published','superseded'),'pairs',coalesce((select jsonb_agg(public.pair_json_v3(p)) from public.event_pairs p where p.pairing_run_id=pr.id),'[]')) order by pr.generated_at desc,pr.id desc) from public.pairing_runs pr where pr.event_id=e.id and kind='dance' and (public.view_is_admin_v3() or pr.status in ('published','superseded'))),'[]'),
 'songSeries',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'name',ss.name,'confirmed',ss.confirmed,'songIds',coalesce((select jsonb_agg(si.song_id order by si.position) from public.song_series_items si where si.series_id=ss.id),'[]')) order by ss.position,ss.id) from public.song_series ss where ss.event_id=e.id and (public.view_is_admin_v3() or ss.confirmed)),'[]'),
 'programItems',coalesce((select jsonb_agg(jsonb_build_object('id',pi.id,'catalogId',pi.catalog_program_id,'name',coalesce(pc.name,pi.custom_name),'custom',pi.catalog_program_id is null,'sortOrder',pi.position) order by pi.position) from public.event_program_items pi left join public.program_catalog pc on pc.id=pi.catalog_program_id where pi.event_id=e.id),'[]')
 ) into result; return result; end; $$;

create or replace function public.validate_event_partner_wish() returns trigger language plpgsql set search_path='' as $$
declare a public.members; b public.members; e public.events; begin
 select * into a from public.members where id=new.member_id; select * into b from public.members where id=new.partner_member_id;
 select * into e from public.events where id=new.event_id for update;
 if a.pairing_role::text not in ('lead','follow') or b.pairing_role::text not in ('lead','follow') or not a.is_active or not b.is_active or a.pairing_role=b.pairing_role or not(a.age_groups&&b.age_groups) then raise exception 'Partner není kompatibilní.'; end if;
 if e.type<>'performance' or (select kind from public.seasons where id=e.season_id)<>'dance' then raise exception 'Přání jsou pouze pro taneční vystoupení.'; end if;
 if exists(select 1 from public.pairing_preferences where member_a_id=least(a.id,b.id) and member_b_id=greatest(a.id,b.id) and kind='forbidden' and (valid_from is null or valid_from<=(e.starts_at at time zone 'Europe/Prague')::date) and (valid_to is null or valid_to>=(e.starts_at at time zone 'Europe/Prague')::date)) then raise exception 'Tato dvojice je zakázaná.'; end if;
 return new; end; $$;

create or replace function public.can_member_set_partner_wishes(target_event_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e join public.seasons s on s.id=e.season_id where e.id=target_event_id and e.type='performance' and s.kind='dance' and public.can_member_respond(e.id) and exists(select 1 from public.members m where m.id=public.current_member_id() and m.pairing_role::text in ('lead','follow')));
$$;


-- Personal favorites belong to the authenticated identity, never to a shared roster.
create table public.song_favorites (
 user_id uuid not null references auth.users(id) on delete cascade,
 song_id uuid not null references public.songs(id) on delete cascade,
 primary key(user_id,song_id)
);
alter table public.song_favorites enable row level security;
revoke all on public.song_favorites from public,anon,authenticated;

create function public.get_song_favorites_v8() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_read_app_v3() then raise exception 'Přihlaste se pro zobrazení oblíbených.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(f.song_id order by f.song_id),'[]') from public.song_favorites f where f.user_id=auth.uid());
end; $$;

create function public.set_song_favorite_v8(target_song_id uuid,favorite boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_read_app_v3() then raise exception 'Přihlaste se pro uložení oblíbených.' using errcode='42501'; end if;
 if favorite is null then raise exception 'Chybí volba oblíbené písně.'; end if;
 if not exists(select 1 from public.songs s where s.id=target_song_id) then raise exception 'Píseň nebyla nalezena.'; end if;
 if favorite then
  insert into public.song_favorites(user_id,song_id) values(auth.uid(),target_song_id) on conflict do nothing;
 else delete from public.song_favorites where user_id=auth.uid() and song_id=target_song_id;
 end if;
end; $$;
revoke all on function public.get_song_favorites_v8(),public.set_song_favorite_v8(uuid,boolean) from public,anon,authenticated;
grant execute on function public.get_song_favorites_v8(),public.set_song_favorite_v8(uuid,boolean) to authenticated;
notify pgrst, 'reload schema';
