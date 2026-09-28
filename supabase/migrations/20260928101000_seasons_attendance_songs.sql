alter table public.seasons add column kind text not null default 'dance' check (kind in ('dance','carols'));
drop index public.seasons_one_current_idx;
create unique index seasons_one_current_kind_idx on public.seasons(kind) where is_current;
alter table public.members add column age_groups public.member_age_group[] not null default '{}';
update public.members set age_groups = array[age_group] where age_group is not null;
alter table public.members add constraint members_groups_valid check (
  cardinality(age_groups) <= 2 and array_position(age_groups,null) is null
  and (age_group is null and cardinality(age_groups)=0 or age_group = any(age_groups))
  and not (cardinality(age_groups)=2 and age_groups[1]=age_groups[2])
);
alter table public.events add column old_pairs integer not null default 0 check(old_pairs>=0);
alter table public.events add column young_pairs integer not null default 0 check(young_pairs>=0);
alter table public.events add column singing boolean not null default false;
update public.events set old_pairs=coalesce(required_pairs,0), response_deadline=coalesce(response_deadline,starts_at) where type='performance';
alter table public.events add constraint performance_requires_deadline check(type<>'performance' or response_deadline is not null);
alter table public.attendance add column attendance_percent numeric(6,3) check(attendance_percent between 0 and 100);
update public.attendance a set attendance_percent=case when a.status='full' then 100 when a.status='partial' then least(100,100.0*a.minutes_present/greatest(1,extract(epoch from(e.ends_at-e.starts_at))/60)) else 0 end from public.events e where e.id=a.event_id;
alter table public.event_participants add column standing boolean not null default false;
alter table public.event_participants add column actual_standing boolean not null default false;
alter table public.event_pairs add column age_group public.member_age_group;
alter table public.event_pairs add column below_line boolean not null default false;
-- Preserve existing pair sets, infer their group where available, and stop
-- counting rehearsal pairs as actual performance history.
select set_config('app.confirming_actual_pairs','1',true);
update public.event_pairs p set age_group=a.age_group from public.members a,public.members b where a.id=p.member_a_id and b.id=p.member_b_id and a.age_group=b.age_group;
update public.event_pairs p set is_confirmed_actual=false from public.pairing_runs pr,public.events e where pr.id=p.pairing_run_id and e.id=pr.event_id and e.type='rehearsal' and p.is_confirmed_actual;
select set_config('app.confirming_actual_pairs','',true);
-- Rehearsals keep multiple published sets. Performance publication is serialized on events.
drop index public.pairing_runs_one_published_per_event_idx;

create table public.song_categories(id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 100), unique(name));
create table public.songs(id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 250), category_id uuid references public.song_categories(id) on delete restrict, is_active boolean not null default true);
create unique index songs_name_ci_idx on public.songs(lower(btrim(name)));
create table public.song_series(id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade, name text not null check(length(btrim(name)) between 1 and 100), confirmed boolean not null default false, position integer not null default 1, unique(id,event_id));
create table public.song_series_items(event_id uuid not null, series_id uuid not null, song_id uuid not null references public.songs(id) on delete restrict, position integer not null check(position>0), primary key(event_id,song_id), unique(series_id,position), foreign key(series_id,event_id) references public.song_series(id,event_id) on delete cascade);
create table public.member_login_code_requests(member_id uuid primary key references public.members(id) on delete cascade, requested_at timestamptz not null, requested_by uuid references auth.users(id));

create function public.can_read_app_v3() returns boolean language sql stable security definer set search_path='' as $$ select public.is_admin() or public.current_member_id() is not null or public.has_active_shared_session(); $$;
create function public.require_admin_v3() returns void language plpgsql stable security definer set search_path='' as $$ begin if not public.is_admin() then raise exception 'Pouze administrátor může provést tuto změnu.' using errcode='42501'; end if; end; $$;
create function public.event_visible_v3(e public.events) returns boolean language sql stable security definer set search_path='' as $$ select public.is_admin() or (public.can_read_app_v3() and e.status<>'draft' and e.visibility in ('public','members','shared')); $$;
create function public.event_confirmed_v3(e public.events) returns boolean language sql stable set search_path='' as $$ select e.status in ('confirmed','closed') or (e.type='performance' and e.status='open' and e.response_deadline<=now()); $$;

