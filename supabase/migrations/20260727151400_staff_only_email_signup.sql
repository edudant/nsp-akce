-- Email signup is staff-only. Shared readers use anonymous Auth plus the
-- short-lived shared-code session, and other roles are granted explicitly.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_is_admin boolean := false;
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Uživatel'
  );

  insert into public.profiles (user_id, display_name)
  values (new.id, v_display_name)
  on conflict (user_id) do update
    set display_name = excluded.display_name;

  if not coalesce(new.is_anonymous, false) then
    select exists (
      select 1
      from public.admin_email_allowlist a
      where a.email = v_email
        and a.is_active
    ) into v_is_admin;

    if v_is_admin then
      insert into public.user_roles (user_id, role)
      values (new.id, 'admin'::public.app_role)
      on conflict do nothing;

      update public.admin_email_allowlist
      set claimed_by = new.id,
          claimed_at = now()
      where email = v_email;
    end if;
  end if;

  return new;
end;
$$;

