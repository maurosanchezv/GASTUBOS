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

# Leer URL de base de datos desde .env para la copia de seguridad
if [ -f .env ]; then
  DATABASE_URL=$(grep DATABASE_URL .env | cut -d '"' -f 2)
  if [ -n "$DATABASE_URL" ]; then
    mkdir -p "$APP_DIR/backups"
    BACKUP_FILE="$APP_DIR/backups/backup_$(date +%F_%H%M%S).sql"
    echo "💾 Creando copia de seguridad de la base de datos en: $BACKUP_FILE"
    if command -v pg_dump >/dev/null 2>&1; then
      pg_dump -d "$DATABASE_URL" -F c -b -v -f "$BACKUP_FILE" || echo "⚠️ No se pudo realizar el backup completo."
    else
      echo "⚠️ pg_dump no está instalado, omitiendo copia de seguridad..."
    fi
  fi
fi

npm ci --production
npm run db:generate
npm run db:migrate:prod
pm2 restart gastubos-api

# Frontend
cd ../frontend
npm ci
npm run build

echo "✅ Sistema actualizado"
pm2 status
