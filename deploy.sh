#!/bin/bash
# deploy.sh — Script de deploy en VPS Linux (Ubuntu 22.04 / 24.04)
# Ejecutar una sola vez en servidor limpio: bash deploy.sh
# Para actualizaciones: bash update.sh

set -e

echo "=== GasTubos Deploy ==="

# ── 1. Dependencias del sistema ────────────────────────────────────────────────
apt-get update -qq
apt-get install -y curl git nginx certbot python3-certbot-nginx

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# PM2 (process manager)
npm install -g pm2

# PostgreSQL 16
apt-get install -y postgresql-16

echo "✅ Dependencias instaladas"

# ── 2. PostgreSQL: crear usuario y base de datos ───────────────────────────────
PG_PASSWORD=$(openssl rand -hex 20)
sudo -u postgres psql -c "CREATE USER gastubos WITH PASSWORD '${PG_PASSWORD}';" 2>/dev/null || echo "Usuario ya existe"
sudo -u postgres psql -c "CREATE DATABASE gastubos_db OWNER gastubos;" 2>/dev/null        || echo "BD ya existe"
echo "✅ PostgreSQL configurado"

# ── 3. Clonar o actualizar código ──────────────────────────────────────────────
APP_DIR="/var/www/gastubos"
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR" && git pull
else
  git clone https://github.com/TU_USUARIO/gastubos.git "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 4. Backend ────────────────────────────────────────────────────────────────
cd "$APP_DIR/backend"

# Crear .env
cat > .env << EOF
DATABASE_URL="postgresql://gastubos:${PG_PASSWORD}@localhost:5432/gastubos_db"
JWT_SECRET="$(openssl rand -hex 32)"
JWT_EXPIRES="8h"
PORT=3001
FRONTEND_URL="https://TU_DOMINIO.com"
EOF

npm ci --production
npm run db:generate
npm run db:migrate
npm run db:seed

pm2 start src/index.js --name gastubos-api --interpreter node
pm2 save
pm2 startup

echo "✅ Backend iniciado con PM2"

# ── 5. Frontend ───────────────────────────────────────────────────────────────
cd "$APP_DIR/frontend"

cat > .env << EOF
VITE_API_URL=https://TU_DOMINIO.com/api
EOF

npm ci
npm run build

echo "✅ Frontend compilado"

# ── 6. Nginx ──────────────────────────────────────────────────────────────────
cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/gastubos
ln -sf /etc/nginx/sites-available/gastubos /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx

echo "✅ Nginx configurado"

# ── 7. SSL con Let's Encrypt ──────────────────────────────────────────────────
echo ""
echo "Para activar HTTPS, ejecutar:"
echo "  certbot --nginx -d TU_DOMINIO.com -d www.TU_DOMINIO.com"
echo ""
echo "=== Deploy completo! ==="
echo "Admin: admin / admin1234"
echo "Recordá cambiar la contraseña después del primer login."
