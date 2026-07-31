#!/usr/bin/env bash

set -euo pipefail

umask 077

readonly EXPECTED_PROJECT_REF="vvjrfwgbapvkmhxqeqrq"
readonly SUPABASE_CLI_VERSION="2.109.1"
readonly MAX_BACKUP_AGE_SECONDS="86400"

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
readonly DEFAULT_BACKUP_ROOT="$(cd -- "$REPO_ROOT/.." && pwd -P)/nsp-akce-private-backups"

readonly -a MIGRATION_VERSIONS=(
  "20260731200000"
  "20260731201000"
  "20260731202000"
)

readonly -a MIGRATION_FILES=(
  "supabase/migrations/20260731200000_member_accounts_and_auth.sql"
  "supabase/migrations/20260731201000_programs_pairing_blocks_and_wishes.sql"
  "supabase/migrations/20260731202000_member_portal_and_pairing_reports.sql"
)

readonly -a MIGRATION_SHA256=(
  "2839780fda808999f4ec98c72bbffa7338625ffa17039901edbd1fcba205b00c"
  "847afcaf5bd9e2ba789c730cdb44ab2d15458ede2bf7bbbd0870411c70df5a9f"
  "2f53b533a7369a21793cc04eb80fd67fe9274069c4696c09be1bd422b1127d67"
)

readonly -a AFFECTED_PUBLIC_TABLES=(
  "seasons"
  "members"
  "events"
  "event_responses"
  "event_participants"
  "attendance"
  "pairing_preferences"
  "pairing_rules"
  "pairing_runs"
  "event_pairs"
  "audit_log"
  "profiles"
  "user_roles"
  "admin_email_allowlist"
  "shared_access_config"
  "shared_access_sessions"
  "shared_access_attempts"
)

readonly -a SUPABASE_CLI=(npx --yes "supabase@${SUPABASE_CLI_VERSION}")

die() {
  printf 'CHYBA: %s\n' "$*" >&2
  exit 1
}

note() {
  printf '%s\n' "$*"
}

usage() {
  cat <<'EOF'
Bezpečné vydání tří členských MVP migrací do produkčního Supabase projektu.

Použití:
  scripts/production-db-release.sh inspect
  scripts/production-db-release.sh backup [--backup-root ABSOLUTNI_CESTA]
  scripts/production-db-release.sh apply --apply --backup-dir ABSOLUTNI_CESTA

Příkazy inspect a backup nemění vzdálenou databázi. Příkaz apply je jediný,
který mění produkční schéma; vyžaduje čerstvou ověřenou zálohu, příznak
--apply a interaktivní opsání project ref.

Heslo databáze se nikdy nepředává v argumentu. Skript použije PGPASSWORD,
pokud je nastavené, jinak je bezpečně vyžádá bez zobrazení.
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Chybí požadovaný příkaz: $1"
}

sha256_file() {
  local file="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    die "Chybí sha256sum nebo shasum."
  fi
}

run_supabase() {
  (
    cd -- "$REPO_ROOT"
    "${SUPABASE_CLI[@]}" "$@"
  )
}

assert_linked_project() {
  local ref_file="$REPO_ROOT/supabase/.temp/project-ref"
  local linked_ref=""

  [[ -f "$ref_file" ]] || die "Repozitář není propojený se Supabase projektem. Chybí $ref_file"
  IFS= read -r linked_ref < "$ref_file" || [[ -n "$linked_ref" ]]
  [[ "$linked_ref" == "$EXPECTED_PROJECT_REF" ]] ||
    die "Repozitář je propojený s jiným projektem ($linked_ref)."
}

verify_release_files() {
  local index file actual

  for index in "${!MIGRATION_FILES[@]}"; do
    file="$REPO_ROOT/${MIGRATION_FILES[$index]}"
    [[ -f "$file" ]] || die "Chybí migrační soubor: ${MIGRATION_FILES[$index]}"
    actual="$(sha256_file "$file")"
    [[ "$actual" == "${MIGRATION_SHA256[$index]}" ]] ||
      die "Migrační soubor ${MIGRATION_FILES[$index]} se od schválené verze změnil. Aktualizujte a znovu ověřte release skript."
  done
}

