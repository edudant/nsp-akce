-- Named event programs, scoped pairing blocks and private event partner wishes.

create table public.program_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index program_catalog_name_ci_idx
  on public.program_catalog (lower(btrim(name)));
create index program_catalog_active_sort_idx
  on public.program_catalog (is_active, sort_order, name);

create table public.event_program_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  catalog_program_id uuid references public.program_catalog(id) on delete restrict,
  custom_name text,
  position integer not null check (position > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_program_items_one_source check (
    (catalog_program_id is not null and custom_name is null)
    or (
      catalog_program_id is null
      and custom_name is not null
      and length(btrim(custom_name)) between 1 and 120
    )
  ),
  unique (event_id, position)
);

create index event_program_items_event_idx
  on public.event_program_items (event_id, position);
create unique index event_program_items_catalog_once_idx
  on public.event_program_items (event_id, catalog_program_id)
  where catalog_program_id is not null;
create unique index event_program_items_custom_name_ci_idx
  on public.event_program_items (event_id, lower(btrim(custom_name)))
  where catalog_program_id is null;

create table public.pairing_blocks (
  id uuid primary key default gen_random_uuid(),
  pairing_run_id uuid not null references public.pairing_runs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  applies_to_all_program_items boolean not null default false,
  position integer not null check (position > 0),
  is_legacy_round boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, pairing_run_id),
  unique (pairing_run_id, position)
);

create index pairing_blocks_run_idx
  on public.pairing_blocks (pairing_run_id, position);
create unique index pairing_blocks_name_ci_idx
  on public.pairing_blocks (pairing_run_id, lower(btrim(name)));

create table public.pairing_block_program_items (
  pairing_run_id uuid not null,
  pairing_block_id uuid not null,
  event_program_item_id uuid not null references public.event_program_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pairing_block_id, event_program_item_id),
  foreign key (pairing_block_id, pairing_run_id)
    references public.pairing_blocks(id, pairing_run_id) on delete cascade,
  unique (pairing_run_id, event_program_item_id)
);

create index pairing_block_program_items_item_idx
  on public.pairing_block_program_items (event_program_item_id);

create table public.event_partner_wishes (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  partner_member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id, partner_member_id),
  constraint event_partner_wishes_distinct_members check (
    member_id <> partner_member_id
  )
);

create index event_partner_wishes_partner_idx
  on public.event_partner_wishes (event_id, partner_member_id, member_id);

insert into public.program_catalog (name, sort_order)
values
  ('Postřekovo', 10),
  ('Postřekoviny', 20),
  ('Chodská svatba', 30),
  ('Bláhoviny', 40),
  ('Zelený kousky', 50)
on conflict (lower(btrim(name))) do nothing;

create trigger program_catalog_set_updated_at
before update on public.program_catalog
for each row execute function public.set_updated_at();
create trigger event_program_items_set_updated_at
before update on public.event_program_items
for each row execute function public.set_updated_at();
create trigger pairing_blocks_set_updated_at
before update on public.pairing_blocks
for each row execute function public.set_updated_at();
create trigger event_partner_wishes_set_updated_at
before update on public.event_partner_wishes
for each row execute function public.set_updated_at();

create trigger program_catalog_audit
after insert or update or delete on public.program_catalog
for each row execute function public.write_audit_log('id');
create trigger event_program_items_audit
after insert or update or delete on public.event_program_items
for each row execute function public.write_audit_log('id');
create trigger pairing_blocks_audit
after insert or update or delete on public.pairing_blocks
for each row execute function public.write_audit_log('id');
create trigger pairing_block_program_items_audit
after insert or update or delete on public.pairing_block_program_items
for each row execute function public.write_audit_log(
  'pairing_block_id', 'event_program_item_id'
);
create trigger event_partner_wishes_audit
after insert or update or delete on public.event_partner_wishes
for each row execute function public.write_audit_log(
  'event_id', 'member_id', 'partner_member_id'
);

create or replace function public.normalize_program_catalog_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  return new;
end;
$$;

