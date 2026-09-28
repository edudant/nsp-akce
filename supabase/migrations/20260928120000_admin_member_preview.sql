-- Restrict read projections for the administrator's member preview.
-- Authorization and write permissions always retain the real authenticated role.
create function public.view_is_admin_v3() returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() and coalesce(current_setting('app.member_preview',true),'') <> '1';
$$;
revoke all on function public.view_is_admin_v3() from public, anon, authenticated;

create or replace function public.event_visible_v3(e public.events) returns boolean language sql stable security definer set search_path='' as $$ select public.view_is_admin_v3() or (public.can_read_app_v3() and e.status<>'draft' and e.visibility in ('public','members','shared')); $$;

create or replace function public.member_json_v3(m public.members) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'fullName',m.display_name,'shortName',m.short_name,'role',case when m.pairing_role='lead' then 'leader' else 'follower' end,'ageGroup',m.age_group,'ageGroups',m.age_groups,'active',m.is_active,'joinedAt',coalesce(m.active_from::text,''),'experienceKnown',public.view_is_admin_v3()) ||
 case when public.view_is_admin_v3() then jsonb_build_object('experience',m.experience_level,'note',m.admin_note,'account',(select jsonb_build_object('memberId',ma.member_id,'email',ma.email,'role',ma.desired_role,'linkedUserId',ma.linked_user_id,'activatedAt',ma.activated_at,'lastInvitationSentAt',ma.last_invitation_sent_at,'lastSignInAt',ma.last_sign_in_at) from public.member_accounts ma where ma.member_id=m.id)) else '{}'::jsonb end;
$$;

create or replace function public.get_app_database_v3() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; active_season uuid; begin
 if not public.can_read_app_v3() then raise exception 'Přihlaste se.' using errcode='42501'; end if;
 perform public.confirm_due_events();
 select id into active_season from public.seasons where is_current and kind='dance';
 select jsonb_build_object(
 'accessMode',case when public.view_is_admin_v3() then 'admin' when public.current_member_id() is not null then 'member' else 'shared' end,
 'myMemberId',public.current_member_id(),'updatedAt',now(),
 'members',coalesce((select jsonb_agg(public.member_json_v3(m) order by m.display_name) from public.members m where public.view_is_admin_v3() or m.is_active),'[]'),
 'seasons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'dateFrom',date_from,'dateTo',date_to,'active',is_current) order by date_to desc) from public.seasons),'[]'),
 'scoreRows',case when active_season is null then '[]'::jsonb else public.scores_v3(jsonb_build_object('seasonId',active_season)) end,
 'preferences',case when public.view_is_admin_v3() then coalesce((select jsonb_agg(jsonb_build_object('id',member_a_id::text||':'||member_b_id::text,'memberAId',member_a_id,'memberBId',member_b_id,'kind',kind,'strength',strength,'privateReason',private_reason,'validFrom',valid_from,'validTo',valid_to)) from public.pairing_preferences),'[]') else '[]'::jsonb end,
 'partnerWishes',coalesce((select jsonb_agg(jsonb_build_object('eventId',event_id,'memberId',member_id,'partnerId',partner_member_id)) from public.event_partner_wishes where public.view_is_admin_v3() or member_id=public.current_member_id()),'[]'),
 'programCatalog',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',is_active,'sortOrder',sort_order)) from public.program_catalog),'[]'),
 'songs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'categoryId',category_id,'active',is_active) order by name) from public.songs),'[]'),
 'songCategories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.song_categories),'[]'),
 'events',coalesce((select jsonb_agg(public.event_json_v3(e) order by e.starts_at) from public.events e where public.event_visible_v3(e)),'[]')
 ) into result; return result; end; $$;

