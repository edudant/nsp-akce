-- Functions in an API-exposed schema are executable by PUBLIC by default.
-- Deny that default and grant only the intended authenticated RPC surface.

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.has_active_shared_session() to authenticated;
grant execute on function public.get_my_roles() to authenticated;
grant execute on function public.rotate_shared_code() to authenticated;
grant execute on function public.set_shared_access_enabled(boolean) to authenticated;
grant execute on function public.verify_shared_code(text) to authenticated;
grant execute on function public.end_shared_session() to authenticated;
grant execute on function public.get_pairing_candidate_scores(uuid, uuid) to authenticated;
grant execute on function public.publish_pairing_run(uuid) to authenticated;
grant execute on function public.confirm_actual_pairs(uuid) to authenticated;
grant execute on function public.set_current_season(uuid) to authenticated;
grant execute on function public.get_shared_overview() to authenticated;
grant execute on function public.get_shared_event_attendance(uuid) to authenticated;
grant execute on function public.get_shared_event_pairs(uuid) to authenticated;
grant execute on function public.can_member_respond(uuid) to authenticated;

drop policy if exists profiles_self_select on public.profiles;
drop policy if exists user_roles_self_select on public.user_roles;

create policy profiles_self_select
on public.profiles for select to authenticated
using (user_id = (select auth.uid()));

create policy user_roles_self_select
on public.user_roles for select to authenticated
using (user_id = (select auth.uid()));

