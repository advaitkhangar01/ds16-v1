#!/bin/bash
# deploy.sh — Run this on the VPS after: git pull origin main
# Hostinger Ubuntu 24.04 · PM2 · DS16 robustness fix deployment
# Usage:  bash deploy.sh
# ─────────────────────────────────────────────────────────────

set -e  # exit immediately on any error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " DS16 — Robustness Fix Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Install new dependency (express-rate-limit)
echo "→ Installing npm dependencies..."
cd server
npm install --omit=dev
echo "✓ Dependencies installed"

# 2. Syntax-check all modified route files
echo "→ Syntax-checking server files..."
node --check index.js
node --check routes/attendance.js
node --check routes/projects.js
node --check routes/invoices.js
node --check routes/finances.js
node --check routes/clients.js
node --check routes/leaves.js
node --check routes/monthlyClose.js
node --check routes/vendors.js
node --check routes/accounting.js
node --check routes/settings.js
echo "✓ All files syntax-OK"

cd ..

# 3. Graceful reload via PM2 (zero downtime — old workers finish in-flight requests)
echo "→ Reloading PM2 processes..."
pm2 reload all --update-env
echo "✓ PM2 reloaded"

# 4. Confirm status
echo ""
pm2 list
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Deployment complete! Check logs with:"
echo "   pm2 logs --lines 50"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