create or replace function public.event_json_v3(e public.events) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; roster boolean; run_id uuid; kind text; begin
 roster:=public.view_is_admin_v3() or e.type='rehearsal' or public.event_confirmed_v3(e);
 select s.kind into kind from public.seasons s where s.id=e.season_id;
 select pr.id into run_id from public.pairing_runs pr where pr.event_id=e.id and (public.view_is_admin_v3() or pr.status='published') order by
  case when not public.view_is_admin_v3() and e.status='closed' and exists(select 1 from public.event_pairs p where p.pairing_run_id=pr.id and p.is_confirmed_actual) then 0 else 1 end,
  pr.generated_at desc limit 1;
 select jsonb_build_object('id',e.id,'seasonId',e.season_id,'seasonKind',kind,'title',e.title,'type',e.type,'date',to_char(e.starts_at at time zone 'Europe/Prague','YYYY-MM-DD'),'startTime',to_char(e.starts_at at time zone 'Europe/Prague','HH24:MI'),'endTime',to_char(e.ends_at at time zone 'Europe/Prague','HH24:MI'),'location',coalesce(e.location,''),'status',case when e.status='open' and public.event_confirmed_v3(e) then 'confirmed' else e.status::text end,'weight',e.points_weight,'capacityPairs',e.old_pairs+e.young_pairs,'oldPairs',e.old_pairs,'youngPairs',e.young_pairs,'program',e.program,'note',e.note,'responseDeadline',e.response_deadline,'canRespond',public.current_member_id() is not null and public.can_member_respond(e.id),'attendanceScope',case when roster then 'all' when public.current_member_id() is not null then 'self' else 'none' end,'eventDetailsAvailable',true,'singing',e.singing,
 'partnerOptions',coalesce((select jsonb_agg(b.id) from public.members a cross join public.members b where a.id=public.current_member_id() and b.is_active and a.id<>b.id and a.pairing_role<>b.pairing_role and a.age_groups && b.age_groups and e.type='performance' and kind='dance' and not exists(select 1 from public.pairing_preferences pp where pp.member_a_id=least(a.id,b.id) and pp.member_b_id=greatest(a.id,b.id) and pp.kind='forbidden' and (pp.valid_from is null or pp.valid_from<=(e.starts_at at time zone 'Europe/Prague')::date) and (pp.valid_to is null or pp.valid_to>=(e.starts_at at time zone 'Europe/Prague')::date))),'[]'),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('memberId',m.id,'status',case a.status when 'full' then 'present' when 'partial' then 'partial' when 'absent' then 'absent' when 'excused' then 'excused' else 'unknown' end,'attendancePercent',a.attendance_percent,'attendedMinutes',a.minutes_present,'earnedPoints',case when e.status='closed' then coalesce(a.effective_points,0) else 0 end,'interest',case when r.response='unanswered' or r.response is null then 'unset' else r.response::text end,'note',r.note,'selected',coalesce(p.status='selected',false),'standing',coalesce(p.standing,false),'actualStanding',e.type='performance' and coalesce(p.actual_standing,false)) order by m.display_name) from public.members m left join public.attendance a on a.member_id=m.id and a.event_id=e.id left join public.event_responses r on r.member_id=m.id and r.event_id=e.id left join public.event_participants p on p.member_id=m.id and p.event_id=e.id where m.is_active and (roster or m.id=public.current_member_id())),'[]'),
 'pairs',coalesce((select jsonb_agg(public.pair_json_v3(p) order by p.below_line,p.age_group,p.id) from public.event_pairs p where p.pairing_run_id=run_id),'[]'),
 'actualPairs',coalesce((select jsonb_agg(public.pair_json_v3(p)) from public.event_pairs p join public.pairing_runs pr on pr.id=p.pairing_run_id where pr.event_id=e.id and e.type='performance' and p.is_confirmed_actual),'[]'),
 'pairsPublished',coalesce((select status='published' from public.pairing_runs where id=run_id),false),
 'pairSets',coalesce((select jsonb_agg(jsonb_build_object('id',pr.id,'name',coalesce(pr.note,'Sada párů'),'createdAt',pr.generated_at,'published',pr.status='published','pairs',coalesce((select jsonb_agg(public.pair_json_v3(p)) from public.event_pairs p where p.pairing_run_id=pr.id),'[]')) order by pr.generated_at desc) from public.pairing_runs pr where pr.event_id=e.id and e.type='rehearsal' and (public.view_is_admin_v3() or pr.status='published')),'[]'),
 'songSeries',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'name',ss.name,'confirmed',ss.confirmed,'songIds',coalesce((select jsonb_agg(si.song_id order by si.position) from public.song_series_items si where si.series_id=ss.id),'[]')) order by ss.position,ss.id) from public.song_series ss where ss.event_id=e.id and (public.view_is_admin_v3() or ss.confirmed)),'[]'),
 'programItems',coalesce((select jsonb_agg(jsonb_build_object('id',pi.id,'catalogId',pi.catalog_program_id,'name',coalesce(pc.name,pi.custom_name),'custom',pi.catalog_program_id is null,'sortOrder',pi.position) order by pi.position) from public.event_program_items pi left join public.program_catalog pc on pc.id=pi.catalog_program_id where pi.event_id=e.id),'[]')
 ) into result; return result; end; $$;

create function public.member_preview_v3(filters jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; previous text := current_setting('app.member_preview',true);
begin
 perform public.require_admin_v3();
 perform set_config('app.member_preview','1',true);
 if filters is null then
  result := public.get_app_database_v3();
  result := jsonb_set(result,'{accessMode}','"member"'::jsonb);
 else
  result := public.scores_v3(filters);
 end if;
 perform set_config('app.member_preview',coalesce(previous,''),true);
 return result;
exception when others then
 perform set_config('app.member_preview',coalesce(previous,''),true);
 raise;
end; $$;
revoke all on function public.member_preview_v3(jsonb) from public, anon;
grant execute on function public.member_preview_v3(jsonb) to authenticated;
