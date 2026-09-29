-- Pairing uses recorded reality for closed actions and one eligibility rule.
create function public.pairing_member_available_v5(e public.events, target_member_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.members m
 left join public.event_participants p on p.member_id=m.id and p.event_id=e.id
 left join public.attendance a on a.member_id=m.id and a.event_id=e.id
 where m.id=target_member_id and not coalesce(p.standing,false) and
 case when e.status='closed' then a.status in ('full','partial')
 else m.is_active and p.status='selected' and coalesce(a.status,'unrecorded') not in ('absent','excused') end);
$$;
revoke all on function public.pairing_member_available_v5(public.events,uuid) from public,anon,authenticated;

create or replace function public.save_pairs_v3(event_id uuid, pairs jsonb, published boolean default false, set_name text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.events; run_id uuid; block_id uuid; item jsonb; begin
 perform public.require_admin_v3(); select * into e from public.events where id=event_id for update;
 if e.id is null or (select kind from public.seasons where id=e.season_id)<>'dance' then raise exception 'Párování není dostupné.'; end if;
 insert into public.pairing_runs(event_id,seed,algorithm_version,note) values(e.id,floor(extract(epoch from now())*1000),'season-4',coalesce(nullif(btrim(set_name),''),'Sada '||to_char(now() at time zone 'Europe/Prague','DD.MM. HH24:MI'))) returning id into run_id;
 insert into public.pairing_blocks(pairing_run_id,name,applies_to_all_program_items,position) values(run_id,'Celá událost',true,1) returning id into block_id;
 for item in select value from jsonb_array_elements(pairs) loop
  if nullif(item->>'ageGroup','') is null then raise exception 'Pár musí mít skupinu.'; end if;
  if not public.pairing_member_available_v5(e,(item->>'leaderId')::uuid) or not public.pairing_member_available_v5(e,(item->>'followerId')::uuid) then raise exception 'Páry tvořte z vybraných přítomných členů.'; end if;
  insert into public.event_pairs(pairing_run_id,pairing_block_id,round_number,member_a_id,member_b_id,age_group,below_line,is_locked,explanation) values(run_id,block_id,1,(item->>'leaderId')::uuid,(item->>'followerId')::uuid,(item->>'ageGroup')::public.member_age_group,coalesce((item->>'belowLine')::boolean,false),coalesce((item->>'locked')::boolean,false),left(coalesce(item->>'reason',''),2000));
 end loop;
 if published then
  if jsonb_array_length(pairs)=0 then raise exception 'Prázdnou sadu nelze zveřejnit.'; end if;
  perform set_config('app.publishing_pairing_run','1',true);
  if e.type='performance' then update public.pairing_runs set status='superseded',published_at=null where public.pairing_runs.event_id=e.id and status='published'; end if;
  update public.pairing_runs set status='published',published_at=now() where id=run_id;
  perform set_config('app.publishing_pairing_run','',true);
 end if;
 return run_id; end; $$;

create or replace function public.validate_event_pair() returns trigger language plpgsql set search_path='' as $$
declare a public.members; b public.members; e public.events; begin
 select * into a from public.members where id=new.member_a_id; select * into b from public.members where id=new.member_b_id;
 select ev.* into e from public.pairing_runs pr join public.events ev on ev.id=pr.event_id where pr.id=new.pairing_run_id;
 if (tg_op='INSERT' or new.member_a_id is distinct from old.member_a_id or new.member_b_id is distinct from old.member_b_id or new.pairing_run_id is distinct from old.pairing_run_id) and
 (not public.pairing_member_available_v5(e,new.member_a_id) or not public.pairing_member_available_v5(e,new.member_b_id)) then raise exception 'Páry tvořte z přítomných členů bez explicitního stání.'; end if;
 if a.pairing_role<>'lead' or b.pairing_role<>'follow' then raise exception 'Pár musí obsahovat muže a ženu.'; end if;
 if (select kind from public.seasons where id=e.season_id)<>'dance' then raise exception 'Koledy nemají páry.'; end if;
 if new.age_group is not null and (not(new.age_group=any(a.age_groups)) or not(new.age_group=any(b.age_groups))) then raise exception 'Nekompatibilní zařazení.'; end if;
 if exists(select 1 from public.event_pairs p where p.pairing_run_id=new.pairing_run_id and p.id<>new.id and p.round_number=new.round_number and (p.member_a_id in(a.id,b.id) or p.member_b_id in(a.id,b.id))) then raise exception 'Člen je v sestavě dvakrát.'; end if;
 if exists(select 1 from public.pairing_preferences where member_a_id=least(a.id,b.id) and member_b_id=greatest(a.id,b.id) and kind='forbidden' and (valid_from is null or valid_from<=(e.starts_at at time zone 'Europe/Prague')::date) and (valid_to is null or valid_to>=(e.starts_at at time zone 'Europe/Prague')::date)) then raise exception 'Tento pár je zakázaný.'; end if;
 if e.type='rehearsal' and new.is_confirmed_actual then raise exception 'Zkouškové sady nejsou skutečná historie.'; end if;
 return new; end; $$;

create or replace function public.event_json_v3(e public.events) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; roster boolean; run_id uuid; kind text; begin
 roster:=public.view_is_admin_v3() or e.type='rehearsal' or public.event_confirmed_v3(e);
 select s.kind into kind from public.seasons s where s.id=e.season_id;
 select pr.id into run_id from public.pairing_runs pr where pr.event_id=e.id and (public.view_is_admin_v3() or pr.status='published') order by
  case when not public.view_is_admin_v3() and e.status='closed' and exists(select 1 from public.event_pairs p where p.pairing_run_id=pr.id and p.is_confirmed_actual) then 0 else 1 end,
  pr.generated_at desc limit 1;
 select jsonb_build_object('id',e.id,'seasonId',e.season_id,'seasonKind',kind,'title',e.title,'type',e.type,'date',to_char(e.starts_at at time zone 'Europe/Prague','YYYY-MM-DD'),'startTime',to_char(e.starts_at at time zone 'Europe/Prague','HH24:MI'),'endTime',to_char(e.ends_at at time zone 'Europe/Prague','HH24:MI'),'location',coalesce(e.location,''),'status',case when e.status='open' and public.event_confirmed_v3(e) then 'confirmed' else e.status::text end,'weight',e.points_weight,'capacityPairs',e.old_pairs+e.young_pairs,'oldPairs',e.old_pairs,'youngPairs',e.young_pairs,'program',e.program,'note',e.note,'responseDeadline',e.response_deadline,'canClose',e.starts_at<=now(),'canRespond',public.current_member_id() is not null and public.can_member_respond(e.id),'attendanceScope',case when roster then 'all' when public.current_member_id() is not null then 'self' else 'none' end,'eventDetailsAvailable',true,'singing',e.singing,
 'partnerOptions',coalesce((select jsonb_agg(b.id) from public.members a cross join public.members b where a.id=public.current_member_id() and b.is_active and a.id<>b.id and a.pairing_role<>b.pairing_role and a.age_groups && b.age_groups and e.type='performance' and kind='dance' and not exists(select 1 from public.pairing_preferences pp where pp.member_a_id=least(a.id,b.id) and pp.member_b_id=greatest(a.id,b.id) and pp.kind='forbidden' and (pp.valid_from is null or pp.valid_from<=(e.starts_at at time zone 'Europe/Prague')::date) and (pp.valid_to is null or pp.valid_to>=(e.starts_at at time zone 'Europe/Prague')::date))),'[]'),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('memberId',m.id,'status',case a.status when 'full' then 'present' when 'partial' then 'partial' when 'absent' then 'absent' when 'excused' then 'excused' else 'unknown' end,'attendancePercent',a.attendance_percent,'attendedMinutes',a.minutes_present,'earnedPoints',case when e.status='closed' then coalesce(a.effective_points,0) else 0 end,'interest',case when r.response='unanswered' or r.response is null then 'unset' else r.response::text end,'note',r.note,'selected',coalesce(p.status='selected',false),'standing',coalesce(p.standing,false),'actualStanding',e.type='performance' and coalesce(p.actual_standing,false)) || public.attendance_provenance_v4(e.id,m.id) order by m.display_name) from public.members m left join public.attendance a on a.member_id=m.id and a.event_id=e.id left join public.event_responses r on r.member_id=m.id and r.event_id=e.id left join public.event_participants p on p.member_id=m.id and p.event_id=e.id where (m.is_active or (public.view_is_admin_v3() and (a.member_id is not null or p.member_id is not null or r.member_id is not null))) and (roster or m.id=public.current_member_id())),'[]'),
 'pairs',coalesce((select jsonb_agg(public.pair_json_v3(p) order by p.below_line,p.age_group,p.id) from public.event_pairs p where p.pairing_run_id=run_id),'[]'),
 'actualPairs',coalesce((select jsonb_agg(public.pair_json_v3(p)) from public.event_pairs p join public.pairing_runs pr on pr.id=p.pairing_run_id where pr.event_id=e.id and e.type='performance' and p.is_confirmed_actual),'[]'),
 'pairsPublished',coalesce((select status='published' from public.pairing_runs where id=run_id),false),
 'pairSets',coalesce((select jsonb_agg(jsonb_build_object('id',pr.id,'name',coalesce(pr.note,'Sada párů'),'createdAt',pr.generated_at,'published',pr.status='published','pairs',coalesce((select jsonb_agg(public.pair_json_v3(p)) from public.event_pairs p where p.pairing_run_id=pr.id),'[]')) order by pr.generated_at desc) from public.pairing_runs pr where pr.event_id=e.id and e.type='rehearsal' and (public.view_is_admin_v3() or pr.status='published')),'[]'),
 'songSeries',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'name',ss.name,'confirmed',ss.confirmed,'songIds',coalesce((select jsonb_agg(si.song_id order by si.position) from public.song_series_items si where si.series_id=ss.id),'[]')) order by ss.position,ss.id) from public.song_series ss where ss.event_id=e.id and (public.view_is_admin_v3() or ss.confirmed)),'[]'),
 'programItems',coalesce((select jsonb_agg(jsonb_build_object('id',pi.id,'catalogId',pi.catalog_program_id,'name',coalesce(pc.name,pi.custom_name),'custom',pi.catalog_program_id is null,'sortOrder',pi.position) order by pi.position) from public.event_program_items pi left join public.program_catalog pc on pc.id=pi.catalog_program_id where pi.event_id=e.id),'[]')
 ) into result; return result; end; $$;

create or replace function public.pair_json_v3(p public.event_pairs) returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object('id',p.id,'leaderId',p.member_a_id,'followerId',p.member_b_id,'round',p.round_number,'blockId',p.pairing_block_id,'ageGroup',p.age_group,'belowLine',p.below_line,'locked',p.is_locked,'actual',p.is_confirmed_actual,'reason',case when public.view_is_admin_v3() then p.explanation else null end); $$;
notify pgrst, 'reload schema';
