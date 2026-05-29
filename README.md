# GasTubos — Sistema de Gestión de Tubos Industriales

Sistema web para gestionar tubos de gases industriales (CO₂, Oxígeno, Argón, Nitrógeno, Acetileno y mezclas especiales). Incluye gestión de tubos propios y de clientes, QR por tubo, historial de movimientos, entregas, devoluciones, alquileres y ventas.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js 20 + Express + Prisma ORM |
| Base de datos | PostgreSQL 16 |
| Frontend | React 18 + Vite + React Router 6 |
| Auth | JWT (8h) + bcrypt |
| QR | `qrcode` (servidor) + `html5-qrcode` (escaneo en celular) |

---

## Estructura del proyecto

```
gastubos/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          ← Esquema de BD completo
│   ├── src/
│   │   ├── index.js               ← Entry point Express
│   │   ├── middleware/
│   │   │   └── auth.js            ← JWT guard + roles
│   │   ├── routes/
│   │   │   ├── auth.js            ← login, /me
│   │   │   ├── tubos.js           ← CRUD + cambio estado + QR
│   │   │   ├── clientes.js
│   │   │   ├── entregas.js        ← flujo completo con transacción
│   │   │   ├── devoluciones.js
│   │   │   ├── alquileres.js
│   │   │   ├── ventas.js
│   │   │   ├── auditoria.js
│   │   │   ├── usuarios.js
│   │   │   ├── reportes.js        ← dashboard + reportes
│   │   │   └── public.js          ← sin auth, para QR
│   │   └── utils/
│   │       ├── prisma.js          ← cliente singleton
│   │       ├── helpers.js         ← generador de IDs/números
│   │       ├── auditoria.js       ← helper para registrar auditoría
│   │       ├── estadosTubo.js     ← reglas de transición de estados
│   │       └── seed.js            ← datos iniciales
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                ← Router + rutas protegidas
│   │   ├── services/api.js        ← axios + interceptors
│   │   ├── store/authStore.js     ← Zustand auth
│   │   └── pages/
│   │       ├── TuboPublicoPage.jsx ← página pública del QR
│   │       └── ... (resto de páginas)
│   └── package.json
│
└── docker-compose.yml
```

---

## Setup rápido (desarrollo)

### 1. Requisitos
- Node.js 20+
- Docker + Docker Compose (para PostgreSQL)
- Git

### 2. Clonar y configurar

```bash
git clone https://github.com/tu-usuario/gastubos.git
cd gastubos

# Levantar PostgreSQL con Docker
docker-compose up -d postgres
```

### 3. Backend

```bash
cd backend
cp .env.example .env
# Editar .env con tu JWT_SECRET

npm install
npm run db:migrate    # Crea las tablas en PostgreSQL
npm run db:seed       # Carga datos iniciales
npm run dev           # Servidor en http://localhost:3001
```

**Usuarios de prueba:**
- `admin` / `admin1234` — Administrador
- `operador1` / `operador123` — Operador

### 4. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev           # App en http://localhost:5173
```

---

## API — Referencia rápida

| Método | Endpoint | Descripción | Rol mínimo |
|--------|---------|-------------|-----------|
| POST | `/api/auth/login` | Login | — |
| GET | `/api/auth/me` | Usuario autenticado | cualquiera |
| GET | `/tubos/:id` | Info pública del tubo (QR) | sin auth |
| GET | `/api/tubos` | Listar tubos (filtros) | cualquiera |
| POST | `/api/tubos` | Crear tubo | OPERADOR |
| PATCH | `/api/tubos/:id` | Editar tubo | OPERADOR |
| POST | `/api/tubos/:id/cambiar-estado` | Cambiar estado | cualquiera |
| GET | `/api/tubos/:id/qr` | Obtener QR en base64 | cualquiera |
| GET | `/api/clientes` | Listar clientes | cualquiera |
| POST | `/api/clientes` | Crear cliente | OPERADOR |
| POST | `/api/entregas` | Registrar entrega | OPERADOR |
| POST | `/api/devoluciones` | Registrar devolución | OPERADOR |
| GET | `/api/alquileres/vencidos` | Alertas de vencidos | cualquiera |
| GET | `/api/reportes/dashboard` | Indicadores del dashboard | cualquiera |
| GET | `/api/auditoria` | Historial de auditoría | cualquiera |
| GET | `/api/usuarios` | Listar usuarios | ADMIN |
| POST | `/api/usuarios` | Crear usuario | ADMIN |

---

## Reglas de transición de estados

```
DISPONIBLE  → CARGADO, RESERVADO, EN_REVISION, VENDIDO
CARGADO     → DISPONIBLE, ENTREGADO, ALQUILADO, RESERVADO, EN_REVISION
VACIO       → EN_REVISION, CARGADO
ENTREGADO   → DEVUELTO, EN_REVISION, PERDIDO
ALQUILADO   → DEVUELTO, EN_REVISION, PERDIDO
VENDIDO     → (estado final, sin salida)
RESERVADO   → DISPONIBLE, CARGADO, ENTREGADO, ALQUILADO
PERDIDO     → EN_REVISION
DEVUELTO    → DISPONIBLE, VACIO, EN_REVISION, CARGADO
EN_REVISION → DISPONIBLE, VACIO, CARGADO
```

---

## Deploy en producción (Railway o Render)

1. Crear proyecto PostgreSQL en Railway
2. Deploy del backend como servicio Node.js — configurar variables de entorno
3. Deploy del frontend como sitio estático (Vercel o Netlify) o mismo Railway
4. Configurar `FRONTEND_URL` en el backend con el dominio real
5. Ejecutar `npm run db:migrate` en producción (Railway lo puede hacer automático)

---

## Próximas versiones

- [ ] PWA / instalable en Android (manifest + service worker)
- [ ] Escaneo QR nativo desde la app (sin browser extra)
- [ ] Comprobantes PDF de entrega
- [ ] Cron job automático para marcar alquileres vencidos
- [ ] Notificaciones (email/WhatsApp) por vencimiento
- [ ] Facturación y formas de pago