create or replace function public.normalize_event_program_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.custom_name := nullif(btrim(new.custom_name), '');

  if tg_op = 'UPDATE'
     and new.event_id is distinct from old.event_id
     and exists (
       select 1
       from public.pairing_block_program_items bp
       where bp.event_program_item_id = old.id
     ) then
    raise exception 'Přiřazené pásmo nelze přesunout k jiné události.';
  end if;
  return new;
end;
$$;

create trigger program_catalog_normalize_name
before insert or update of name on public.program_catalog
for each row execute function public.normalize_program_catalog_name();
create trigger event_program_items_normalize_name
before insert or update of custom_name, event_id on public.event_program_items
for each row execute function public.normalize_event_program_item();

create or replace function public.validate_pairing_block_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);

  if tg_op = 'UPDATE'
     and new.pairing_run_id is distinct from old.pairing_run_id
     and (
       exists (
         select 1 from public.event_pairs ep
         where ep.pairing_block_id = old.id
       )
       or exists (
         select 1 from public.pairing_block_program_items bp
         where bp.pairing_block_id = old.id
       )
     ) then
    raise exception 'Blok s přiřazenými páry nebo pásmy nelze přesunout.';
  end if;

  if new.applies_to_all_program_items and exists (
    select 1
    from public.pairing_block_program_items bp
    where bp.pairing_block_id = new.id
  ) then
    raise exception 'Blok pro celou událost nemůže mít vybraná jednotlivá pásma.';
  end if;

  -- Existing numeric rounds are preserved as explicitly marked legacy blocks.
  -- Newly created blocks enforce one whole-event block or multiple disjoint
  -- program-scoped blocks.
  if not new.is_legacy_round and exists (
    select 1
    from public.pairing_blocks other
    where other.pairing_run_id = new.pairing_run_id
      and other.id <> new.id
      and not other.is_legacy_round
      and (
        new.applies_to_all_program_items
        or other.applies_to_all_program_items
      )
  ) then
    raise exception 'Blok pro celou událost nelze kombinovat s dalšími bloky.';
  end if;

  return new;
end;
$$;

create trigger pairing_blocks_validate_scope
before insert or update on public.pairing_blocks
for each row execute function public.validate_pairing_block_scope();

create or replace function public.validate_pairing_block_program_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_run_event_id uuid;
  v_item_event_id uuid;
  v_all_programs boolean;
begin
  select pr.event_id, pb.applies_to_all_program_items
    into v_run_event_id, v_all_programs
  from public.pairing_blocks pb
  join public.pairing_runs pr on pr.id = pb.pairing_run_id
  where pb.id = new.pairing_block_id
    and pb.pairing_run_id = new.pairing_run_id;

  if not found then
    raise exception 'Párovací blok neexistuje.';
  end if;
  if v_all_programs then
    raise exception 'Blok pro celou událost nemůže mít vybraná jednotlivá pásma.';
  end if;

  select epi.event_id into v_item_event_id
  from public.event_program_items epi
  where epi.id = new.event_program_item_id;

  if v_item_event_id is distinct from v_run_event_id then
    raise exception 'Pásmo a párovací blok musí patřit stejné události.';
  end if;

  return new;
end;
$$;

create trigger pairing_block_program_items_validate
before insert or update on public.pairing_block_program_items
for each row execute function public.validate_pairing_block_program_item();

create or replace function public.validate_event_partner_wish()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_member_role public.pairing_role;
  v_partner_role public.pairing_role;
  v_member_active boolean;
  v_partner_active boolean;
begin
  select m.pairing_role, m.is_active
    into v_member_role, v_member_active
  from public.members m
  where m.id = new.member_id;

  select m.pairing_role, m.is_active
    into v_partner_role, v_partner_active
  from public.members m
  where m.id = new.partner_member_id;

  if not coalesce(v_member_active, false)
     or not coalesce(v_partner_active, false) then
    raise exception 'Přání lze uložit pouze mezi aktivními členy.';
  end if;
  if v_member_role = v_partner_role then
    raise exception 'Partner musí mít opačnou taneční roli.';
  end if;

  return new;