configure_database_connection() {
  local pooler_file="$REPO_ROOT/supabase/.temp/pooler-url"
  local pooler_url=""

  require_command psql
  require_command pg_dump

  [[ -f "$pooler_file" ]] || die "Chybí $pooler_file. Nejprve propojte správný Supabase projekt."
  IFS= read -r pooler_url < "$pooler_file" || [[ -n "$pooler_url" ]]

  if [[ ! "$pooler_url" =~ ^postgresql://(postgres\.${EXPECTED_PROJECT_REF})@([A-Za-z0-9.-]+\.pooler\.supabase\.com):([0-9]+)/([A-Za-z0-9_-]+)$ ]]; then
    die "Pooler adresa neodpovídá očekávanému projektu nebo bezpečnému formátu bez hesla."
  fi

  export PGUSER="${BASH_REMATCH[1]}"
  export PGHOST="${BASH_REMATCH[2]}"
  export PGPORT="${BASH_REMATCH[3]}"
  export PGDATABASE="${BASH_REMATCH[4]}"
  export PGSSLMODE="require"
  export PGCONNECT_TIMEOUT="15"
  export PGAPPNAME="nsp-akce-production-release"

  if [[ -z "${PGPASSWORD:-}" ]]; then
    [[ -t 0 ]] || die "PGPASSWORD není nastavené a vstup není interaktivní."
    IFS= read -r -s -p "Heslo produkční databáze (nebude zobrazeno): " PGPASSWORD
    printf '\n' >&2
    [[ -n "$PGPASSWORD" ]] || die "Heslo nesmí být prázdné."
    export PGPASSWORD
  fi

  psql -X -q -v ON_ERROR_STOP=1 -t -A -c 'select 1' >/dev/null
  verify_pg_dump_version
}

verify_pg_dump_version() {
  local server_version_num dump_major

  server_version_num="$(db_scalar "select current_setting('server_version_num')")"
  dump_major="$(pg_dump --version | sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/')"

  [[ "$server_version_num" =~ ^[0-9]+$ ]] || die "Nelze zjistit verzi produkčního PostgreSQL."
  [[ "$dump_major" =~ ^[0-9]+$ ]] || die "Nelze zjistit verzi pg_dump."

  if (( dump_major < server_version_num / 10000 )); then
    die "pg_dump $dump_major je starší než produkční PostgreSQL $((server_version_num / 10000))."
  fi
}

db_scalar() {
  psql -X -q -v ON_ERROR_STOP=1 -t -A -c "$1"
}

assert_pre_deploy_state() {
  local migration_table new_relations history_count pairing_block_column

  migration_table="$(db_scalar "select coalesce(to_regclass('supabase_migrations.schema_migrations')::text, '')")"
  [[ "$migration_table" == "supabase_migrations.schema_migrations" ]] ||
    die "V databázi chybí tabulka historie Supabase migrací."

  new_relations="$(db_scalar "
    select count(*)
    from (values
      ('public.member_accounts'),
      ('public.member_invitation_deliveries'),
      ('public.program_catalog'),
      ('public.event_program_items'),
      ('public.pairing_blocks'),
      ('public.pairing_block_program_items'),
      ('public.event_partner_wishes')
    ) as expected(relation_name)
    where to_regclass(expected.relation_name) is not null
  ")"
  [[ "$new_relations" == "0" ]] ||
    die "Některé nové tabulky už existují. Může jít o částečné dřívější nasazení; pokračování vyžaduje ruční kontrolu."

  pairing_block_column="$(db_scalar "
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_pairs'
      and column_name = 'pairing_block_id'
  ")"
  [[ "$pairing_block_column" == "0" ]] ||
    die "Sloupec event_pairs.pairing_block_id už existuje; nelze potvrdit čistý předmigrační stav."

  history_count="$(db_scalar "
    select count(*)
    from supabase_migrations.schema_migrations
    where version in ('20260731200000', '20260731201000', '20260731202000')
  ")"
  [[ "$history_count" == "0" ]] ||
    die "Alespoň jedna z cílových migrací už je v produkční historii."
}

inspect_remote() {
  require_command npx
  assert_linked_project
  verify_release_files

  note "Projekt: $EXPECTED_PROJECT_REF"
  note "Kontrola rozdílů v historii migrací (jen pro čtení):"
  run_supabase migration list --linked
  note "Databázový lint (jen pro čtení):"
  run_supabase db lint --linked --level error
  note "Statistiky tabulek (jen pro čtení):"
  run_supabase inspect db table-stats --linked
  note "Kontrola dokončena. Vzdálená databáze nebyla změněna."
}

write_row_counts() {
  local target_file="$1"
  local table count

  printf 'schema\ttable\trow_count\n' > "$target_file"
  for table in "${AFFECTED_PUBLIC_TABLES[@]}"; do
    [[ "$(db_scalar "select to_regclass('public.$table') is not null")" == "t" ]] ||
      die "Předpokládaná produkční tabulka public.$table neexistuje."
    count="$(db_scalar "select count(*) from public.$table")"
    printf 'public\t%s\t%s\n' "$table" "$count" >> "$target_file"
  done
}

write_manifest() {
  local backup_dir="$1"
  shift
  local relative

  : > "$backup_dir/manifest.sha256"
  for relative in "$@"; do
    printf '%s  %s\n' \
      "$(sha256_file "$backup_dir/$relative")" \
      "$relative" >> "$backup_dir/manifest.sha256"
  done
}

create_backup() {
  local backup_root="$DEFAULT_BACKUP_ROOT"
  local timestamp backup_dir backup_root_real index release_copy

  while (( $# > 0 )); do
    case "$1" in
      --backup-root)
        (( $# >= 2 )) || die "Za --backup-root chybí cesta."
        backup_root="$2"
        shift 2
        ;;
      *)
        die "Neznámý argument pro backup: $1"
        ;;
    esac
  done

  [[ "$backup_root" == /* ]] || die "--backup-root musí být absolutní cesta."
  require_command npx
  assert_linked_project
  verify_release_files
  configure_database_connection
  assert_pre_deploy_state

  mkdir -p -m 700 -- "$backup_root"
  backup_root_real="$(cd -- "$backup_root" && pwd -P)"
  case "$backup_root_real/" in
    "$REPO_ROOT/"*) die "Záloha nesmí být uvnitř veřejného repozitáře." ;;
  esac

  timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  backup_dir="$backup_root_real/$timestamp"
  mkdir -m 700 -- "$backup_dir"
  mkdir -m 700 -- "$backup_dir/release-sql"

  note "Vytvářím konzistentní privátní zálohu public dat, public/auth schématu a historie migrací."
  pg_dump \
    --format=custom \
    --no-owner \
    --schema=public \
    --schema=auth \
    --schema=supabase_migrations \
    --exclude-table-data='auth.*' \
    --file="$backup_dir/database-before.dump"

  write_row_counts "$backup_dir/affected-row-counts.tsv"
  run_supabase migration list --linked > "$backup_dir/migration-list-before.txt"
  run_supabase db lint --linked --level error > "$backup_dir/db-lint-before.txt"

  for index in "${!MIGRATION_FILES[@]}"; do
    release_copy="release-sql/$(basename -- "${MIGRATION_FILES[$index]}")"
    cp -- "$REPO_ROOT/${MIGRATION_FILES[$index]}" "$backup_dir/$release_copy"
  done

  {
    printf 'project_ref=%s\n' "$EXPECTED_PROJECT_REF"
    printf 'created_at_utc=%s\n' "$timestamp"
    printf 'created_at_epoch=%s\n' "$(date -u '+%s')"
    printf 'pg_host=%s\n' "$PGHOST"
    printf 'pg_database=%s\n' "$PGDATABASE"
    printf 'supabase_cli_version=%s\n' "$SUPABASE_CLI_VERSION"
  } > "$backup_dir/backup.meta"

  write_manifest "$backup_dir" \
    "database-before.dump" \
    "affected-row-counts.tsv" \
    "migration-list-before.txt" \
    "db-lint-before.txt" \
    "backup.meta" \
    "release-sql/$(basename -- "${MIGRATION_FILES[0]}")" \
    "release-sql/$(basename -- "${MIGRATION_FILES[1]}")" \
    "release-sql/$(basename -- "${MIGRATION_FILES[2]}")"

  note "Záloha je hotová: $backup_dir"
  note "Produkční databáze nebyla změněna. Pro nasazení použijte:"
  note "  scripts/production-db-release.sh apply --apply --backup-dir $backup_dir"
}

metadata_value() {
  local metadata_file="$1"
  local key="$2"
  awk -F= -v wanted="$key" '$1 == wanted { sub(/^[^=]*=/, ""); print; exit }' "$metadata_file"
}

verify_backup() {
  local backup_dir="$1"
  local backup_real metadata_file project_ref created_epoch now age expected relative actual

  [[ "$backup_dir" == /* ]] || die "--backup-dir musí být absolutní cesta."
  [[ -d "$backup_dir" ]] || die "Adresář zálohy neexistuje: $backup_dir"
  backup_real="$(cd -- "$backup_dir" && pwd -P)"
  case "$backup_real/" in
    "$REPO_ROOT/"*) die "Záloha nesmí být uvnitř veřejného repozitáře." ;;
  esac

  metadata_file="$backup_real/backup.meta"
  [[ -f "$metadata_file" ]] || die "Záloha nemá backup.meta."
  [[ -f "$backup_real/manifest.sha256" ]] || die "Záloha nemá manifest.sha256."

  project_ref="$(metadata_value "$metadata_file" project_ref)"
  [[ "$project_ref" == "$EXPECTED_PROJECT_REF" ]] || die "Záloha patří jinému projektu."

  created_epoch="$(metadata_value "$metadata_file" created_at_epoch)"
  [[ "$created_epoch" =~ ^[0-9]+$ ]] || die "Záloha nemá platný čas vytvoření."
  now="$(date -u '+%s')"
  age=$((now - created_epoch))
  (( age >= -300 )) || die "Čas zálohy je neplatně v budoucnosti."
  (( age <= MAX_BACKUP_AGE_SECONDS )) || die "Záloha je starší než 24 hodin; vytvořte novou."

  while read -r expected relative; do
    [[ -n "$expected" && -n "$relative" ]] || die "Neplatný řádek v manifestu zálohy."
    [[ -f "$backup_real/$relative" ]] || die "V záloze chybí $relative."
    actual="$(sha256_file "$backup_real/$relative")"
    [[ "$actual" == "$expected" ]] || die "Kontrolní součet nesouhlasí: $relative"
  done < "$backup_real/manifest.sha256"

  printf '%s\n' "$backup_real"
}

run_read_only_smoke_tests() {
  local test_file result

  require_command jq
  for test_file in \
    "$REPO_ROOT/supabase/tests/database_smoke_test.sql" \
    "$REPO_ROOT/supabase/tests/member_accounts_and_programs_smoke_test.sql"
  do
    result="$(psql -X -q -t -A -v ON_ERROR_STOP=1 -f "$test_file")"
    printf '%s' "$result" | jq -e 'type == "object" and all(.[]; . == 0)' >/dev/null ||
      die "Databázový smoke test selhal: $test_file"
  done
}

apply_release() {
  local armed="false"
  local backup_dir=""
  local backup_real typed_ref history_count

  while (( $# > 0 )); do
    case "$1" in
      --apply)
        armed="true"
        shift
        ;;
      --backup-dir)
        (( $# >= 2 )) || die "Za --backup-dir chybí cesta."
        backup_dir="$2"
        shift 2
        ;;
      *)
        die "Neznámý argument pro apply: $1"
        ;;
    esac
  done

  [[ "$armed" == "true" ]] || die "Produkční změna vyžaduje explicitní příznak --apply."
  [[ -n "$backup_dir" ]] || die "Produkční změna vyžaduje --backup-dir s čerstvou zálohou."
  [[ -t 0 ]] || die "Produkční nasazení musí běžet interaktivně."

  require_command npx
  assert_linked_project
  verify_release_files
  backup_real="$(verify_backup "$backup_dir")"
  configure_database_connection
  assert_pre_deploy_state

  note "Projekt: $EXPECTED_PROJECT_REF"
  note "Ověřená záloha: $backup_real"
  IFS= read -r -p "Pro potvrzení produkční změny opište project ref $EXPECTED_PROJECT_REF: " typed_ref
  [[ "$typed_ref" == "$EXPECTED_PROJECT_REF" ]] || die "Project ref nesouhlasí; nasazení zrušeno."

  note "Aplikuji přesně tři ověřené migrace v jedné databázové transakci."
  psql \
    -X \
    -v ON_ERROR_STOP=1 \
    --single-transaction \
    -c "set lock_timeout = '15s'; set statement_timeout = '10min'; select pg_advisory_xact_lock(hashtextextended('nsp-akce-production-db-release', 0));" \
    -f "$REPO_ROOT/${MIGRATION_FILES[0]}" \
    -f "$REPO_ROOT/${MIGRATION_FILES[1]}" \
    -f "$REPO_ROOT/${MIGRATION_FILES[2]}"

  note "SQL bylo úspěšně potvrzeno. Zapisuji pouze tři nové verze do historie Supabase migrací."
  if ! SUPABASE_DB_PASSWORD="$PGPASSWORD" run_supabase migration repair \
    --linked \
    --status applied \
    "${MIGRATION_VERSIONS[@]}" \
    --yes
  then
    note "Schéma už je nasazené, ale zápis historie migrací selhal. SQL znovu nespouštějte."
    note "Po opravě přístupu spusťte pouze migration repair pro verze: ${MIGRATION_VERSIONS[*]}"
    return 2
  fi

  history_count="$(db_scalar "
    select count(*)
    from supabase_migrations.schema_migrations
    where version in ('20260731200000', '20260731201000', '20260731202000')
  ")"
  [[ "$history_count" == "3" ]] ||
    die "Schéma je nasazené, ale historie neobsahuje všechny tři verze. SQL znovu nespouštějte; opravte jen historii migrací."

  run_read_only_smoke_tests
  note "Databázové nasazení a read-only produkční smoke testy proběhly úspěšně."
  note "Původní vzdálená historie zůstává divergentní; nepoužívejte obecný supabase db push."
}

main() {
  local command_name="${1:-inspect}"
  if (( $# > 0 )); then
    shift
  fi

  case "$command_name" in
    inspect)
      (( $# == 0 )) || die "inspect nepřijímá další argumenty."
      inspect_remote
      ;;
    backup)
      create_backup "$@"
      ;;
    apply)
      apply_release "$@"
      ;;
    help|--help|-h)
      usage
      ;;
    *)
      usage >&2
      die "Neznámý příkaz: $command_name"
      ;;
  esac
}

main "$@"
