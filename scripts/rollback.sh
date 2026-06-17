#!/bin/bash
# scripts/rollback.sh
# Rollback DS16 CRM to previous version

echo "⚠️ ROLLING BACK..."

cd /var/www/ds16

# 1. Revert Git to previous commit
echo "==> Reverting Git..."
git reset --hard HEAD@{1}

# 2. Re-install production deps
echo "==> Re-installing deps..."
cd server && npm ci --omit=dev
cd ../client && npm ci && npm run build

# 3. Reload PM2 (Zero-downtime)
echo "==> Reloading PM2..."
cd ..
if pm2 list | grep -q "ds16-final"; then
  pm2 reload ds16-final
else
  pm2 reload ds16-api
fi

echo "✅ Rollback complete. Check status with: pm2 status"
