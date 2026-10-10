-- Subscriptions and delivery leases are private even from application admins.
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 member_id uuid not null references public.members(id) on delete cascade,
 endpoint text not null unique,
 keys jsonb not null,
 created_at timestamptz not null default now()
);
create table public.push_reminder_deliveries (
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 event_id uuid not null references public.events(id) on delete cascade,
 deadline timestamptz not null,
 lease_id uuid not null default gen_random_uuid(),
 claimed_at timestamptz not null default now(),
 sent_at timestamptz,
 primary key(subscription_id,event_id,deadline)
);
alter table public.push_subscriptions enable row level security;
alter table public.push_reminder_deliveries enable row level security;
revoke all on public.push_subscriptions,public.push_reminder_deliveries from public,anon,authenticated;

create function public.save_my_push_subscription(subscription jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare mid uuid := public.current_member_id(); ep text := subscription->>'endpoint';
begin
 if auth.uid() is null or mid is null then raise exception 'Aktivní členský účet je vyžadován.' using errcode='42501'; end if;
 -- Allow only browser push services; never allow an arbitrary server-side URL.
 if ep is null or length(ep)>4096 or ep !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|([a-z0-9-]+[.])*notify[.]windows[.]com)/[^[:space:]]+$'
 or coalesce(subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}=?$'
 or coalesce(subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}={0,2}$'
 then raise exception 'Neplatný push odběr.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(ep, 815));
 -- A browser shared by multiple accounts belongs to the most recently opting-in account.
 delete from public.push_subscriptions where endpoint=ep and user_id<>auth.uid();
 insert into public.push_subscriptions(user_id,member_id,endpoint,keys)
 values(auth.uid(),mid,ep,subscription->'keys') on conflict(endpoint)
 do update set member_id=excluded.member_id,keys=excluded.keys;
end; $$;
create function public.get_my_push_subscription(push_endpoint text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.push_subscriptions where endpoint=push_endpoint and user_id=auth.uid() and member_id=public.current_member_id());
$$;
create function public.delete_my_push_subscription(push_endpoint text) returns void
language sql security definer set search_path='' as $$
 delete from public.push_subscriptions where endpoint=push_endpoint and user_id=auth.uid();
$$;

create function public.claim_push_reminders() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Serialize claims, including the case when a delivery row does not yet exist.
 perform pg_advisory_xact_lock(628092);
 with eligible as (
  select s.id subscription_id,e.id event_id,e.response_deadline deadline
  from public.push_subscriptions s
  join public.members m on m.id=s.member_id and m.is_active
  join public.member_accounts ma on ma.member_id=s.member_id and ma.linked_user_id=s.user_id
  join public.profiles p on p.user_id=s.user_id and p.member_id=s.member_id
  cross join public.events e
  left join public.event_responses r on r.event_id=e.id and r.member_id=s.member_id
  left join public.push_reminder_deliveries d on d.subscription_id=s.id and d.event_id=e.id and d.deadline=e.response_deadline
  where e.type='performance' and e.status='open' and e.visibility in ('public','members','shared')
   and e.response_deadline>now() and e.response_deadline<=now()+interval '24 hours'
   and coalesce(r.response::text,'unanswered')='unanswered'
   and (d.subscription_id is null or (d.sent_at is null and d.claimed_at<now()-interval '10 minutes'))
  order by e.response_deadline,s.id limit 100
 ), claimed as (
  insert into public.push_reminder_deliveries(subscription_id,event_id,deadline)
  select subscription_id,event_id,deadline from eligible
  on conflict(subscription_id,event_id,deadline) do update set claimed_at=now(),lease_id=gen_random_uuid()
  returning *
 )
 select coalesce(jsonb_agg(jsonb_build_object('subscriptionId',s.id,'eventId',e.id,'deadline',c.deadline,'leaseId',c.lease_id,
  'endpoint',s.endpoint,'keys',s.keys,'title',e.title)), '[]'::jsonb) into result
 from claimed c join public.push_subscriptions s on s.id=c.subscription_id join public.events e on e.id=c.event_id;
 return result;
end; $$;
create function public.finish_push_reminder(delivery_lease uuid, expired boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
 if expired then
  delete from public.push_subscriptions where id=(select subscription_id from public.push_reminder_deliveries where lease_id=delivery_lease);
 else
  update public.push_reminder_deliveries set sent_at=now() where lease_id=delivery_lease;
 end if;
end; $$;
revoke all on function public.save_my_push_subscription(jsonb),public.get_my_push_subscription(text),public.delete_my_push_subscription(text) from public,anon;
grant execute on function public.save_my_push_subscription(jsonb),public.get_my_push_subscription(text),public.delete_my_push_subscription(text) to authenticated;
revoke all on function public.claim_push_reminders(),public.finish_push_reminder(uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_push_reminders(),public.finish_push_reminder(uuid,boolean) to service_role;

-- Recheck each claimed delivery immediately before sending, including opt out and responses.
create function public.push_reminder_is_current(delivery_lease uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.push_reminder_deliveries d
  join public.push_subscriptions s on s.id=d.subscription_id
  join public.members m on m.id=s.member_id and m.is_active
  join public.member_accounts ma on ma.member_id=s.member_id and ma.linked_user_id=s.user_id
  join public.profiles p on p.user_id=s.user_id and p.member_id=s.member_id
  join public.events e on e.id=d.event_id
  left join public.event_responses r on r.event_id=e.id and r.member_id=s.member_id
  where d.lease_id=delivery_lease and d.sent_at is null
   and e.type='performance' and e.status='open' and e.visibility in ('public','members','shared')
   and e.response_deadline=d.deadline and e.response_deadline>now()
   and coalesce(r.response::text,'unanswered')='unanswered'
 );
$$;
revoke all on function public.push_reminder_is_current(uuid) from public,anon,authenticated;
grant execute on function public.push_reminder_is_current(uuid) to service_role;
