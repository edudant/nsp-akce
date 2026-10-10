import { createClient } from 'npm:@supabase/supabase-js@2.110.8';
import webpush from 'npm:web-push@3.6.7';
import { createReminderHandler } from './handler.ts';
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
webpush.setVapidDetails(required('PUSH_VAPID_SUBJECT'), required('PUSH_VAPID_PUBLIC_KEY'), required('PUSH_VAPID_PRIVATE_KEY'));
Deno.serve(createReminderHandler({
  secret: required('PUSH_CRON_SECRET'), appUrl: required('PUSH_APP_URL'),
  async claim() {
    const { data, error } = await client.rpc('claim_push_reminders');
    if (error) throw error;
    return data;
  },
  async isCurrent(lease) {
    const { data, error } = await client.rpc('push_reminder_is_current', { delivery_lease: lease });
    if (error) throw error;
    return data === true;
  },
  send: (reminder, payload, ttl) => webpush.sendNotification({ endpoint: reminder.endpoint, keys: reminder.keys }, payload, { TTL: ttl, timeout: 10_000 }),
  async finish(lease, expired) {
    const { error } = await client.rpc('finish_push_reminder', { delivery_lease: lease, expired });
    if (error) throw error;
  },
}));
