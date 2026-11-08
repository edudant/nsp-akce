// Upload only to the explicitly supplied Supabase project after applying the migration.
import { createClient } from '@supabase/supabase-js';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.NSP_SUPABASE_URL;
const key = process.env.NSP_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set NSP_SUPABASE_URL and NSP_SUPABASE_SERVICE_ROLE_KEY.');
const directory = resolve(process.argv[2] ?? '.local/carol-audio');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
for (let number = 1; number <= 25; number++) {
  const filename = `${String(number).padStart(2, '0')}.mp3`;
  const path = resolve(directory, filename);
  const info = await stat(path);
  if (!info.size || info.size > 10485760) throw new Error(`Invalid size: ${filename}`);
}
for (let number = 1; number <= 25; number++) {
  const filename = `${String(number).padStart(2, '0')}.mp3`;
  const body = await readFile(resolve(directory, filename));
  const { error } = await client.storage.from('carol-recordings').upload(`hdy-je-zima-mraz/${filename}`, body, { contentType: 'audio/mpeg', upsert: true });
  if (error) throw new Error(`${filename}: ${error.message}`);
  process.stdout.write(`${filename} uploaded\n`);
}
