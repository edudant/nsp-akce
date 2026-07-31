-- Administrators classify members as young or old independently of the
-- experience level used by the pairing generator. Existing members stay
-- unclassified until an administrator fills the new field.

create type public.member_age_group as enum ('young', 'old');

alter table public.members
  add column age_group public.member_age_group;

create index members_age_group_name_idx
  on public.members (age_group, display_name);

-- members uses column-level SELECT grants so that admin_note cannot leak
-- through the REST table endpoint. Explicitly expose the non-sensitive new
-- classification to authenticated users without widening any other grant.
grant select (age_group) on public.members to authenticated;

-- PostgreSQL cannot change a function's OUT row type with CREATE OR REPLACE.
-- Recreate the guarded staff roster inside this migration's transaction.
drop function public.get_staff_members();

create function public.get_staff_members()
returns table (
  id uuid,
  display_name text,
  short_name text,
  pairing_role public.pairing_role,
  experience_level public.experience_level,
  age_group public.member_age_group,
  active_from date,
  active_to date,
  is_active boolean,
  admin_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Seznam členů je dostupný pouze vedení souboru.';
  end if;

  return query
  select
    m.id,
    m.display_name,
    m.short_name,
    m.pairing_role,
    m.experience_level,
    m.age_group,
    m.active_from,
    m.active_to,
    m.is_active,
    case when public.is_admin() then m.admin_note else null end,
    m.created_at,
    m.updated_at
  from public.members m
  order by m.display_name;
end;
$$;

revoke all on function public.get_staff_members() from public, anon;
grant execute on function public.get_staff_members() to authenticated;

create or replace function public.save_member_profile(
  target_member_id uuid,
  member_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_unknown_key text;
begin
  if not public.is_admin() then
    raise exception 'Profil člena může měnit pouze administrátor.';
  end if;
  if member_patch is null or jsonb_typeof(member_patch) <> 'object' then
    raise exception 'Změny profilu musí být předané jako objekt.';
  end if;

  select key into v_unknown_key
  from jsonb_object_keys(member_patch) as supplied(key)
  where key not in (
    'display_name',
    'short_name',
    'pairing_role',
    'experience_level',
    'age_group',
    'active_from',
    'is_active',
    'admin_note'
  )
  limit 1;
  if v_unknown_key is not null then
    raise exception 'Profil obsahuje nepovolené pole: %.', v_unknown_key;
  end if;

  if target_member_id is null then
    if not (
      member_patch ? 'display_name'
      and member_patch ? 'short_name'
      and member_patch ? 'pairing_role'
      and member_patch ? 'experience_level'
      and member_patch ? 'is_active'
    ) then
      raise exception 'Nový člen nemá vyplněná všechna povinná pole.';
    end if;

    insert into public.members (
      display_name,
      short_name,
      pairing_role,
      experience_level,
      age_group,
      active_from,
      is_active,
      admin_note
    )
    values (
      btrim(member_patch ->> 'display_name'),
      btrim(member_patch ->> 'short_name'),
      (member_patch ->> 'pairing_role')::public.pairing_role,
      (member_patch ->> 'experience_level')::public.experience_level,
      nullif(member_patch ->> 'age_group', '')::public.member_age_group,
      nullif(member_patch ->> 'active_from', '')::date,
      (member_patch ->> 'is_active')::boolean,
      member_patch ->> 'admin_note'
    )
    returning * into v_member;
  else
    update public.members
    set display_name = case
          when member_patch ? 'display_name'
            then btrim(member_patch ->> 'display_name')
          else display_name
        end,
        short_name = case
          when member_patch ? 'short_name'
            then btrim(member_patch ->> 'short_name')
          else short_name
        end,
        pairing_role = case
          when member_patch ? 'pairing_role'
            then (member_patch ->> 'pairing_role')::public.pairing_role
          else pairing_role
        end,
        experience_level = case
          when member_patch ? 'experience_level'
            then (member_patch ->> 'experience_level')::public.experience_level
          else experience_level
        end,
        age_group = case
          when member_patch ? 'age_group'
            then nullif(member_patch ->> 'age_group', '')::public.member_age_group
          else age_group
        end,
        active_from = case
          when member_patch ? 'active_from'
            then nullif(member_patch ->> 'active_from', '')::date
          else active_from
        end,
        is_active = case
          when member_patch ? 'is_active'
            then (member_patch ->> 'is_active')::boolean
          else is_active
        end,
        admin_note = case
          when member_patch ? 'admin_note'
            then member_patch ->> 'admin_note'
          else admin_note
        end
    where id = target_member_id
    returning * into v_member;

    if not found then
      raise exception 'Člen neexistuje.';
    end if;
  end if;

  return jsonb_build_object(
    'id', v_member.id,
    'display_name', v_member.display_name,
    'short_name', v_member.short_name,
    'pairing_role', v_member.pairing_role,
    'experience_level', v_member.experience_level,
    'age_group', v_member.age_group,
    'active_from', v_member.active_from,
    'is_active', v_member.is_active,
    'admin_note', v_member.admin_note
  );
end;
$$;

revoke execute on function public.save_member_profile(uuid, jsonb)
  from public, anon;
grant execute on function public.save_member_profile(uuid, jsonb)
  to authenticated;
