-- Run once after deploying push-reminders and creating these secrets in Vault:
-- push_function_url: full https://PROJECT.supabase.co/functions/v1/push-reminders
-- push_cron_secret: same secret as the Edge Function's PUSH_CRON_SECRET
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if (select count(*) from vault.decrypted_secrets where name='push_function_url')<>1
 or (select count(*) from vault.decrypted_secrets where name='push_cron_secret')<>1
 then raise exception 'Configure unique push_function_url and push_cron_secret Vault secrets first.'; end if;
end $$;
select cron.schedule('nsp-push-reminders','*/15 * * * *', $job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='push_function_url'),
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='push_cron_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
 );
$job$);
