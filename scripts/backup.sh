#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-./backups/$(date +%Y%m%d_%H%M%S)}"
: "${DATABASE_URL:?Set DATABASE_URL explicitly for the database being backed up}"
for tool in pg_dump pg_restore sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Required backup tool unavailable: $tool" >&2; exit 1; }
done
mkdir -p "${BACKUP_DIR}"
if [ -n "$(find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "Backup directory must be empty; existing backups are never overwritten." >&2
  exit 1
fi
trap 'rm -f -- "${BACKUP_DIR}/database.dump.partial" "${BACKUP_DIR}/database.sql.partial"' EXIT
echo "Dumping PostgreSQL database..."
pg_dump "${DATABASE_URL}" --clean --if-exists --no-owner --no-privileges -F c -f "${BACKUP_DIR}/database.dump.partial"
pg_dump "${DATABASE_URL}" --clean --if-exists --no-owner --no-privileges -F p -f "${BACKUP_DIR}/database.sql.partial"
test -s "${BACKUP_DIR}/database.dump.partial"
test -s "${BACKUP_DIR}/database.sql.partial"
pg_restore --list "${BACKUP_DIR}/database.dump.partial" >/dev/null
mv "${BACKUP_DIR}/database.dump.partial" "${BACKUP_DIR}/database.dump"
mv "${BACKUP_DIR}/database.sql.partial" "${BACKUP_DIR}/database.sql"
(cd "${BACKUP_DIR}" && sha256sum database.dump database.sql > SHA256SUMS)
cat > "${BACKUP_DIR}/backup-manifest.json" <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","format":"postgresql","verified":true,"integrity":"SHA256SUMS","assets":"separate-backup-required"}
EOF
echo "Database backup verified in ${BACKUP_DIR}. Object storage requires its own verified backup."
