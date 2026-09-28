-- Read-only assertions on synthetic migration fixtures.
do $$ begin
 if not exists(select 1 from public.members where id='e5100000-0000-4000-8000-000000000001' and age_groups=array['old']::public.member_age_group[] and age_group='old') then raise exception 'Legacy group was not migrated.'; end if;
 if not exists(select 1 from public.events where id='e5200000-0000-4000-8000-000000000002' and response_deadline=starts_at and old_pairs=3 and young_pairs=0) then raise exception 'Legacy deadline/estimate was not migrated.'; end if;
 if not exists(select 1 from public.attendance where event_id='e5200000-0000-4000-8000-000000000001' and attendance_percent=50 and effective_points=1) then raise exception 'Legacy partial attendance changed.'; end if;
 if not exists(select 1 from public.event_pairs where pairing_run_id='e5300000-0000-4000-8000-000000000001' and age_group='old' and not is_confirmed_actual) then raise exception 'Legacy rehearsal set was lost or remains actual history.'; end if;
 if not exists(select 1 from public.event_responses where event_id='e5200000-0000-4000-8000-000000000002' and response='maybe' and length(note)>0) then raise exception 'Legacy maybe was lost.'; end if;
 if has_function_privilege('authenticated','public.member_json_v3(public.members)','execute') or has_column_privilege('authenticated','public.members','experience_level','select') then raise exception 'Private helper/experience privilege leaked.'; end if;
end $$;
