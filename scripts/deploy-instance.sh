#!/bin/bash
# scripts/deploy-instance.sh — Despliega UNA instancia nueva de GasTubos
# (backend + frontend + DB + PM2) en este VPS multi-ambiente.
#
# No toca Nginx ni SSL: se asume que el bloque de sitio y el certificado ya
# existen para el dominio dado (así se hizo a mano para los 3 ambientes).
# No corre ningún seed de datos de prueba. El primer usuario ADMIN se crea
# aparte, a mano, con: npm run db:create-admin (dentro del backend ya desplegado).
#
# Uso:
#   scripts/deploy-instance.sh <app_dir> <db_name> <db_user> <pm2_name> <port> <domain> [branch] [source_repo]
#
# Ejemplo (Cryopar):
#   scripts/deploy-instance.sh /var/www/gastubos-cryopar gastubos_cryopar \
#     gastubos_cryopar_user gastubos-cryopar-api 3003 app.cryopar.com.py main \
#     /var/www/gastubos-desarrollo

set -euo pipefail

if [ "$#" -lt 6 ]; then
  echo "Uso: $0 <app_dir> <db_name> <db_user> <pm2_name> <port> <domain> [branch] [source_repo]" >&2
  exit 1
fi

APP_DIR="$1"
DB_NAME="$2"
DB_USER="$3"
PM2_NAME="$4"
PORT="$5"
DOMAIN="$6"
BRANCH="${7:-main}"
SOURCE_REPO="${8:-/var/www/gastubos-desarrollo}"

echo "=== Desplegando instancia GasTubos ==="
echo "  Directorio : $APP_DIR"
echo "  Base datos : $DB_NAME (owner: $DB_USER)"
echo "  PM2        : $PM2_NAME  (puerto $PORT)"
echo "  Dominio    : https://$DOMAIN"
echo "  Rama       : $BRANCH  (fuente: $SOURCE_REPO)"
echo

# ── 0. Chequeos de seguridad: no pisar nada existente ──────────────────────────
if [ -e "$APP_DIR" ]; then
  echo "❌ $APP_DIR ya existe. Este script es solo para el primer despliegue de una instancia nueva." >&2
  exit 1
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  echo "❌ El rol de Postgres '${DB_USER}' ya existe. Abortando para no pisarlo." >&2
  exit 1
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  echo "❌ La base de datos '${DB_NAME}' ya existe. Abortando para no pisarla." >&2
  exit 1
fi

if [ ! -f "/etc/nginx/sites-enabled/${DOMAIN}" ]; then
  echo "⚠️  No encontré /etc/nginx/sites-enabled/${DOMAIN}. Este script no crea el bloque de Nginx ni el SSL —"
  echo "    confirmá que ya están configurados antes de seguir (Ctrl+C para cancelar, Enter para continuar)."
  read -r
fi

# ── 1. Base de datos ────────────────────────────────────────────────────────────
PG_PASSWORD=$(openssl rand -hex 24)
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${PG_PASSWORD}';"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
echo "✅ Base de datos y rol creados"

# ── 2. Clonar código ────────────────────────────────────────────────────────────
git clone "$SOURCE_REPO" "$APP_DIR"
cd "$APP_DIR"
git checkout "$BRANCH"
ORIGIN_URL=$(git -C "$SOURCE_REPO" remote get-url origin)
git remote set-url origin "$ORIGIN_URL"
echo "✅ Código clonado (rama $BRANCH, origin apuntando a $ORIGIN_URL)"

# ── 3. Backend ──────────────────────────────────────────────────────────────────
cd "$APP_DIR/backend"
JWT_SECRET=$(openssl rand -hex 32)

umask 077
cat > .env << EOF
DATABASE_URL="postgresql://${DB_USER}:${PG_PASSWORD}@localhost:5432/${DB_NAME}"
JWT_SECRET="${JWT_SECRET}"
JWT_EXPIRES="8h"
PORT=${PORT}
FRONTEND_URL="https://${DOMAIN}"
EOF
chmod 600 .env

npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy

pm2 start src/index.js --name "$PM2_NAME" --interpreter node
pm2 save
echo "✅ Backend corriendo en PM2 como '$PM2_NAME'"

# ── 4. Frontend ─────────────────────────────────────────────────────────────────
cd "$APP_DIR/frontend"
cat > .env << EOF
VITE_API_URL=https://${DOMAIN}/api
EOF

npm ci
npm run build
echo "✅ Frontend compilado en $APP_DIR/frontend/dist"

# ── 5. Resumen ───────────────────────────────────────────────────────────────────
echo
echo "=== Deploy completo ==="
echo "URL:            https://${DOMAIN}"
echo "PM2:            ${PM2_NAME} (puerto ${PORT})"
echo "Base de datos:  ${DB_NAME} / usuario ${DB_USER}"
echo
echo "⚠️  Guardá estas credenciales ahora, no se repiten ni se guardan en ningún archivo:"
echo "  DB password:  ${PG_PASSWORD}"
echo "  JWT_SECRET:   ${JWT_SECRET}"
echo
echo "Sin usuario ADMIN todavía (no se corrió seed). Crealo con:"
echo "  cd ${APP_DIR}/backend && npm run db:create-admin"