create function public.confirm_due_events() returns integer language plpgsql security definer set search_path='' as $$
declare n integer; begin
 update public.events set status='confirmed' where type='performance' and status='open' and response_deadline<=now();
 get diagnostics n=row_count; return n;
end; $$;
revoke all on function public.confirm_due_events() from public,anon,authenticated;
grant execute on function public.confirm_due_events() to service_role;
-- Supabase provides pg_cron. Plain PostgreSQL test environments may not.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron;
  perform cron.schedule('nsp-confirm-deadlines','* * * * *','select public.confirm_due_events()');
 end if;
end $$;

create or replace function public.can_member_respond(target_event_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e where e.id=target_event_id and public.event_visible_v3(e) and e.status='open' and (e.type='rehearsal' or clock_timestamp()<e.response_deadline));
$$;
create or replace function public.can_member_set_partner_wishes(target_event_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e join public.seasons s on s.id=e.season_id where e.id=target_event_id and e.type='performance' and s.kind='dance' and public.can_member_respond(e.id));
$$;
create function public.validate_response_v3() returns trigger language plpgsql set search_path='' as $$
declare e public.events; begin
 select * into e from public.events where id=new.event_id for update;
 if e.type='rehearsal' and new.response not in ('yes','no','unanswered') then raise exception 'Na zkoušku lze odpovědět pouze ano/ne.'; end if;
 if e.type='performance' and new.response='substitute' then raise exception 'Náhradník není platná odpověď.'; end if;
 if new.response='maybe' and nullif(btrim(new.note),'') is null then raise exception 'Pro zatím nevím je povinná poznámka.'; end if;
 if auth.uid() is not null and not public.is_admin() and (e.status<>'open' or (e.type='performance' and clock_timestamp()>=e.response_deadline)) then raise exception 'Odpovědi jsou uzamčené.'; end if;
 return new; end; $$;
-- Normalize legacy answers before enforcing the new rules.
update public.event_responses r set response='unanswered' from public.events e where e.id=r.event_id and (r.response='substitute' or (e.type='rehearsal' and r.response='maybe'));
update public.event_responses set note='Bez upřesnění (původní odpověď)' where response='maybe' and nullif(btrim(note),'') is null;
create trigger event_responses_validate_v3 before insert or update on public.event_responses for each row execute function public.validate_response_v3();

create or replace function public.calculate_attendance_points() returns trigger language plpgsql set search_path='' as $$
declare e public.events; duration numeric; begin
 select * into e from public.events where id=new.event_id;
 duration:=greatest(1,extract(epoch from(e.ends_at-e.starts_at))/60);
 if new.status='full' then new.attendance_percent:=100;
 elsif new.status='partial' then
  if new.attendance_percent is null then new.attendance_percent:=100*coalesce(new.minutes_present,0)/duration; end if;
  if new.attendance_percent<=0 or new.attendance_percent>=100 then raise exception 'Částečná účast musí být větší než 0 a menší než 100 %%.'; end if;
 else new.attendance_percent:=case when new.status='unrecorded' then null else 0 end; end if;
 new.minutes_present:=case when new.attendance_percent is null then null else round(duration*new.attendance_percent/100) end;
 new.calculated_points:=case when e.status='cancelled' then 0 else round(e.points_weight*coalesce(new.attendance_percent,0)/100,4) end;
 if new.status<>'unrecorded' then new.confirmed_at:=coalesce(new.confirmed_at,now()); new.confirmed_by:=coalesce(new.confirmed_by,auth.uid()); end if;
 return new; end; $$;

-- Normalize legacy partial records at the endpoints of the new percentage range.
update public.attendance set status=case when attendance_percent>=100 then 'full'::public.attendance_status else 'absent'::public.attendance_status end where status='partial' and (attendance_percent<=0 or attendance_percent>=100);

create function public.prefill_closed_rehearsal_v3() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.type='rehearsal' and new.status='closed' and old.status<>'closed' then
  if auth.uid() is not null and not public.is_admin() then raise exception 'Zkoušku uzavírá pouze admin.'; end if;
  if new.starts_at>now() then raise exception 'Zkoušku lze uzavřít až po začátku.'; end if;
  insert into public.attendance(event_id,member_id,status)
   select new.id,r.member_id,case when r.response='yes' then 'full'::public.attendance_status else 'absent'::public.attendance_status end from public.event_responses r where r.event_id=new.id and r.response in ('yes','no')
   on conflict(event_id,member_id) do update set status=excluded.status where public.attendance.status='unrecorded';
  insert into public.event_participants(event_id,member_id,status) select new.id,a.member_id,'selected' from public.attendance a where a.event_id=new.id and a.status in ('full','partial') on conflict(event_id,member_id) do update set status='selected';
 end if; return new; end; $$;
