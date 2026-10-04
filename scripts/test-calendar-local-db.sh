#!/usr/bin/env bash
# Disposable PostgreSQL cluster, full migrations, synthetic Auth schema only.
set -euo pipefail
repo_root=$(cd "$(dirname "$0")/.." && pwd)
test_dir=$(mktemp -d /tmp/nsp-calendar.XXXXXX)
cleanup() {
 pg_ctl -D "$test_dir/db" -m immediate stop >/dev/null 2>&1 || true
 rm -rf "$test_dir"
}
trap cleanup EXIT
initdb -D "$test_dir/db" -A trust --no-locale -E UTF8 > "$test_dir/init.log"
pg_ctl -D "$test_dir/db" -l "$test_dir/server.log" -o "-k $test_dir -h ''" start >/dev/null
args=(-h "$test_dir" -d postgres -v ON_ERROR_STOP=1)
psql "${args[@]}" -f "$repo_root/supabase/tests/calendar_auth_stub.sql" > "$test_dir/migrations.log"
for migration in "$repo_root"/supabase/migrations/*.sql; do
 if [[ "$(basename "$migration")" == "20260928100000_confirmed_event_status.sql" ]]; then
  psql "${args[@]}" -f "$repo_root/supabase/tests/feature_legacy_migration_fixture.sql" >> "$test_dir/migrations.log"
 fi
 psql "${args[@]}" -f "$migration" >> "$test_dir/migrations.log"
done
psql "${args[@]}" -f "$repo_root/supabase/tests/calendar_subscriptions_test.sql"
