#!/bin/bash
# update.sh — Actualización del sistema en VPS (después del deploy inicial)
# Ejecutar: bash update.sh

set -e
APP_DIR="/var/www/gastubos"
echo "=== Actualizando GasTubos ==="

cd "$APP_DIR"
git pull

# Backend
cd backend
npm ci --production
npm run db:generate
npm run db:migrate
pm2 restart gastubos-api

# Frontend
cd ../frontend
npm ci
npm run build

echo "✅ Sistema actualizado"
pm2 status
