import { createClient } from 'npm:@supabase/supabase-js@2.110.8';
import { createFeedHandler } from './handler.ts';
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
Deno.serve(createFeedHandler(async (digest) => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing configuration');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc('get_calendar_feed', { token_digest: digest });
  if (error) throw new Error('Projection failed');
  return data;
}, Deno.env.get('CALENDAR_APP_URL') ?? ''));
