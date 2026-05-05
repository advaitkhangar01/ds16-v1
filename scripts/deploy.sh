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
./scripts/backup_db.sh

# 2. Pull latest code
echo "==> Pulling latest code from main..."
git pull origin main

# 3. Install backend dependencies
echo "==> Installing backend dependencies..."
cd server
npm ci --omit=dev

# 4. Build frontend
echo "==> Building frontend..."
cd ../client
npm ci
npm run build

# 5. Reload server via PM2 (Zero-downtime)
echo "==> Reloading PM2 process..."
cd ..
pm2 reload ds16-api --update-env
pm2 save

echo "✅ Deploy complete at $(date)"
