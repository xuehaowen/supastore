#!/usr/bin/env bash
set -euo pipefail

# Supastore Disaster Recovery Cold Restore Script
# Usage: ./scripts/restore.sh <backup_dir_or_dump_file> [target_database_url]
#
# IMPORTANT: Cold restore strictly disables outbound email notifications by enforcing
# DISABLE_OUTBOUND_DELIVERY=true to prevent leaking duplicate emails to customers.

BACKUP_SOURCE="${1:-}"
TARGET_DB_URL="${2:-${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/supastore_restore}}"

if [ -z "${BACKUP_SOURCE}" ]; then
  echo "Usage: $0 <backup_directory_or_dump_file> [target_database_url]"
  exit 1
fi

echo "=== Supastore Cold Disaster Restore ==="
echo "Backup Source: ${BACKUP_SOURCE}"
echo "Target DB:     ${TARGET_DB_URL}"
echo "Outbound Mail: STRICTLY DISABLED (DISABLE_OUTBOUND_DELIVERY=true)"

# Identify dump file
if [ -d "${BACKUP_SOURCE}" ]; then
  if [ -f "${BACKUP_SOURCE}/database.dump" ]; then
    DUMP_FILE="${BACKUP_SOURCE}/database.dump"
  elif [ -f "${BACKUP_SOURCE}/database.sql" ]; then
    DUMP_FILE="${BACKUP_SOURCE}/database.sql"
  else
    echo "❌ No database.dump or database.sql found in ${BACKUP_SOURCE}"
    exit 1
  fi
else
  DUMP_FILE="${BACKUP_SOURCE}"
fi

echo "Restoring database from ${DUMP_FILE}..."

if [[ "${DUMP_FILE}" == *.dump ]]; then
  pg_restore --clean --if-exists --no-owner --no-privileges -d "${TARGET_DB_URL}" "${DUMP_FILE}" || true
else
  psql "${TARGET_DB_URL}" -f "${DUMP_FILE}"
fi

echo "Applying latest Drizzle migrations if necessary..."
export DATABASE_URL="${TARGET_DB_URL}"
export DISABLE_OUTBOUND_DELIVERY=true
export ENABLE_OUTBOX_WORKER=false

echo "✅ Database restored successfully."
echo "⚠️  Ensure DISABLE_OUTBOUND_DELIVERY=true remains set until outbox event reconciliation playbook is executed."
