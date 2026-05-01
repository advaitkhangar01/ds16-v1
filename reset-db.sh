#!/bin/bash
# Production Reset Script for DS16

echo "🚨 STARTING PRODUCTION RESET 🚨"

# 1. Reset Database & Clean Up Files
echo "==> 1. Resetting Database & Cleaning Uploads..."
cd server
npm install --production
node reset-db.js
cd ..

# 2. Build Frontend
echo "==> 2. Building Frontend for Production..."
cd client
npm install
npm run build
cd ..

echo "🚀 DONE! Ensure your .env files have production values and you start the node server via PM2."
echo "For PM2 setup, run:"
echo "cd server && pm2 start index.js --name ds16-backend && pm2 save && pm2 startup"
