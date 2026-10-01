#!/usr/bin/env bash
# New temporary PostgreSQL cluster; no existing database or Supabase is touched.
set -euo pipefail
repo_root=$(cd "$(dirname "$0")/.." && pwd)
test_dir=$(mktemp -d /tmp/nsp-repertoire.XXXXXX)
cleanup() {
  pg_ctl -D "$test_dir/db" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$test_dir"
}
trap cleanup EXIT
initdb -D "$test_dir/db" -A trust --no-locale -E UTF8 > "$test_dir/init.log"
pg_ctl -D "$test_dir/db" -l "$test_dir/server.log" -o "-k $test_dir -h ''" start >/dev/null
psql_args=(-h "$test_dir" -d postgres -v ON_ERROR_STOP=1)
psql "${psql_args[@]}" -f "$repo_root/supabase/tests/repertoire_isolated_fixture.sql" \
  -f "$repo_root/supabase/migrations/20261001150000_program_texts.sql" \
  -f "$repo_root/supabase/migrations/20261001151000_carol_repertoire.sql" >/dev/null
# Synthetic documents exercise both import paths without private lyrics.
psql "${psql_args[@]}" <<'SQL'
select set_config('test.access','admin',false);
select public.import_program_texts((select jsonb_agg(jsonb_build_object('name',name,'blocks','[{"kind":"text","text":"Fixture lyric"}]'::jsonb)) from public.program_catalog where name in ('Kolečka','Postřekoviny','Prohůdky ha voračky','Posvícení','Strašidla','Travničky','Volání','Zednický','Zelený kousky','Postřekovo','Židovka')));
select public.import_carol_texts((select jsonb_agg(jsonb_build_object('name','Carol fixture '||n,'kind','carol','source','fixture.pdf','sourcePages','[1]'::jsonb,'blocks','[{"kind":"text","text":"Fixture carol"}]'::jsonb)) from generate_series(1,65) n));
SQL
psql "${psql_args[@]}" -f "$repo_root/supabase/tests/repertoire_isolated_test.sql"