create trigger events_prefill_closed_rehearsal_v3 after update on public.events for each row execute function public.prefill_closed_rehearsal_v3();

create function public.member_json_v3(m public.members) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'fullName',m.display_name,'shortName',m.short_name,'role',case when m.pairing_role='lead' then 'leader' else 'follower' end,'ageGroup',m.age_group,'ageGroups',m.age_groups,'active',m.is_active,'joinedAt',coalesce(m.active_from::text,''),'experienceKnown',public.is_admin()) ||
 case when public.is_admin() then jsonb_build_object('experience',m.experience_level,'note',m.admin_note,'account',(select jsonb_build_object('memberId',ma.member_id,'email',ma.email,'role',ma.desired_role,'linkedUserId',ma.linked_user_id,'activatedAt',ma.activated_at,'lastInvitationSentAt',ma.last_invitation_sent_at,'lastSignInAt',ma.last_sign_in_at) from public.member_accounts ma where ma.member_id=m.id)) else '{}'::jsonb end;
$$;
create function public.pair_json_v3(p public.event_pairs) returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object('id',p.id,'leaderId',p.member_a_id,'followerId',p.member_b_id,'round',p.round_number,'blockId',p.pairing_block_id,'ageGroup',p.age_group,'belowLine',p.below_line,'locked',p.is_locked,'actual',p.is_confirmed_actual); $$;

create function public.scores_v3(filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if not public.can_read_app_v3() then raise exception 'Přihlaste se.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc,x.member->>'fullName'),'[]') into result from (
 select public.member_json_v3(m) member, coalesce(sum(a.effective_points),0) total,
 coalesce(sum(a.effective_points) filter(where e.type='rehearsal'),0) rehearsal,
 coalesce(sum(a.effective_points) filter(where e.type='performance'),0) performance,
 count(a.*) filter(where a.status='full') "fullAttendance",count(a.*) filter(where a.status='partial') "partialAttendance",count(a.*) filter(where a.status='excused') excused,
 coalesce(sum(e.points_weight),0) possible,
 case when coalesce(sum(e.points_weight),0)>0 then 100*coalesce(sum(a.effective_points),0)/sum(e.points_weight) else 0 end "attendanceRate"
 from public.members m left join public.events e on e.status='closed' and e.visibility in ('public','members','shared')
  and (nullif(filters->>'seasonId','') is null or e.season_id=(filters->>'seasonId')::uuid)
  and (nullif(filters->>'dateFrom','') is null or (e.starts_at at time zone 'Europe/Prague')::date>=(filters->>'dateFrom')::date)
  and (nullif(filters->>'dateTo','') is null or (e.starts_at at time zone 'Europe/Prague')::date<=(filters->>'dateTo')::date)
  and (m.active_from is null or (e.starts_at at time zone 'Europe/Prague')::date>=m.active_from) and (m.active_to is null or (e.starts_at at time zone 'Europe/Prague')::date<=m.active_to)
 left join public.attendance a on a.event_id=e.id and a.member_id=m.id where m.is_active group by m.id
 ) x; return result; end; $$;

create function public.get_app_database_v3() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; active_season uuid; begin
 if not public.can_read_app_v3() then raise exception 'Přihlaste se.' using errcode='42501'; end if;
 perform public.confirm_due_events();
 select id into active_season from public.seasons where is_current and kind='dance';
 select jsonb_build_object(
 'accessMode',case when public.is_admin() then 'admin' when public.current_member_id() is not null then 'member' else 'shared' end,
 'myMemberId',public.current_member_id(),'updatedAt',now(),
 'members',coalesce((select jsonb_agg(public.member_json_v3(m) order by m.display_name) from public.members m where public.is_admin() or m.is_active),'[]'),
 'seasons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'dateFrom',date_from,'dateTo',date_to,'active',is_current) order by date_to desc) from public.seasons),'[]'),
 'scoreRows',case when active_season is null then '[]'::jsonb else public.scores_v3(jsonb_build_object('seasonId',active_season)) end,
 'preferences',case when public.is_admin() then coalesce((select jsonb_agg(jsonb_build_object('id',member_a_id::text||':'||member_b_id::text,'memberAId',member_a_id,'memberBId',member_b_id,'kind',kind,'strength',strength,'privateReason',private_reason,'validFrom',valid_from,'validTo',valid_to)) from public.pairing_preferences),'[]') else '[]'::jsonb end,
 'partnerWishes',coalesce((select jsonb_agg(jsonb_build_object('eventId',event_id,'memberId',member_id,'partnerId',partner_member_id)) from public.event_partner_wishes where public.is_admin() or member_id=public.current_member_id()),'[]'),
 'programCatalog',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',is_active,'sortOrder',sort_order)) from public.program_catalog),'[]'),
 'songs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'categoryId',category_id,'active',is_active) order by name) from public.songs),'[]'),
 'songCategories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.song_categories),'[]'),
 'events',coalesce((select jsonb_agg(public.event_json_v3(e) order by e.starts_at) from public.events e where public.event_visible_v3(e)),'[]')
 ) into result; return result; end; $$;