end;
$$;

create trigger event_partner_wishes_validate
before insert or update on public.event_partner_wishes
for each row execute function public.validate_event_partner_wish();

create or replace function public.can_member_set_partner_wishes(target_event_id uuid)
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
      and e.visibility in ('public', 'members', 'shared')
      and (e.response_deadline is null or now() <= e.response_deadline)
      and now() < e.starts_at
  );
$$;

alter table public.program_catalog enable row level security;
alter table public.event_program_items enable row level security;
alter table public.pairing_blocks enable row level security;
alter table public.pairing_block_program_items enable row level security;
alter table public.event_partner_wishes enable row level security;

create policy program_catalog_member_select
on public.program_catalog for select to authenticated
using (
  public.is_admin()
  or public.has_role('member'::public.app_role)
);
create policy program_catalog_admin_all
on public.program_catalog for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy event_program_items_member_select
on public.event_program_items for select to authenticated
using (
  public.is_admin()
  or (
    public.has_role('member'::public.app_role)
    and exists (
      select 1 from public.events e
      where e.id = event_id
        and e.status <> 'draft'
        and e.visibility in ('public', 'members', 'shared')
    )
  )
);
create policy event_program_items_admin_all
on public.event_program_items for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy pairing_blocks_member_select
on public.pairing_blocks for select to authenticated
using (
  public.is_admin()
  or (
    public.has_role('member'::public.app_role)
    and exists (
      select 1
      from public.pairing_runs pr
      join public.events e on e.id = pr.event_id
      where pr.id = pairing_run_id
        and pr.status = 'published'
        and e.status <> 'draft'
        and e.visibility in ('public', 'members', 'shared')
    )
  )
);
create policy pairing_blocks_admin_all
on public.pairing_blocks for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy pairing_block_program_items_member_select
on public.pairing_block_program_items for select to authenticated
using (
  public.is_admin()
  or (
    public.has_role('member'::public.app_role)
    and exists (
      select 1
      from public.pairing_runs pr
      join public.events e on e.id = pr.event_id
      where pr.id = pairing_run_id
        and pr.status = 'published'
        and e.status <> 'draft'
        and e.visibility in ('public', 'members', 'shared')
    )
  )
);
create policy pairing_block_program_items_admin_all
on public.pairing_block_program_items for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy event_partner_wishes_admin_all
on public.event_partner_wishes for all to authenticated
using (public.is_admin())
with check (public.is_admin());
create policy event_partner_wishes_member_select
on public.event_partner_wishes for select to authenticated
using (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
);
create policy event_partner_wishes_member_insert
on public.event_partner_wishes for insert to authenticated
with check (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
  and public.can_member_set_partner_wishes(event_id)
);
create policy event_partner_wishes_member_delete
on public.event_partner_wishes for delete to authenticated
using (
  public.has_role('member'::public.app_role)
  and member_id = public.current_member_id()
  and public.can_member_set_partner_wishes(event_id)
);

revoke all on
  public.program_catalog,
  public.event_program_items,
  public.pairing_blocks,
  public.pairing_block_program_items,
  public.event_partner_wishes
from public, anon, authenticated;

grant select, insert, update, delete on
  public.program_catalog,
  public.event_program_items,
  public.pairing_blocks,
  public.pairing_block_program_items,
  public.event_partner_wishes
to authenticated;

-- Keep round_number during a compatibility release. Existing pairs are linked
-- to one legacy named block per run/round and old clients automatically create
-- the same kind of block on insert.
alter table public.event_pairs
  add column pairing_block_id uuid references public.pairing_blocks(id) on delete restrict;

alter table public.event_pairs
  alter column round_number set default 1;

create index event_pairs_pairing_block_idx
  on public.event_pairs (pairing_block_id);

insert into public.pairing_blocks (
  pairing_run_id,
  name,
  applies_to_all_program_items,
  position,
  is_legacy_round,
  created_by
)
select
  ep.pairing_run_id,
  'Kolo ' || ep.round_number,
  true,
  ep.round_number,
  true,
  null::uuid
