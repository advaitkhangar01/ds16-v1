#!/bin/bash
# scripts/backup_db.sh
# Automated DB Backup for DS16 CRM

BACKUP_DIR="/var/www/ds16/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/ds16_prod_$TIMESTAMP.sql"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "📦 Starting database backup..."

# Use DATABASE_URL from .env if available, or pass as arg
if [ -z "$DATABASE_URL" ]; then
  source /var/www/ds16/server/.env.production
fi

pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Backup saved: $BACKUP_FILE"
  # Keep only last 10 backups to save space
  ls -t $BACKUP_DIR/*.sql | tail -n +11 | xargs rm -f
else
  echo "❌ Backup FAILED!"
  exit 1
fi
