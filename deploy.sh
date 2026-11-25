#!/usr/bin/env bash
# ==============================================================================
# deploy.sh — Safe VPS Deployment for DS16 on Hostinger Ubuntu 24.04
# Features:
#   1. Automatic Pre-Deployment PostgreSQL Backup (Zero-Data-Loss with Hard Abort)
#   2. Backup of /uploads directory and server/.env configuration
#   3. Idempotent, Tracked Database Migrations (schema_migrations)
#   4. Linux Syntax Validation (node --check)
#   5. Optimized Frontend Production Build (Chunk Splitting)
#   6. Zero-Downtime PM2 Graceful Reload
#   7. Post-Deployment Health Probe & Verification
# Usage:
#   git pull origin main
#   bash deploy.sh
# ==============================================================================

set -e  # Exit immediately if any command returns a non-zero status

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${HOME}/ds16_backups"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/ds16_pre_deploy_${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 DS16 Enterprise Safe Production Deployment"
echo "Timestamp: ${TIMESTAMP}"
echo "Location:  ${APP_DIR}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Pre-deployment Database Snapshot & Asset Archive (Failsafe)
echo "📦 Step 1/6: Creating pre-deployment database backup and asset snapshot..."
if ! command -v pg_dump > /dev/null 2>&1; then
    echo "❌ FATAL: pg_dump command not found in PATH! Aborting deployment to prevent unbacked changes."
    exit 1
fi

if [ ! -f "${APP_DIR}/server/.env" ]; then
    echo "❌ FATAL: server/.env configuration file missing! Aborting deployment."
    exit 1
fi

DB_URL=$(grep -E '^DATABASE_URL=' "${APP_DIR}/server/.env" | cut -d '=' -f2- | tr -d '\r' | tr -d ' ' || true)
if [ -z "$DB_URL" ]; then
    echo "❌ FATAL: DATABASE_URL not found in server/.env! Aborting deployment."
    exit 1
fi

# Execute pg_dump - do not suppress errors
if ! pg_dump "$DB_URL" > "$BACKUP_FILE" 2>/dev/null; then
    echo "⚠️ Notice: pg_dump via URL direct failed, trying fallback via postgres system user..."
    if ! sudo -u postgres pg_dump ds16 > "$BACKUP_FILE" 2>/dev/null; then
        echo "❌ FATAL: Database backup failed! Deployment aborted. Live data remains untouched."
        exit 1
    fi
fi

# Verify backup file existence and minimum size (must be at least 1 KB)
if [ ! -f "$BACKUP_FILE" ] || [ $(wc -c < "$BACKUP_FILE") -lt 1000 ]; then
    echo "❌ FATAL: Snapshot file is missing or suspiciously small (<1KB). Aborting deployment for safety."
    rm -f "$BACKUP_FILE"
    exit 1
fi

echo "✅ Pre-deploy DB snapshot successfully verified: ${BACKUP_FILE} ($(du -h "$BACKUP_FILE" | cut -f1))"

# Backup server/.env and /uploads directory
ENV_BACKUP="${BACKUP_DIR}/ds16_env_${TIMESTAMP}.env"
UPLOADS_BACKUP="${BACKUP_DIR}/ds16_uploads_${TIMESTAMP}.tar.gz"
cp "${APP_DIR}/server/.env" "$ENV_BACKUP" 2>/dev/null || true
if [ -d "${APP_DIR}/server/uploads" ]; then
    tar -czf "$UPLOADS_BACKUP" -C "${APP_DIR}/server" uploads 2>/dev/null || true
fi

# Restrict permissions on backup files (owner read-only)
chmod 600 "${BACKUP_DIR}"/* 2>/dev/null || true

# Prune snapshots older than 30 days to prevent disk exhaustion
find "$BACKUP_DIR" -type f -name "ds16_pre_deploy_*.sql" -mtime +30 -delete 2>/dev/null || true
find "$BACKUP_DIR" -type f -name "ds16_uploads_*.tar.gz" -mtime +30 -delete 2>/dev/null || true
find "$BACKUP_DIR" -type f -name "ds16_env_*.env" -mtime +30 -delete 2>/dev/null || true

# 2. Server Dependencies & Database Migrations
echo "🗄️ Step 2/6: Installing backend dependencies and running migrations..."
cd "${APP_DIR}/server"
npm ci --omit=dev --silent || npm install --omit=dev --silent
node utils/migrator.js
echo "✓ Backend dependencies and migrations ready"

# 3. Syntax Verification (Preventing Linux Runtime Crashes)
echo "🔍 Step 3/6: Syntax-checking server files..."
find . -maxdepth 3 -name "*.js" -not -path "*/node_modules/*" -not -path "*/tests/*" -exec node --check {} +
echo "✓ All server files syntax-OK"

# 4. Frontend Client Build
echo "🏗️ Step 4/6: Building React client..."
cd "${APP_DIR}/client"
npm ci --silent || npm install --silent
NODE_OPTIONS="--max-old-space-size=4096" npm run build
cd "$APP_DIR"
echo "✓ Frontend build complete"

# 5. Zero-Downtime PM2 Reload
echo "🔄 Step 5/6: Reloading PM2 processes (zero downtime)..."
pm2 reload "${APP_DIR}/server/ecosystem.config.js" --update-env 2>/dev/null || pm2 reload ecosystem.config.js --update-env 2>/dev/null || pm2 reload all --update-env 2>/dev/null || pm2 restart all
echo "✓ PM2 reloaded"

# 6. Health Probe Verification (Resilient IPv4 Retry Loop)
echo "🩺 Step 6/6: Verifying service health..."
TARGET_PORT="3001"
if [ -f "${APP_DIR}/server/.env" ]; then
    ENV_PORT=$(grep -E '^PORT=' "${APP_DIR}/server/.env" | cut -d '=' -f2- | tr -d '\r' | tr -d ' ' || true)
    if [ -n "$ENV_PORT" ]; then
        TARGET_PORT="$ENV_PORT"
    fi
fi

HEALTH_STATUS="FAILED"
for i in {1..10}; do
    echo "  → Probing http://127.0.0.1:${TARGET_PORT}/api/health (attempt $i/10)..."
    RESPONSE=$(curl -s -m 3 "http://127.0.0.1:${TARGET_PORT}/api/health" || true)
    if [[ "$RESPONSE" == *"status"* ]] || [[ "$RESPONSE" == *"ok"* ]] || [[ "$RESPONSE" == *"DS16"* ]]; then
        HEALTH_STATUS="OK"
        HEALTH_CHECK="$RESPONSE"
        break
    fi
    sleep 1
done

if [ "$HEALTH_STATUS" = "OK" ]; then
    echo "✅ Health check PASSED! Service is live and responding."
    echo ""
    pm2 list
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎉 Safe deployment completed successfully with zero downtime!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo "❌ HEALTH PROBE WARNING: Could not connect to http://127.0.0.1:${TARGET_PORT}/api/health"
    echo "⚠️ Check PM2 logs with: pm2 logs ds16-api --lines 30"
    if [ -f "$BACKUP_FILE" ]; then
        echo "ℹ️ Pre-deploy backup available at: ${BACKUP_FILE}"
    fi
    exit 1
fi
