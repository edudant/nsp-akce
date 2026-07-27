-- Recorders may add and correct records, but only administrators may delete
-- historical participation, attendance and pairing data.

drop policy if exists event_responses_staff_all on public.event_responses;
drop policy if exists event_participants_staff_all on public.event_participants;
drop policy if exists attendance_staff_all on public.attendance;
drop policy if exists pairing_runs_staff_all on public.pairing_runs;
drop policy if exists event_pairs_staff_all on public.event_pairs;

create policy event_responses_staff_select
on public.event_responses for select to authenticated
using (public.is_staff());
create policy event_responses_staff_insert
on public.event_responses for insert to authenticated
with check (public.is_staff());
create policy event_responses_staff_update
on public.event_responses for update to authenticated
using (public.is_staff())
with check (public.is_staff());
create policy event_responses_admin_delete
on public.event_responses for delete to authenticated
using (public.is_admin());

create policy event_participants_staff_select
on public.event_participants for select to authenticated
using (public.is_staff());
create policy event_participants_staff_insert
on public.event_participants for insert to authenticated
with check (public.is_staff());
create policy event_participants_staff_update
on public.event_participants for update to authenticated
using (public.is_staff())
with check (public.is_staff());
create policy event_participants_admin_delete
on public.event_participants for delete to authenticated
using (public.is_admin());

create policy attendance_staff_select
on public.attendance for select to authenticated
using (public.is_staff());
create policy attendance_staff_insert
on public.attendance for insert to authenticated
with check (public.is_staff());
create policy attendance_staff_update
on public.attendance for update to authenticated
using (public.is_staff())
with check (public.is_staff());
create policy attendance_admin_delete
on public.attendance for delete to authenticated
using (public.is_admin());

create policy pairing_runs_staff_select
on public.pairing_runs for select to authenticated
using (public.is_staff());
create policy pairing_runs_staff_insert
on public.pairing_runs for insert to authenticated
with check (public.is_staff());
create policy pairing_runs_staff_update
on public.pairing_runs for update to authenticated
using (public.is_staff())
with check (public.is_staff());
create policy pairing_runs_admin_delete
on public.pairing_runs for delete to authenticated
using (public.is_admin());

create policy event_pairs_staff_select
on public.event_pairs for select to authenticated
using (public.is_staff());
create policy event_pairs_staff_insert
on public.event_pairs for insert to authenticated
with check (public.is_staff());
create policy event_pairs_staff_update
on public.event_pairs for update to authenticated
using (public.is_staff())
with check (public.is_staff());
create policy event_pairs_admin_delete
on public.event_pairs for delete to authenticated
using (public.is_admin());

