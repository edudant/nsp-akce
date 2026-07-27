-- Members may respond only to their own visible, open event before its deadline.

create or replace function public.can_member_respond(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and e.status = 'open'
      and e.visibility in ('public', 'members')
      and (e.response_deadline is null or now() <= e.response_deadline)
  );
$$;

drop policy if exists event_responses_member_insert on public.event_responses;
drop policy if exists event_responses_member_update on public.event_responses;

create policy event_responses_member_insert
on public.event_responses for insert to authenticated
with check (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
  and public.can_member_respond(event_id)
);

create policy event_responses_member_update
on public.event_responses for update to authenticated
using (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
  and public.can_member_respond(event_id)
)
with check (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
  and public.can_member_respond(event_id)
);

create or replace function public.stamp_event_response()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.responded_by := auth.uid();
    new.responded_at := now();
  end if;
  return new;
end;
$$;

create trigger event_responses_stamp_actor
before insert or update on public.event_responses
for each row execute function public.stamp_event_response();

revoke all on function public.can_member_respond(uuid) from public;
grant execute on function public.can_member_respond(uuid) to authenticated;

