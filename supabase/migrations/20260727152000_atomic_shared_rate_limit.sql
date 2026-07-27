-- Serialize concurrent code attempts in one upsert and inspect the returned
-- counter before doing expensive bcrypt work.

create or replace function public.verify_shared_code(code text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.shared_access_config%rowtype;
  v_attempt public.shared_access_attempts%rowtype;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Pro ověření sdíleného kódu je nutná anonymní Auth relace.';
  end if;

  insert into public.shared_access_attempts (user_id, window_started_at, attempt_count)
  values (auth.uid(), now(), 1)
  on conflict (user_id) do update
    set window_started_at = case
          when public.shared_access_attempts.window_started_at <= now() - interval '1 minute'
            then now()
          else public.shared_access_attempts.window_started_at
        end,
        attempt_count = case
          when public.shared_access_attempts.window_started_at <= now() - interval '1 minute'
            then 1
          else public.shared_access_attempts.attempt_count + 1
        end
  returning * into v_attempt;

  if v_attempt.attempt_count > 5 then
    return null;
  end if;

  select * into v_config
  from public.shared_access_config
  where id = 1;

  if not coalesce(v_config.is_enabled, false)
     or v_config.code_hash is null
     or code is null
     or length(code) > 200 then
    return null;
  end if;

  if extensions.crypt(code, v_config.code_hash) <> v_config.code_hash then
    return null;
  end if;

  v_expires_at := now() + make_interval(mins => v_config.session_duration_minutes);

  insert into public.shared_access_sessions (user_id, verified_at, expires_at, last_seen_at)
  values (auth.uid(), now(), v_expires_at, now())
  on conflict (user_id) do update
    set verified_at = excluded.verified_at,
        expires_at = excluded.expires_at,
        last_seen_at = excluded.last_seen_at;

  delete from public.shared_access_attempts where user_id = auth.uid();
  return v_expires_at;
end;
$$;

revoke all on function public.verify_shared_code(text) from public;
grant execute on function public.verify_shared_code(text) to authenticated;

