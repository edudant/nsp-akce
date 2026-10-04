-- Capability tokens are returned once; no client table access, including admins.
create table public.calendar_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 member_id uuid not null references public.members(id) on delete cascade,
 kind text not null check(kind in ('all','rehearsal','performance')),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 revoked_at timestamptz
);
create unique index calendar_subscriptions_active on public.calendar_subscriptions(user_id,kind) where revoked_at is null;
alter table public.calendar_subscriptions enable row level security;
revoke all on public.calendar_subscriptions from public,anon,authenticated;

create function public.get_calendar_subscriptions() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_member_id() is null then raise exception 'Aktivní členský účet je vyžadován.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'createdAt',created_at,'revokedAt',revoked_at,'linked',member_id=public.current_member_id()) order by created_at desc) from public.calendar_subscriptions where user_id=auth.uid()),'[]'::jsonb);
end; $$;

create function public.create_calendar_subscription(subscription_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare mid uuid := public.current_member_id(); token text; sid uuid;
begin
 if auth.uid() is null or mid is null then raise exception 'Aktivní členský účet je vyžadován.' using errcode='42501'; end if;
 if subscription_kind is null or subscription_kind not in ('all','rehearsal','performance') then raise exception 'Neplatný typ odběru.'; end if;
 -- Serialize replacements for this owner, also when no subscription exists yet.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 814));
 update public.calendar_subscriptions set revoked_at=now() where user_id=auth.uid() and kind=subscription_kind and revoked_at is null;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.calendar_subscriptions(user_id,member_id,kind,token_hash) values(auth.uid(),mid,subscription_kind,encode(extensions.digest(token,'sha256'),'hex')) returning id into sid;
 return jsonb_build_object('id',sid,'token',token);
end; $$;

create function public.revoke_calendar_subscription(subscription_kind text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_member_id() is null then raise exception 'Aktivní členský účet je vyžadován.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,814));
 update public.calendar_subscriptions set revoked_at=now() where user_id=auth.uid() and kind=subscription_kind and revoked_at is null;
end; $$;

-- Explicit member visibility; never use admin-sensitive event_visible_v3 here.
create function public.get_calendar_feed(token_digest text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sub public.calendar_subscriptions; result jsonb;
begin
 select c.* into sub from public.calendar_subscriptions c
 join public.members m on m.id=c.member_id and m.is_active
 join public.member_accounts ma on ma.member_id=c.member_id and ma.linked_user_id=c.user_id
 join public.profiles p on p.user_id=c.user_id and p.member_id=c.member_id
 where c.token_hash=token_digest and c.revoked_at is null;
 if sub.id is null then return null; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',e.id,'title',e.title,'location',e.location,'note',e.note,'startsAt',e.starts_at,'endsAt',e.ends_at,'status',e.status,
 'response',coalesce(r.response::text,'unanswered'),
 'memberResponse',mr.new_data->>'response','memberResponseAt',mr.occurred_at,
 'adminResponse',ar.new_data->>'response','adminResponseAt',ar.occurred_at,
 'updatedAt',greatest(e.updated_at,r.updated_at,mr.occurred_at,ar.occurred_at,changed.occurred_at)
 ) order by e.starts_at,e.id),'[]'::jsonb) into result
 from public.events e
 left join public.event_responses r on r.event_id=e.id and r.member_id=sub.member_id
 left join lateral (select new_data,occurred_at from public.audit_log where table_name='event_responses' and record_id=jsonb_build_object('event_id',e.id,'member_id',sub.member_id) and actor_kind='member' order by id desc limit 1) mr on true
 left join lateral (select new_data,occurred_at from public.audit_log where table_name='event_responses' and record_id=jsonb_build_object('event_id',e.id,'member_id',sub.member_id) and actor_kind='admin' order by id desc limit 1) ar on true
 left join lateral (select occurred_at from public.audit_log where table_name='event_responses' and record_id=jsonb_build_object('event_id',e.id,'member_id',sub.member_id) order by id desc limit 1) changed on true
 where e.status<>'draft' and e.visibility in ('public','members','shared')
 and e.starts_at >= now()-interval '12 months'
 and (sub.kind='all' or e.type::text=sub.kind);
 return result;
end; $$;
revoke all on function public.get_calendar_subscriptions(),public.create_calendar_subscription(text),public.revoke_calendar_subscription(text),public.get_calendar_feed(text) from public,anon,authenticated;
grant execute on function public.get_calendar_subscriptions(),public.create_calendar_subscription(text),public.revoke_calendar_subscription(text) to authenticated;
grant execute on function public.get_calendar_feed(text) to service_role;
