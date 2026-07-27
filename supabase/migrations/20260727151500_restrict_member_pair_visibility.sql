-- Explicit member accounts may read only published pairs for member/public events.

drop policy if exists pairing_runs_member_select on public.pairing_runs;
drop policy if exists event_pairs_member_select on public.event_pairs;

create policy pairing_runs_member_select
on public.pairing_runs for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and status = 'published'
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.status <> 'draft'
      and e.visibility in ('public', 'members')
  )
);

create policy event_pairs_member_select
on public.event_pairs for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and exists (
    select 1
    from public.pairing_runs pr
    join public.events e on e.id = pr.event_id
    where pr.id = pairing_run_id
      and pr.status = 'published'
      and e.status <> 'draft'
      and e.visibility in ('public', 'members')
  )
);

