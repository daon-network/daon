#!/bin/bash
# DAON Database Backup Script
# Runs pg_dump inside the postgres container and stores on the backup volume.
# Keeps the last 30 daily backups; older ones are pruned automatically.

set -euo pipefail

BACKUP_DIR="/mnt/HC_Volume_103960188/backups/postgres"
CONTAINER="daon-postgres"
DB_USER="daon_api"
DB_NAME="daon_production"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/daon_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

# Dump and compress
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl \
  | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: $BACKUP_FILE ($SIZE)"

# Prune old backups
PRUNED=$(find "$BACKUP_DIR" -name "daon_*.sql.gz" -mtime +${RETENTION_DAYS} -print -delete | wc -l)
if [ "$PRUNED" -gt 0 ]; then
  echo "[$(date)] Pruned $PRUNED backup(s) older than ${RETENTION_DAYS} days"
fi

# Verify backup is non-empty
MIN_SIZE=1024
ACTUAL_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null)
if [ "$ACTUAL_SIZE" -lt "$MIN_SIZE" ]; then
  echo "[$(date)] WARNING: Backup file is suspiciously small (${ACTUAL_SIZE} bytes)" >&2
  exit 1
fi

echo "[$(date)] Backup verified OK"
