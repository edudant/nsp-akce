-- Requires an existing admin account. All changes roll back.
begin;
do $$ begin perform set_config('request.jwt.claim.sub', (select user_id::text from public.user_roles where role='admin' limit 1), true); end; $$;
set local role authenticated;
do $$
declare preview jsonb; scores jsonb;
begin
 if not public.is_admin() then raise exception 'Admin fixture missing'; end if;
 preview := public.member_preview_v3();
 if preview->>'accessMode' <> 'member' then raise exception 'Preview mode'; end if;
 if preview->'myMemberId' is distinct from to_jsonb(public.current_member_id()) and preview->'myMemberId' <> 'null'::jsonb then raise exception 'Preview identity'; end if;
 if exists(select 1 from jsonb_array_elements(preview->'members') m where m ?| array['experience','note','account'] or (m->>'experienceKnown')::boolean) then raise exception 'Private member fields'; end if;
 if exists(select 1 from jsonb_array_elements(preview->'events') e where e->>'status'='draft' or exists(select 1 from jsonb_array_elements(e->'songSeries') s where not (s->>'confirmed')::boolean) or exists(select 1 from jsonb_array_elements(e->'pairSets') s where not (s->>'published')::boolean)) then raise exception 'Unpublished data'; end if;
 scores := public.member_preview_v3('{}');
 if exists(select 1 from jsonb_array_elements(scores) s where s->'member' ?| array['experience','note','account']) then raise exception 'Private scores'; end if;
 if public.get_app_database_v3()->>'accessMode' <> 'admin' then raise exception 'Role restoration in same transaction'; end if;
 begin
  perform public.member_preview_v3('{"dateFrom":"invalid-date"}');
  raise exception 'Expected invalid date rejection';
 exception when invalid_datetime_format then null;
 end;
 if public.get_app_database_v3()->>'accessMode' <> 'admin' then raise exception 'Exception restoration'; end if;
end; $$;
reset role;
select 'passed' as admin_member_preview_checks;
rollback;
