#!/usr/bin/env bash
set -euo pipefail

# Supastore Disaster Recovery Backup Script
# Usage: ./scripts/backup.sh [output_dir]

BACKUP_DIR="${1:-./backups/$(date +%Y%m%d_%H%M%S)}"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/supastore}"

echo "=== Supastore Backup ==="
echo "Target Directory: ${BACKUP_DIR}"

mkdir -p "${BACKUP_DIR}"

echo "Dumping PostgreSQL database..."
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump "${DATABASE_URL}" --clean --if-exists --no-owner --no-privileges -F c -f "${BACKUP_DIR}/database.dump"
  pg_dump "${DATABASE_URL}" --clean --if-exists --no-owner --no-privileges -F p -f "${BACKUP_DIR}/database.sql"
  echo "✅ Database dump completed: ${BACKUP_DIR}/database.dump"
else
  echo "⚠️  pg_dump not found in PATH. Make sure PostgreSQL client tools are installed."
fi

# Export metadata
cat <<EOF > "${BACKUP_DIR}/backup-manifest.json"
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "database": "supastore",
  "version": "0.1.0"
}
EOF

echo "✅ Backup completed successfully in ${BACKUP_DIR}"