create function public.event_json_v3(e public.events) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; roster boolean; run_id uuid; kind text; begin
 roster:=public.is_admin() or e.type='rehearsal' or public.event_confirmed_v3(e);
 select s.kind into kind from public.seasons s where s.id=e.season_id;
 select pr.id into run_id from public.pairing_runs pr where pr.event_id=e.id and (public.is_admin() or pr.status='published') order by
  case when not public.is_admin() and e.status='closed' and exists(select 1 from public.event_pairs p where p.pairing_run_id=pr.id and p.is_confirmed_actual) then 0 else 1 end,
  pr.generated_at desc limit 1;
 select jsonb_build_object('id',e.id,'seasonId',e.season_id,'seasonKind',kind,'title',e.title,'type',e.type,'date',to_char(e.starts_at at time zone 'Europe/Prague','YYYY-MM-DD'),'startTime',to_char(e.starts_at at time zone 'Europe/Prague','HH24:MI'),'endTime',to_char(e.ends_at at time zone 'Europe/Prague','HH24:MI'),'location',coalesce(e.location,''),'status',case when e.status='open' and public.event_confirmed_v3(e) then 'confirmed' else e.status::text end,'weight',e.points_weight,'capacityPairs',e.old_pairs+e.young_pairs,'oldPairs',e.old_pairs,'youngPairs',e.young_pairs,'program',e.program,'note',e.note,'responseDeadline',e.response_deadline,'canRespond',public.current_member_id() is not null and public.can_member_respond(e.id),'attendanceScope',case when roster then 'all' when public.current_member_id() is not null then 'self' else 'none' end,'eventDetailsAvailable',true,'singing',e.singing,
 'partnerOptions',coalesce((select jsonb_agg(b.id) from public.members a cross join public.members b where a.id=public.current_member_id() and b.is_active and a.id<>b.id and a.pairing_role<>b.pairing_role and a.age_groups && b.age_groups and e.type='performance' and kind='dance' and not exists(select 1 from public.pairing_preferences pp where pp.member_a_id=least(a.id,b.id) and pp.member_b_id=greatest(a.id,b.id) and pp.kind='forbidden' and (pp.valid_from is null or pp.valid_from<=(e.starts_at at time zone 'Europe/Prague')::date) and (pp.valid_to is null or pp.valid_to>=(e.starts_at at time zone 'Europe/Prague')::date))),'[]'),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('memberId',m.id,'status',case a.status when 'full' then 'present' when 'partial' then 'partial' when 'absent' then 'absent' when 'excused' then 'excused' else 'unknown' end,'attendancePercent',a.attendance_percent,'attendedMinutes',a.minutes_present,'earnedPoints',case when e.status='closed' then coalesce(a.effective_points,0) else 0 end,'interest',case when r.response='unanswered' or r.response is null then 'unset' else r.response::text end,'note',r.note,'selected',coalesce(p.status='selected',false),'standing',coalesce(p.standing,false),'actualStanding',e.type='performance' and coalesce(p.actual_standing,false)) order by m.display_name) from public.members m left join public.attendance a on a.member_id=m.id and a.event_id=e.id left join public.event_responses r on r.member_id=m.id and r.event_id=e.id left join public.event_participants p on p.member_id=m.id and p.event_id=e.id where m.is_active and (roster or m.id=public.current_member_id())),'[]'),
 'pairs',coalesce((select jsonb_agg(public.pair_json_v3(p) order by p.below_line,p.age_group,p.id) from public.event_pairs p where p.pairing_run_id=run_id),'[]'),
 'actualPairs',coalesce((select jsonb_agg(public.pair_json_v3(p)) from public.event_pairs p join public.pairing_runs pr on pr.id=p.pairing_run_id where pr.event_id=e.id and e.type='performance' and p.is_confirmed_actual),'[]'),
 'pairsPublished',coalesce((select status='published' from public.pairing_runs where id=run_id),false),
 'pairSets',coalesce((select jsonb_agg(jsonb_build_object('id',pr.id,'name',coalesce(pr.note,'Sada párů'),'createdAt',pr.generated_at,'published',pr.status='published','pairs',coalesce((select jsonb_agg(public.pair_json_v3(p)) from public.event_pairs p where p.pairing_run_id=pr.id),'[]')) order by pr.generated_at desc) from public.pairing_runs pr where pr.event_id=e.id and e.type='rehearsal' and (public.is_admin() or pr.status='published')),'[]'),
 'songSeries',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'name',ss.name,'confirmed',ss.confirmed,'songIds',coalesce((select jsonb_agg(si.song_id order by si.position) from public.song_series_items si where si.series_id=ss.id),'[]')) order by ss.position,ss.id) from public.song_series ss where ss.event_id=e.id and (public.is_admin() or ss.confirmed)),'[]'),
 'programItems',coalesce((select jsonb_agg(jsonb_build_object('id',pi.id,'catalogId',pi.catalog_program_id,'name',coalesce(pc.name,pi.custom_name),'custom',pi.catalog_program_id is null,'sortOrder',pi.position) order by pi.position) from public.event_program_items pi left join public.program_catalog pc on pc.id=pi.catalog_program_id where pi.event_id=e.id),'[]')
 ) into result; return result; end; $$;

