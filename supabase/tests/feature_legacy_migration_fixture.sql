-- Local migration runner only: insert synthetic v2 records before the v3 migrations.
insert into public.seasons(id,name,date_from,date_to) values ('e5000000-0000-4000-8000-000000000001','Legacy migration fixture','2026-01-01','2026-12-31');
insert into public.members(id,display_name,short_name,pairing_role,age_group) values
 ('e5100000-0000-4000-8000-000000000001','Legacy male','LM','lead','old'),
 ('e5100000-0000-4000-8000-000000000002','Legacy female','LF','follow','old');
insert into public.events(id,season_id,type,title,starts_at,ends_at,status,points_weight,required_pairs) values
 ('e5200000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','rehearsal','Legacy rehearsal','2026-09-01 17:00Z','2026-09-01 19:00Z','closed',2,1),
 ('e5200000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000001','performance','Legacy performance','2026-09-02 17:00Z','2026-09-02 19:00Z','open',2,3);
insert into public.attendance(event_id,member_id,status,minutes_present) values ('e5200000-0000-4000-8000-000000000001','e5100000-0000-4000-8000-000000000001','partial',60);
insert into public.event_responses(event_id,member_id,response) values ('e5200000-0000-4000-8000-000000000002','e5100000-0000-4000-8000-000000000001','maybe');
insert into public.pairing_runs(id,event_id,seed) values ('e5300000-0000-4000-8000-000000000001','e5200000-0000-4000-8000-000000000001',1);
insert into public.event_pairs(pairing_run_id,round_number,member_a_id,member_b_id,is_confirmed_actual) values ('e5300000-0000-4000-8000-000000000001',1,'e5100000-0000-4000-8000-000000000001','e5100000-0000-4000-8000-000000000002',true);
update public.pairing_runs set status='published',published_at=now() where id='e5300000-0000-4000-8000-000000000001';
