#!/usr/bin/env bash
set -Eeuo pipefail

: "${PGHOST:?Set PGHOST to a local PostgreSQL test server}"
: "${PGUSER:?Set PGUSER to a local PostgreSQL test user}"
: "${PGPASSWORD:?Set PGPASSWORD to the test account password}"
PGPORT="${PGPORT:-5432}"
export PGHOST PGPORT PGUSER PGPASSWORD

case "$PGHOST" in
  localhost|127.0.0.1|::1) ;;
  *)
    echo "Refusing to run the restore drill against non-local host: $PGHOST" >&2
    exit 2
    ;;
esac

for command in createdb dropdb pg_dump pg_restore psql; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required PostgreSQL command not found: $command" >&2
    exit 127
  fi
done

suffix="$(date +%s)_$$"
source_db="traqora_restore_source_${suffix}"
restored_db="traqora_restore_target_${suffix}"
work_dir="$(mktemp -d)"

psql_local() {
  psql --no-psqlrc --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$@"
}

cleanup() {
  dropdb --if-exists --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$source_db" >/dev/null 2>&1 || true
  dropdb --if-exists --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$restored_db" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$source_db"
createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$restored_db"

psql_local --dbname="$source_db" --set=ON_ERROR_STOP=1 \
  --file="$(dirname "$0")/../tests/fixtures/postgres-restore.sql"
pg_dump --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" \
  --format=custom --file="$work_dir/backup.dump" "$source_db"
pg_restore --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" \
  --exit-on-error --no-owner --no-privileges --dbname="$restored_db" "$work_dir/backup.dump"

verification_query="SELECT (SELECT count(*) FROM restore_users), (SELECT count(*) FROM restore_flights), count(*) FROM restore_bookings b JOIN restore_users u ON u.id = b.user_id JOIN restore_flights f ON f.id = b.flight_id"
restored_counts=$(
  psql_local --dbname="$restored_db" --tuples-only --no-align \
    --command="$verification_query"
)
if [[ "$restored_counts" != "2|2|2" ]]; then
  echo "Restore verification failed: expected 2 users, 2 flights, and 2 related bookings; got $restored_counts" >&2
  exit 1
fi

echo "PostgreSQL backup/restore verification passed: $restored_counts"
