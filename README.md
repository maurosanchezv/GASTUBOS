# GasTubos — Sistema de Gestión de Tubos Industriales

Sistema web y móvil para gestionar tubos de gases industriales (CO₂, Oxígeno, Argón, Nitrógeno, Acetileno, Aire comprimido y mezclas especiales). Permite el seguimiento de la propiedad del tubo (Propio o de Cliente), estados, ubicación física, historial de auditorías, cargas de gas, entregas, devoluciones, alquileres y ventas.

---

## ⚡ Características Principales

- **Gestión de Tubos:** Control de stock, números de serie, capacidades, ubicación y estados.
- **Códigos QR:** Generación de códigos QR por tubo para escaneo e impresión de etiquetas.
- **Roles de Usuario:** 
  - `ADMIN`: Control total del sistema, precios de gas, gestión de usuarios.
  - `SUPERVISOR`: Monitoreo y reportes administrativos.
  - `OPERADOR`: Carga de datos, registro de tubos, clientes y remisiones.
  - `REPARTIDOR`: Interfaz móvil simplificada para visualización de su hoja de ruta y confirmación de entregas mediante escaneo QR.
- **Logística Integrada:** Registro de entregas (simples, alquileres, ventas), cancelaciones con reversión de estados, control de cargas de gas y devoluciones de tubos vacíos.
- **Exportación:** Generación de reportes y comprobantes de entregas en PDF.
- **Impresión Térmica:** Emisión de comprobantes de remisión con logotipos de la empresa (vía Bluetooth en móvil y desde el historial en computadora para formatos de 58mm y 80mm).
- **Compatibilidad Móvil:** Compilado como aplicación nativa Android mediante Capacitor.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Backend** | Node.js 20 (ESM) + Express + Prisma ORM |
| **Base de datos** | PostgreSQL 16 |
| **Frontend** | React 18 + Vite + React Router 6 + Zustand (Estado) + Axios (API) |
| **Mobile Wrapper**| Capacitor 7/8 (Android Nativo) |
| **Lector QR** | `html5-qrcode` (Cámara web y móvil) |
| **Impresión** | ESC/POS (Móvil) / HTML Print (Computadora) con transmisión fragmentada anti-desbordamiento |
| **Reportes** | `jspdf` + `jspdf-autotable` |
| **Seguridad** | JWT (8h) + BcryptJS + Helmet + Rate Limiters |
| **Proceso (prod/dev servidor)** | PM2 + Nginx (reverse proxy + HTTPS con Let's Encrypt) |

---

## 📂 Estructura del Proyecto

```
gastubos/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          ← Modelos de base de datos PostgreSQL
│   │   └── seed.js                ← Datos iniciales para pruebas
│   ├── src/
│   │   ├── index.js               ← Inicialización de Express y middlewares
│   │   ├── middleware/
│   │   │   └── auth.js            ← Guard de autenticación JWT y roles
│   │   ├── routes/                ← Controladores y endpoints
│   │   │   ├── auth.js            ← Autenticación (Login, Perfil)
│   │   │   ├── tubos.js           ← ABM de Tubos y generación de QR
│   │   │   ├── clientes.js        ← Gestión de clientes
│   │   │   ├── entregas.js        ← Transacciones de remisión (Iniciar, Confirmar, Cancelar)
│   │   │   ├── devoluciones.js    ← Gestión de retornos de cilindros
│   │   │   ├── alquileres.js      ← Control de contratos de alquiler
│   │   │   ├── ventas.js          ← Registro de ventas de tubos
│   │   │   ├── cargas.js          ← Refill/Recargas de gas de los tubos
│   │   │   ├── precios.js         ← Tarifario de gases
│   │   │   ├── auditoria.js       ← Historial de acciones sobre tubos
│   │   │   ├── usuarios.js        ← CRUD de cuentas de usuarios
│   │   │   ├── reportes.js        ← Indicadores clave de rendimiento
│   │   │   └── public.js          ← Endpoint público para landing page de QR
│   │   └── utils/
│   │       ├── prisma.js          ← Cliente Prisma unificado
│   │       ├── helpers.js         ← Contadores atómicos secuenciales
│   │       ├── auditoria.js       ← Registro rápido en historial
│   │       └── estadosTubo.js     ← Máquina de estados y transiciones válidas
│   └── package.json
│
├── frontend/
│   ├── android/                   ← Proyecto nativo Android (Capacitor)
│   ├── src/
│   │   ├── App.jsx                ← Enrutador y guards de sesión
│   │   ├── components/            ← Componentes UI comunes y Layout
│   │   ├── services/api.js        ← Cliente Axios configurado con token y proxy
│   │   ├── store/authStore.js     ← Zustand store para sesión activa
│   │   └── pages/                 ← Páginas del panel web y vistas móviles
│   ├── capacitor.config.json      ← Ajustes de compilación de Capacitor
│   └── package.json
│
├── docs/                          ← Guías y manuales de desarrollo
└── docker-compose.yml             ← Orquestación de PostgreSQL local
```

---

## 🌐 Ambientes desplegados

El proyecto corre en un VPS propio (Hostinger, Ubuntu 24.04), con tres instancias completamente independientes: código, base de datos, variables de entorno, proceso y subdominio propios en cada una. Ninguna afecta a las demás.

| Ambiente | URL | Rama | Puerto backend | Base de datos |
|---|---|---|---|---|
| **Desarrollo** | https://devapp.pms.com.py | `develop` | 3001 | `gastubos_dev` |
| **Producción PMS** | https://app.pms.com.py | `main` | 3002 | `gastubos_prod` |
| **Producción Cryopar** | https://app.cryopar.com.py | `main` (por ahora) | 3003 | `gastubos_cryopar` |

Cada instancia usa PostgreSQL nativo (sin exposición a Internet, solo accesible en `localhost`), PM2 para mantener el backend corriendo como proceso, y Nginx como proxy inverso con certificado SSL propio (Let's Encrypt, renovación automática) sirviendo el build estático del frontend (`npm run build`).

**Acceso al servidor:** por SSH con clave pública (sin contraseña), usuario `deploy`. Para incorporar un nuevo colaborador con acceso al servidor o al repositorio, ver la guía de despliegue interna del equipo.

---

## ⚡ Guía de Inicio Rápido (Desarrollo local)

Para una explicación exhaustiva de las terminales y del flujo en Android, consulta la [Guía de Desarrollo Detallada](file:///home/machine/chobi-gas/GASTUBOS/docs/guia_inicio_rapido_desarrollo.md).

### 1. Iniciar Base de Datos y Backend (WSL2)

> Docker se usa acá únicamente como comodidad para tener PostgreSQL corriendo en tu PC local — **no se usa Docker en ningún ambiente desplegado** (dev/prod/Cryopar corren con PostgreSQL nativo + PM2 en el VPS, sin contenedores).

```bash
# Levantar la base de datos (solo en tu PC local, no aplica al VPS)
docker compose up -d postgres

# Levantar backend
cd backend
cp .env.example .env     # Configura tu DATABASE_URL y JWT_SECRET
npm install
npm run db:migrate       # Aplicar esquema
npm run db:seed          # Inyectar datos de prueba
npm run dev              # Correr backend en http://localhost:3001
```

### 2. Iniciar Frontend (Web)
```bash
cd frontend
cp .env.example .env
npm install
npm run dev              # Correr frontend en http://localhost:5173
```

### 3. Exponer el entorno local para pruebas rápidas (ngrok)

> Este método sigue siendo útil para demos puntuales o para probar cambios de un desarrollador individual antes de subirlos a `develop` — pero **para trabajo de equipo y pruebas del ambiente compartido, usar directamente https://devapp.pms.com.py**, que ya está desplegado y no depende de que nadie tenga ngrok corriendo en su máquina.

```bash
# Exponer el puerto del frontend mediante ngrok
ngrok http 5173
```
Copia la URL pública generada (ej: `https://monument-radio-rearview.ngrok-free.dev`) y configúrala en `frontend/.env.production`:
```env
VITE_API_URL=https://<TU-URL-DE-NGROK-AQUI>.ngrok-free.dev/api
```
Luego, compila y sincroniza con Capacitor para generar el APK nativo:
```bash
cd frontend
npm run build && npx cap sync android
cd android
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ANDROID_HOME=/mnt/c/Users/TavaTeam/AppData/Local/Android/Sdk ./gradlew assembleDebug
```
*El APK de depuración se generará en:* `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

### 4. Generar el APK apuntando a un ambiente desplegado (dev o prod)

Para generar una versión de la app que use el servidor real (en vez de ngrok), el proceso es el mismo pero con la URL fija del ambiente correspondiente:

```env
# frontend/.env — para apuntar a desarrollo
VITE_API_URL=https://devapp.pms.com.py/api

# o para apuntar a producción PMS, cuando exista
VITE_API_URL=https://app.pms.com.py/api
```
```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
```

⚠️ **Importante:** la URL de la API queda fija dentro del `.apk` en el momento de compilar — no se puede cambiar después sin recompilar. Cada ambiente (dev/prod) necesita su propio `.apk`, no son intercambiables. Si el `.apk` da "Error de conexión" al abrir la app (aunque la web funcione bien en el navegador), verificar que `FRONTEND_URL` en el backend incluya `https://localhost` además del dominio real — el WebView de Capacitor hace las peticiones desde ese origen internamente.

---

## 👥 Usuarios de Prueba (Seed)

> Los usuarios de seed solo existen en la base de datos de **desarrollo**. Nunca se cargan en producción.

| Usuario | Contraseña | Rol | Acceso principal |
|---------|------------|-----|------------------|
| `admin` | `admin1234` | `ADMIN` | Dashboard completo, CRUD de usuarios y tarifas |
| `operador1` | `operador123` | `OPERADOR` | Registro de tubos, clientes y remisiones |
| `repartidor1` | `repartidor123` | `REPARTIDOR` | Hoja de reparto móvil (módulo de entregas y QR) |

---

## 📊 Endpoints de la API

| Método | Endpoint | Descripción | Rol Mínimo |
|--------|---------|-------------|------------|
| **POST** | `/api/auth/login` | Inicio de sesión | — |
| **GET** | `/api/auth/me` | Datos de perfil autenticado | Cualquiera |
| **GET** | `/api/public/tubos/:id` | Consulta pública del estado del tubo | Sin auth |
| **GET** | `/api/tubos` | Listar tubos con filtros | Cualquiera |
| **POST** | `/api/tubos` | Crear un tubo nuevo | `OPERADOR` |
| **PATCH** | `/api/tubos/:id` | Editar propiedades de tubo | `OPERADOR` |
| **GET** | `/api/tubos/:id/qr` | Obtener código QR en base64 | Cualquiera |
| **GET** | `/api/clientes` | Listar clientes registrados | Cualquiera |
| **POST** | `/api/clientes` | Registrar un nuevo cliente | `OPERADOR` |
| **POST** | `/api/entregas` | Crear una remisión de entrega | `OPERADOR` |
| **PUT** | `/api/entregas/:id/confirmar` | Confirmar entrega realizada | `REPARTIDOR` |
| **PUT** | `/api/entregas/:id/cancelar` | Cancelar remisión y revertir estados | `OPERADOR` |
| **GET** | `/api/alquileres` | Listar contratos de alquiler | Cualquiera |
| **POST** | `/api/cargas` | Registrar recarga de gas a un tubo | `OPERADOR` |
| **GET** | `/api/precios` | Obtener tarifario actual por gas | Cualquiera |
| **PUT** | `/api/precios` | Actualizar tarifas de gas | `ADMIN` |
| **GET** | `/api/auditoria` | Listar historial de auditoría global | Cualquiera |
| **GET** | `/api/usuarios` | Listar cuentas de usuario | `ADMIN` |
| **POST** | `/api/usuarios` | Crear cuenta de usuario | `ADMIN` |
| **GET** | `/api/health` | Estado del backend | — |

---

## 🔄 Transiciones de Estados de Tubos

La aplicación restringe las transiciones mediante una máquina de estados para evitar inconsistencias lógicas en el inventario:

```
DISPONIBLE  → CARGADO, RESERVADO, EN_REVISION, VENDIDO
CARGADO     → DISPONIBLE, ENTREGADO, ALQUILADO, RESERVADO, EN_REVISION
VACIO       → EN_REVISION, CARGADO
ENTREGADO   → DEVUELTO, EN_REVISION, PERDIDO
ALQUILADO   → DEVUELTO, EN_REVISION, PERDIDO
VENDIDO     → (Estado final inmutable)
RESERVADO   → DISPONIBLE, CARGADO, ENTREGADO, ALQUILADO
PERDIDO     → EN_REVISION
DEVUELTO    → DISPONIBLE, VACIO, EN_REVISION, CARGADO
EN_REVISION → DISPONIBLE, VACIO, CARGADO
```

---

## 📝 Migraciones — nota importante para el equipo

Cualquier cambio en `schema.prisma` **debe generar su migración correspondiente antes de subir a `develop`**, con:
```bash
npx prisma migrate dev --name <descripcion-del-cambio>
```
Un cambio en el schema sin su migración generada queda invisible para cualquiera que clone el repo o despliegue una instancia nueva — el código espera columnas que la base de datos real no tiene, y las operaciones fallan en tiempo de ejecución (no en el build). Antes de mergear a `main`, confirmar que `git status` en `prisma/migrations/` no tenga cambios pendientes de generar.

---

## 🔮 Roadmap / Próximas Versiones

- [x] PWA / Aplicación nativa instalable en Android (Implementado vía Capacitor)
- [x] Escaneo QR nativo desde la cámara móvil (Implementado vía `html5-qrcode` adaptado a Android)
- [x] Generación y descarga de comprobantes en PDF (Implementado vía `jspdf`)
- [x] Impresión térmica de remisiones con logotipos de la empresa (móvil y web).
- [x] Despliegue en VPS propio con 3 ambientes independientes (desarrollo, producción PMS, producción Cryopar), HTTPS y proceso administrado con PM2.
- [ ] Tareas cron automatizadas para la alerta y vencimiento de alquileres.
- [ ] Envío automático de notificaciones por WhatsApp/Email al cliente ante vencimientos.
- [ ] Módulo de facturación directa y registro de métodos de pago.
- [ ] Backups automáticos programados de las 3 bases de datos en el VPS.