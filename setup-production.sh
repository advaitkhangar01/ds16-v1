#!/bin/bash
# Production Setup Script for DS16
# This script builds the application for production without wiping core data.

echo "🚀 STARTING PRODUCTION SETUP 🚀"

# 1. Install Server Dependencies
echo "==> 1. Installing Server Dependencies..."
cd server
npm install --production
# We DO NOT run reset-db.js here to avoid accidental data loss.
# If you need to seed initial data, run 'node db/seed.js' manually.
cd ..

# 2. Build Frontend
echo "==> 2. Building Frontend for Production..."
cd client
npm install
npm run build
cd ..

echo "✅ DONE! Core data (projects, clients, vendors, users) has been RETAINED."
echo "Ensure your .env files have production values and start the node server via PM2."
echo "For PM2 setup, run:"
echo "cd server && pm2 start index.js --name ds16-backend && pm2 save && pm2 startup"
