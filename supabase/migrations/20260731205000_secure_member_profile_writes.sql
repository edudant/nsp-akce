-- Member administration needs to read and write admin_note, while ordinary
-- authenticated members must never receive direct SELECT access to that
-- private column. Keep the restrictive column grant and expose one narrowly
-- scoped, administrator-checked write operation instead.

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
      active_from,
      is_active,
      admin_note
    )
    values (
      btrim(member_patch ->> 'display_name'),
      btrim(member_patch ->> 'short_name'),
      (member_patch ->> 'pairing_role')::public.pairing_role,
      (member_patch ->> 'experience_level')::public.experience_level,
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
