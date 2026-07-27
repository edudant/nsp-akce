-- Recorders need member roster data, but private administrative notes are
-- visible only through an administrator-checked function.

create function public.get_staff_members()
returns table (
  id uuid,
  display_name text,
  short_name text,
  pairing_role public.pairing_role,
  experience_level public.experience_level,
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

revoke select on public.members from authenticated;
grant select (
  id,
  display_name,
  short_name,
  pairing_role,
  experience_level,
  active_from,
  active_to,
  is_active,
  created_at,
  updated_at
) on public.members to authenticated;

revoke all on function public.get_staff_members() from public, anon;
grant execute on function public.get_staff_members() to authenticated;