from public.event_pairs ep
group by ep.pairing_run_id, ep.round_number
on conflict (pairing_run_id, position) do nothing;

alter table public.event_pairs disable trigger event_pairs_validate;

update public.event_pairs ep
set pairing_block_id = pb.id
from public.pairing_blocks pb
where pb.pairing_run_id = ep.pairing_run_id
  and pb.position = ep.round_number
  and ep.pairing_block_id is null;

alter table public.event_pairs enable trigger event_pairs_validate;

create or replace function public.assign_event_pairing_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block_id uuid;
  v_block_run_id uuid;
  v_position integer;
begin
  -- A compatibility client expresses block changes through round_number.
  if tg_op = 'UPDATE'
     and new.round_number is distinct from old.round_number
     and new.pairing_block_id is not distinct from old.pairing_block_id then
    new.pairing_block_id := null;
  end if;

  if new.pairing_block_id is not null then
    select pb.pairing_run_id, pb.position
      into v_block_run_id, v_position
    from public.pairing_blocks pb
    where pb.id = new.pairing_block_id;

    if not found or v_block_run_id <> new.pairing_run_id then
      raise exception 'Pár a párovací blok musí patřit stejnému návrhu.';
    end if;

    new.round_number := v_position;
    return new;
  end if;

  select pb.id into v_block_id
  from public.pairing_blocks pb
  where pb.pairing_run_id = new.pairing_run_id
    and pb.position = new.round_number;

  if v_block_id is null then
    insert into public.pairing_blocks (
      pairing_run_id,
      name,
      applies_to_all_program_items,
      position,
      is_legacy_round,
      created_by
    )
    values (
      new.pairing_run_id,
      'Kolo ' || new.round_number,
      true,
      new.round_number,
      true,
      auth.uid()
    )
    on conflict (pairing_run_id, position) do nothing;

    select pb.id into v_block_id
    from public.pairing_blocks pb
    where pb.pairing_run_id = new.pairing_run_id
      and pb.position = new.round_number;
  end if;

  new.pairing_block_id := v_block_id;
  return new;
end;
$$;

create trigger event_pairs_assign_pairing_block
before insert or update of pairing_block_id, round_number, pairing_run_id
on public.event_pairs
for each row execute function public.assign_event_pairing_block();

create or replace function public.guard_pairing_run_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published'
     and (
       case
         when tg_op = 'INSERT' then true
         else new.status is distinct from old.status
       end
     ) then
    if auth.uid() is not null
       and coalesce(current_setting('app.publishing_pairing_run', true), '') <> '1' then
      raise exception 'Návrh párů zveřejněte funkcí publish_pairing_run.';
    end if;

    if exists (
      select 1
      from public.pairing_blocks pb
      where pb.pairing_run_id = new.id
        and not pb.is_legacy_round
        and not pb.applies_to_all_program_items
        and not exists (
          select 1
          from public.pairing_block_program_items bp
          where bp.pairing_block_id = pb.id
        )
    ) then
      raise exception 'Každý párovací blok musí mít vybrané pásmo.';
    end if;

    if exists (
      select 1
      from public.pairing_blocks pb
      where pb.pairing_run_id = new.id
        and not pb.is_legacy_round
        and not exists (
          select 1
          from public.event_pairs ep
          where ep.pairing_block_id = pb.id
        )
    ) then
      raise exception 'Každý párovací blok musí obsahovat alespoň jeden pár.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.get_my_partner_wishes(target_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_result jsonb;
begin
  if v_member_id is null then
    raise exception 'Účet není propojený s aktivním členem.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'partnerMemberId', w.partner_member_id,
      'displayName', m.display_name,
      'shortName', m.short_name,
      'pairingRole', m.pairing_role
    ) order by m.display_name
  ), '[]'::jsonb)
  into v_result
  from public.event_partner_wishes w
  join public.members m on m.id = w.partner_member_id
  where w.event_id = target_event_id
    and w.member_id = v_member_id;

  return v_result;
end;
$$;

