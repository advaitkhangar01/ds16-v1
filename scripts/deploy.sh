#!/bin/bash
# scripts/deploy.sh
# DS16 VPS Deploy Script
set -e

echo "🚀 DS16 Deploy Starting..."
# Use current directory as project root
PROJECT_ROOT="$(pwd)"
cd "$PROJECT_ROOT"

# 1. Backup Database
echo "==> Backing up database before deploy..."
chmod +x scripts/backup_db.sh
./scripts/backup_db.sh

# 2. Pull latest code
echo "==> Pulling latest code from main..."
git pull origin main

# 3. Run database migrations
echo "==> Running database migrations..."
# This assumes the user running deploy has psql access to the db
# or we can use the environment variables from .env
if [ -f server/.env ]; then
  export $(grep -v '^#' server/.env | xargs)
  # Try running with psql, fallback to sudo if needed
  psql -d ds16 -f server/db/schema.sql || sudo -u postgres psql -d ds16 -f server/db/schema.sql
else
  sudo -u postgres psql -d ds16 -f server/db/schema.sql
fi

# 4. Install backend dependencies
echo "==> Installing backend dependencies..."
cd server
npm ci --omit=dev

# 4. Build frontend
echo "==> Building frontend..."
cd ../client
# Use install --include=dev to ensure vite plugins are available for build
npm install --include=dev
npm run build

# 5. Reload server via PM2 (Zero-downtime)
echo "==> Reloading PM2 process..."
cd ..
if pm2 list | grep -q "ds16-final"; then
  pm2 reload ds16-final --update-env
else
  pm2 reload ds16-api --update-env
fi
pm2 save

echo "✅ Deploy complete at $(date)"