create function public.mutate_app_v3(action text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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

create or replace function public.validate_event_partner_wish() returns trigger language plpgsql set search_path='' as $$
declare a public.members; b public.members; e public.events; begin
 select * into a from public.members where id=new.member_id; select * into b from public.members where id=new.partner_member_id;
 select * into e from public.events where id=new.event_id for update;
 if not a.is_active or not b.is_active or a.pairing_role=b.pairing_role or not(a.age_groups&&b.age_groups) then raise exception 'Partner není kompatibilní.'; end if;
 if e.type<>'performance' or (select kind from public.seasons where id=e.season_id)<>'dance' then raise exception 'Přání jsou pouze pro taneční vystoupení.'; end if;
 if exists(select 1 from public.pairing_preferences where member_a_id=least(a.id,b.id) and member_b_id=greatest(a.id,b.id) and kind='forbidden' and (valid_from is null or valid_from<=(e.starts_at at time zone 'Europe/Prague')::date) and (valid_to is null or valid_to>=(e.starts_at at time zone 'Europe/Prague')::date)) then raise exception 'Tato dvojice je zakázaná.'; end if;
 return new; end; $$;
create or replace function public.validate_event_pair() returns trigger language plpgsql set search_path='' as $$
declare a public.members; b public.members; e public.events; begin
 select * into a from public.members where id=new.member_a_id; select * into b from public.members where id=new.member_b_id;
 select ev.* into e from public.pairing_runs pr join public.events ev on ev.id=pr.event_id where pr.id=new.pairing_run_id;
 if a.pairing_role<>'lead' or b.pairing_role<>'follow' then raise exception 'Pár musí obsahovat muže a ženu.'; end if;
 if (select kind from public.seasons where id=e.season_id)<>'dance' then raise exception 'Koledy nemají páry.'; end if;
 if new.age_group is not null and (not(new.age_group=any(a.age_groups)) or not(new.age_group=any(b.age_groups))) then raise exception 'Nekompatibilní zařazení.'; end if;
 if exists(select 1 from public.event_pairs p where p.pairing_run_id=new.pairing_run_id and p.id<>new.id and p.round_number=new.round_number and (p.member_a_id in(a.id,b.id) or p.member_b_id in(a.id,b.id))) then raise exception 'Člen je v sestavě dvakrát.'; end if;
 if exists(select 1 from public.pairing_preferences where member_a_id=least(a.id,b.id) and member_b_id=greatest(a.id,b.id) and kind='forbidden' and (valid_from is null or valid_from<=(e.starts_at at time zone 'Europe/Prague')::date) and (valid_to is null or valid_to>=(e.starts_at at time zone 'Europe/Prague')::date)) then raise exception 'Tento pár je zakázaný.'; end if;
 if e.type='rehearsal' and new.is_confirmed_actual then raise exception 'Zkouškové sady nejsou skutečná historie.'; end if;
 return new; end; $$;

create function public.save_pairs_v3(event_id uuid, pairs jsonb, published boolean default false, set_name text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.events; run_id uuid; block_id uuid; item jsonb; begin
 perform public.require_admin_v3(); select * into e from public.events where id=event_id for update;
 if e.id is null or (select kind from public.seasons where id=e.season_id)<>'dance' then raise exception 'Párování není dostupné.'; end if;
 insert into public.pairing_runs(event_id,seed,algorithm_version,note) values(e.id,floor(extract(epoch from now())*1000),'season-3',coalesce(nullif(btrim(set_name),''),'Sada '||to_char(now() at time zone 'Europe/Prague','DD.MM. HH24:MI'))) returning id into run_id;
 insert into public.pairing_blocks(pairing_run_id,name,applies_to_all_program_items,position) values(run_id,'Celá událost',true,1) returning id into block_id;
 for item in select value from jsonb_array_elements(pairs) loop
  if nullif(item->>'ageGroup','') is null then raise exception 'Pár musí mít skupinu.'; end if;
  if not exists(select 1 from public.event_participants p where p.event_id=e.id and p.member_id=(item->>'leaderId')::uuid and p.status='selected' and not p.standing) or not exists(select 1 from public.event_participants p where p.event_id=e.id and p.member_id=(item->>'followerId')::uuid and p.status='selected' and not p.standing) then raise exception 'Páry tvořte z vybraných přítomných členů.'; end if;
  insert into public.event_pairs(pairing_run_id,pairing_block_id,round_number,member_a_id,member_b_id,age_group,below_line,is_locked) values(run_id,block_id,1,(item->>'leaderId')::uuid,(item->>'followerId')::uuid,(item->>'ageGroup')::public.member_age_group,coalesce((item->>'belowLine')::boolean,false),coalesce((item->>'locked')::boolean,false));
 end loop;
 if published then
  if jsonb_array_length(pairs)=0 then raise exception 'Prázdnou sadu nelze zveřejnit.'; end if;
  perform set_config('app.publishing_pairing_run','1',true);
  if e.type='performance' then update public.pairing_runs set status='superseded',published_at=null where public.pairing_runs.event_id=e.id and status='published'; end if;
  update public.pairing_runs set status='published',published_at=now() where id=run_id;
  perform set_config('app.publishing_pairing_run','',true);
 end if;
 return run_id; end; $$;

create function public.authorize_member_login_code(target_member_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare addr text; last_request timestamptz; begin
 perform public.require_admin_v3();
 select ma.email into addr from public.member_accounts ma join public.members m on m.id=ma.member_id where ma.member_id=target_member_id and m.is_active for update of ma;
 if addr is null then raise exception 'Člen nemá evidovaný e-mail nebo není aktivní.'; end if;
 select requested_at into last_request from public.member_login_code_requests where member_id=target_member_id;
 if last_request>now()-interval '60 seconds' then raise exception 'Nový kód lze vygenerovat za 60 sekund.'; end if;
 insert into public.member_login_code_requests values(target_member_id,now(),auth.uid()) on conflict(member_id) do update set requested_at=now(),requested_by=auth.uid();
 return addr; end; $$;

-- Private helper projections and legacy payloads cannot be called by clients.
revoke select(experience_level) on public.members from authenticated;
revoke all on public.member_scores from authenticated;
revoke execute on function public.get_member_home(),public.get_member_session_context(),public.build_member_history(uuid),public.get_member_history(),public.get_admin_member_history(uuid) from authenticated;
-- Only admin table writes and own response writes remain through the existing policies.
-- All new tables are read through explicit, checked projections.
alter table public.song_categories enable row level security;
alter table public.songs enable row level security;
alter table public.song_series enable row level security;
alter table public.song_series_items enable row level security;
alter table public.member_login_code_requests enable row level security;
revoke all on public.song_categories,public.songs,public.song_series,public.song_series_items,public.member_login_code_requests from public,anon,authenticated;
revoke all on function public.can_read_app_v3(),public.require_admin_v3(),public.event_visible_v3(public.events),public.event_confirmed_v3(public.events),public.member_json_v3(public.members),public.pair_json_v3(public.event_pairs),public.event_json_v3(public.events),public.scores_v3(jsonb),public.get_app_database_v3(),public.mutate_app_v3(text,jsonb),public.save_pairs_v3(uuid,jsonb,boolean,text),public.authorize_member_login_code(uuid) from public,anon,authenticated;
grant execute on function public.scores_v3(jsonb),public.get_app_database_v3(),public.mutate_app_v3(text,jsonb),public.save_pairs_v3(uuid,jsonb,boolean,text),public.authorize_member_login_code(uuid) to authenticated;
-- Helpers used by RLS do not expose table rows.
grant execute on function public.can_read_app_v3(),public.event_visible_v3(public.events),public.event_confirmed_v3(public.events) to authenticated;

create or replace function public.confirm_actual_pairs(target_run_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare e public.events; n integer; begin
 perform public.require_admin_v3();
 select ev.* into e from public.pairing_runs pr join public.events ev on ev.id=pr.event_id where pr.id=target_run_id and pr.status='published' for update of ev;
 if e.id is null or e.type<>'performance' or e.status<>'closed' or (select kind from public.seasons where id=e.season_id)<>'dance' then raise exception 'Skutečné páry potvrďte u uzavřeného tanečního vystoupení.'; end if;
 perform set_config('app.confirming_actual_pairs','1',true);
 update public.event_pairs p set is_confirmed_actual=false from public.pairing_runs pr where pr.id=p.pairing_run_id and pr.event_id=e.id and p.is_confirmed_actual;
 update public.event_pairs p set is_confirmed_actual=true where p.pairing_run_id=target_run_id and not p.below_line
  and exists(select 1 from public.attendance a where a.event_id=e.id and a.member_id=p.member_a_id and a.status in ('full','partial'))
  and exists(select 1 from public.attendance a where a.event_id=e.id and a.member_id=p.member_b_id and a.status in ('full','partial'));
 get diagnostics n=row_count;
 insert into public.event_participants(event_id,member_id,actual_standing)
 select e.id,a.member_id,not exists(select 1 from public.event_pairs p where p.pairing_run_id=target_run_id and p.is_confirmed_actual and a.member_id in(p.member_a_id,p.member_b_id)) from public.attendance a where a.event_id=e.id and a.status in ('full','partial')
 on conflict(event_id,member_id) do update set actual_standing=excluded.actual_standing;
 update public.event_participants p set actual_standing=false where p.event_id=e.id and not exists(select 1 from public.attendance a where a.event_id=e.id and a.member_id=p.member_id and a.status in ('full','partial'));
 perform set_config('app.confirming_actual_pairs','',true);return n; end; $$;

-- Compatible with pg_safeupdate while preserving admin-only rotation.
create or replace function public.rotate_shared_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'Pouze administrátor může změnit sdílený kód.';
  end if;

  v_code := translate(
    encode(extensions.gen_random_bytes(15), 'base64'),
    '+/=',
    '-_'
  );

  update public.shared_access_config
  set code_hash = extensions.crypt(v_code, extensions.gen_salt('bf', 12)),
      is_enabled = true,
      rotated_by = auth.uid(),
      rotated_at = now(),
      updated_at = now()
  where id = 1;

  delete from public.shared_access_sessions where true;
  return v_code;
end;
$$;

create or replace function public.set_shared_access_enabled(enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Pouze administrátor může měnit sdílený přístup.';
  end if;
  if enabled and not exists (
    select 1 from public.shared_access_config where id = 1 and code_hash is not null
  ) then
    raise exception 'Nejprve vygenerujte sdílený kód.';
  end if;

  update public.shared_access_config
  set is_enabled = enabled,
      updated_at = now()
  where id = 1;

  if not enabled then
    delete from public.shared_access_sessions where true;
  end if;
end;
$$;


create function public.sync_member_groups_v3() returns trigger language plpgsql set search_path='' as $$ begin
 if new.age_group is null then new.age_groups:='{}';
 elsif cardinality(new.age_groups)=0 then new.age_groups:=array[new.age_group];
 elsif tg_op='UPDATE' and new.age_groups=old.age_groups and new.age_group is distinct from old.age_group and not(new.age_group=any(new.age_groups)) then new.age_groups:=array[new.age_group];
 end if; return new; end; $$;
create trigger members_sync_groups_v3 before insert or update on public.members for each row execute function public.sync_member_groups_v3();