create or replace function public.set_my_partner_wishes(
  target_event_id uuid,
  partner_member_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_requested_count integer;
begin
  if v_member_id is null then
    raise exception 'Účet není propojený s aktivním členem.';
  end if;
  if not public.can_member_set_partner_wishes(target_event_id) then
    raise exception 'Přání už pro tuto událost nelze měnit.';
  end if;

  select count(distinct requested_id)::integer
    into v_requested_count
  from unnest(coalesce(partner_member_ids, '{}'::uuid[])) requested_id;

  if v_requested_count > 20 then
    raise exception 'Pro jednu událost lze vybrat nejvýše 20 partnerů.';
  end if;
  if exists (
    select 1
    from unnest(coalesce(partner_member_ids, '{}'::uuid[])) requested_id
    left join public.members partner on partner.id = requested_id
    join public.members owner on owner.id = v_member_id
    where partner.id is null
       or not partner.is_active
       or partner.id = v_member_id
       or partner.pairing_role = owner.pairing_role
  ) then
    raise exception 'Výběr obsahuje neplatného nebo nekompatibilního partnera.';
  end if;

  delete from public.event_partner_wishes
  where event_id = target_event_id
    and member_id = v_member_id;

  insert into public.event_partner_wishes (
    event_id,
    member_id,
    partner_member_id
  )
  select target_event_id, v_member_id, requested_id
  from (
    select distinct requested_id
    from unnest(coalesce(partner_member_ids, '{}'::uuid[])) requested_id
  ) requested;

  return public.get_my_partner_wishes(target_event_id);
end;
$$;

-- Pair history counts one occurrence per affected program item. An event or
-- legacy block without program items counts once.
create or replace view public.pair_history
with (security_invoker = true)
as
with pair_occurrences as (
  select
    ep.id,
    ep.member_a_id,
    ep.member_b_id,
    e.starts_at,
    greatest(
      1,
      case
        when pb.id is null then 1
        when pb.applies_to_all_program_items then (
          select count(*)::integer
          from public.event_program_items epi
          where epi.event_id = e.id
        )
        else (
          select count(*)::integer
          from public.pairing_block_program_items bp
          where bp.pairing_block_id = pb.id
        )
      end
    ) as occurrence_count
  from public.event_pairs ep
  join public.pairing_runs pr on pr.id = ep.pairing_run_id
  join public.events e on e.id = pr.event_id
  left join public.pairing_blocks pb on pb.id = ep.pairing_block_id
  where ep.is_confirmed_actual
    and e.status <> 'cancelled'
)
select
  least(po.member_a_id, po.member_b_id) as member_low_id,
  greatest(po.member_a_id, po.member_b_id) as member_high_id,
  sum(po.occurrence_count)::integer as times_paired,
  max(po.starts_at) as last_paired_at,
  min(po.starts_at) as first_paired_at
from pair_occurrences po
group by
  least(po.member_a_id, po.member_b_id),
  greatest(po.member_a_id, po.member_b_id);

grant select on public.pair_history to authenticated;
revoke all on public.pair_history from anon;

revoke execute on function public.validate_pairing_block_scope()
  from public, anon, authenticated;
revoke execute on function public.validate_pairing_block_program_item()
  from public, anon, authenticated;
revoke execute on function public.validate_event_partner_wish()
  from public, anon, authenticated;
revoke execute on function public.assign_event_pairing_block()
  from public, anon, authenticated;
revoke execute on function public.normalize_program_catalog_name()
  from public, anon, authenticated;
revoke execute on function public.normalize_event_program_item()
  from public, anon, authenticated;
revoke execute on function public.can_member_set_partner_wishes(uuid)
  from public, anon;
revoke execute on function public.get_my_partner_wishes(uuid)
  from public, anon;
revoke execute on function public.set_my_partner_wishes(uuid, uuid[])
  from public, anon;

grant execute on function public.can_member_set_partner_wishes(uuid)
  to authenticated;
grant execute on function public.get_my_partner_wishes(uuid)
  to authenticated;
grant execute on function public.set_my_partner_wishes(uuid, uuid[])
  to authenticated;
