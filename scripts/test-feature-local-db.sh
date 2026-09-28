#!/usr/bin/env bash
# Replays migrations ONLY in the isolated Docker project nsp-feature-tests.
set -euo pipefail
[[ "${1:-}" == "--reset" ]] || { echo 'Usage: bash scripts/test-feature-local-db.sh --reset'; exit 2; }
container=supabase_db_nsp-feature-tests
[[ "$(docker inspect --format '{{.Name}}' "$container")" == "/$container" ]] || exit 1
root=$(cd "$(dirname "$0")/.." && pwd)
docker exec "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'drop schema public cascade; create schema public; grant usage on schema public to postgres, anon, authenticated, service_role; grant all on schema public to postgres, service_role;' >/dev/null
for migration in "$root"/supabase/migrations/*.sql; do
  if [[ "$(basename "$migration")" == "20260928100000_confirmed_event_status.sql" ]]; then
    docker exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$root/supabase/tests/feature_legacy_migration_fixture.sql" >/dev/null
  fi
  echo "Apply $(basename "$migration")"
  docker exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$migration" >/dev/null
done
docker exec "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "grant all on all tables in schema public to service_role; grant all on all functions in schema public to service_role; notify pgrst, 'reload schema';" >/dev/null

docker exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$root/supabase/tests/feature_legacy_migration_test.sql"
