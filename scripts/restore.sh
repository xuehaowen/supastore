#!/usr/bin/env bash
set -euo pipefail

BACKUP_SOURCE="${1:-}"
TARGET_DB_URL="${2:-${DATABASE_URL:-}}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
test -n "$BACKUP_SOURCE" && test -n "$TARGET_DB_URL" || { echo "Usage: restore.sh <backup_source> <target_database_url>" >&2; exit 1; }
if [ "${RESTORE_COLD_CONFIRMED:-}" != "true" ]; then
  echo "Stop backend, workers, and other target database clients; then set RESTORE_COLD_CONFIRMED=true." >&2
  exit 1
fi
export DATABASE_URL="$TARGET_DB_URL"
export MIGRATION_DATABASE_URL="$TARGET_DB_URL"
export DISABLE_OUTBOUND_DELIVERY=true
export ENABLE_OUTBOX_WORKER=false
for tool in pg_restore psql node; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Required restore tool unavailable: $tool" >&2; exit 1; }
done
if [ -d "$BACKUP_SOURCE" ]; then
  test -f "$BACKUP_SOURCE/SHA256SUMS" || { echo "Backup directory has no verified integrity manifest." >&2; exit 1; }
  (cd "$BACKUP_SOURCE" && sha256sum -c SHA256SUMS)
  DUMP_FILE="$BACKUP_SOURCE/database.dump"
else
  DUMP_FILE="$BACKUP_SOURCE"
fi
test -s "$DUMP_FILE" || { echo "Restore source is missing or empty." >&2; exit 1; }
# A child shell cannot disable an already-running service. Check the actual target.
connections="$(psql "$TARGET_DB_URL" -X -v ON_ERROR_STOP=1 --tuples-only --no-align -c "select count(*) from pg_stat_activity where datname=current_database() and pid <> pg_backend_pid()")"
connections="$(printf '%s' "$connections" | tr -d '[:space:]')"
test "$connections" = "0" || { echo "Cold restore refused: target database still has other sessions." >&2; exit 1; }
echo "Cold restore preflight passed. Application services must remain stopped."
case "$DUMP_FILE" in
  *.dump) pg_restore --list "$DUMP_FILE" >/dev/null
    pg_restore --exit-on-error --single-transaction --clean --if-exists --no-owner --no-privileges -d "$TARGET_DB_URL" "$DUMP_FILE" ;;
  *.sql) psql "$TARGET_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "$DUMP_FILE" ;;
  *) echo "Restore source must be a .dump or .sql file." >&2; exit 1 ;;
esac
echo "Applying migrations with outbound delivery disabled..."
(cd "$SCRIPT_DIR/.." && node scripts/migrate.mjs)
echo "Database restore and migrations completed."
echo "Before restarting any service, configure DISABLE_OUTBOUND_DELIVERY=true and ENABLE_OUTBOX_WORKER=false in its actual deployment environment."
echo "Reconcile the outbox and verify the object-storage restore before re-enabling delivery."
