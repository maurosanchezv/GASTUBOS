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
- **Entrega en Salón:** además del reparto en camión, los clientes que retiran en mostrador pasan por el mismo control de tubos y retorno de cilindros que ya usa el repartidor.
- **Venta en Camión:** venta fraccionada de gas directo desde el stock del camión del repartidor, sin entregar el tubo completo.
- **Venta de Productos:** catálogo de productos (no gas) con carrito, descuento/reposición automática de stock y ticket propio.
- **Movimiento de Dinero:** registro de ingresos y egresos de caja, con su propio historial.
- **Cilindros de Terceros:** seguimiento de cilindros que no son propios, recibidos por el repartidor o en oficina, hasta su eventual adquisición.
- **Exportación:** Generación de reportes y comprobantes de entregas en PDF.
- **Impresión Térmica:** Emisión de comprobantes de remisión con logotipos de la empresa — vía Bluetooth clásico en la app móvil, vía Web Bluetooth directo desde el navegador del celular (sin depender de la app instalada), y desde el historial en computadora, en formatos de 58mm y 80mm.
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
│   │   │   ├── entregas.js        ← Remisiones: reparto y entrega en salón (Iniciar, Confirmar, Cancelar)
│   │   │   ├── devoluciones.js    ← Devolución de tubo propio (cierre de alquiler/entrega)
│   │   │   ├── alquileres.js      ← Control de contratos de alquiler
│   │   │   ├── ventas.js          ← Registro de ventas de tubos
│   │   │   ├── cargas.js          ← Recargas de gas (normal/salón) y venta fraccionada desde camión
│   │   │   ├── camiones.js        ← Gestión de camiones y stock asignado al repartidor
│   │   │   ├── cilindrosTerceros.js ← Cilindros de clientes no propios, hasta su adquisición
│   │   │   ├── productos.js       ← ABM de catálogo de productos (no gas)
│   │   │   ├── ventasProductos.js ← Venta de productos con descuento/reposición de stock
│   │   │   ├── movimientosDinero.js ← Ingresos y egresos de caja
│   │   │   ├── precios.js         ← Tarifario de gases
│   │   │   ├── auditoria.js       ← Historial de acciones sobre tubos
│   │   │   ├── usuarios.js        ← CRUD de cuentas de usuarios
│   │   │   ├── reportes.js        ← Indicadores clave de rendimiento
│   │   │   └── public.js          ← Endpoint público para landing page de QR
│   │   └── utils/
│   │       ├── prisma.js          ← Cliente Prisma unificado
│   │       ├── helpers.js         ← Contadores atómicos secuenciales
│   │       ├── auditoria.js       ← Registro rápido en historial
│   │       ├── estadosTubo.js     ← Máquina de estados y transiciones válidas
│   │       └── recepcionesRepartidor.js ← Recepciones activas de cilindros por repartidor
│   └── package.json
│
├── frontend/
│   ├── android/                   ← Proyecto nativo Android (Capacitor)
│   ├── src/
│   │   ├── App.jsx                ← Enrutador y guards de sesión
│   │   ├── components/            ← Componentes UI comunes, Layout y TuboChip
│   │   ├── services/api.js        ← Cliente Axios configurado con token y proxy
│   │   ├── store/authStore.js     ← Zustand store para sesión activa
│   │   ├── utils/
│   │   │   ├── ticketsImpresion.js    ← Armado de tickets ESC/POS (todos los módulos)
│   │   │   ├── webBluetoothPrinter.js ← Impresión Web Bluetooth desde el navegador
│   │   │   └── recambiosCalculadora.js ← Selector de gas/capacidad para retorno de cilindros
│   │   └── pages/                 ← Páginas del panel web y vistas móviles
│   │       ├── EntregasPage.jsx       ← Nueva Entrega, Entrega en Salón e Historial
│   │       ├── entregas/EntregaSalonTab.jsx ← Wizard de entrega en salón (reciclado del reparto)
│   │       ├── RepartoPage.jsx        ← App móvil del repartidor (hoja de ruta, retorno, venta en camión)
│   │       ├── ProductosPage.jsx      ← Catálogo de productos
│   │       ├── VentaProductosPage.jsx ← Punto de venta de productos
│   │       ├── MovimientoDineroPage.jsx ← Caja: ingresos y egresos
│   │       └── DiagnosticoBluetoothPage.jsx ← Diagnóstico de conexión Web Bluetooth
│   ├── capacitor.config.json      ← Ajustes de compilación de Capacitor
│   └── package.json
│
└── docker-compose.yml             ← Solo PostgreSQL para desarrollo local (ver nota más abajo)
```

---

## 🌐 Ambientes desplegados

El proyecto corre en un VPS propio (Hostinger, Ubuntu 24.04), con tres instancias completamente independientes: código, base de datos, variables de entorno, proceso y subdominio propios en cada una. Ninguna afecta a las demás.

| Ambiente | URL | Rama | Puerto backend | Base de datos |
|---|---|---|---|---|
| **Desarrollo** | https://devapp.pms.com.py | `develop` | 3001 | `gastubos_dev` |
| **Producción PMS** | https://app.pms.com.py | `main` | 3002 | `gastubos_prod` |
| **Producción Cryopar** | https://app.cryopar.com.py | `main` (por ahora) | 3003 | `gastubos_cryopar` (pendiente de desplegar) |

Cada instancia usa PostgreSQL nativo (sin exposición a Internet, solo accesible en `localhost`), PM2 para mantener el backend corriendo como proceso, y Nginx como proxy inverso con certificado SSL propio (Let's Encrypt, renovación automática) sirviendo el build estático del frontend (`npm run build`).

**Acceso al servidor:** por SSH con clave pública (sin contraseña), usuario `deploy`. Para incorporar un nuevo colaborador con acceso al servidor o al repositorio, ver la guía de despliegue interna del equipo.

### Desplegar una instancia nueva (ej. Cryopar)

```bash
scripts/deploy-instance.sh <app_dir> <db_name> <db_user> <pm2_name> <port> <domain> [branch] [source_repo]

# Ejemplo real (Cryopar, clonando desde el checkout de desarrollo ya presente en el VPS):
scripts/deploy-instance.sh /var/www/gastubos-cryopar gastubos_cryopar \
  gastubos_cryopar_user gastubos-cryopar-api 3003 app.cryopar.com.py main \
  /var/www/gastubos-desarrollo
```

Crea el rol y la base de Postgres, clona el código, arma los `.env` con secretos nuevos
(`openssl rand`), corre `prisma migrate deploy` (nunca `migrate dev`), compila el frontend
y levanta el backend en PM2 — todo sin seed de datos de prueba. Requiere que el bloque de
Nginx y el certificado SSL del dominio ya existan (no los crea). Al final imprime una sola
vez la contraseña de base de datos y el `JWT_SECRET` generados: guardalos en el momento, no
quedan en ningún archivo. El primer usuario ADMIN se crea aparte con
`npm run db:create-admin` dentro del backend recién desplegado.

> ⚠️ **`deploy.sh`, `update.sh`, `ecosystem.config.cjs` y `nginx.conf` en la raíz del repo
> son de una versión anterior (un solo ambiente, un solo dominio) y quedaron obsoletos**
> frente a esta arquitectura de 3 instancias. No usarlos — están ahí solo como referencia
> histórica. Para actualizar código en una instancia ya desplegada: `git pull`, backup con
> `pg_dump`, `prisma migrate deploy`, rebuild de frontend y `pm2 restart <nombre>`.

---

## ⚡ Guía de Inicio Rápido (Desarrollo local)

### 1. Iniciar Base de Datos y Backend (WSL2)

> Docker se usa acá **únicamente** para tener PostgreSQL corriendo en tu PC local sin instalarlo nativo — `docker-compose.yml` solo define ese servicio. El backend y el frontend siempre corren fuera de Docker, en todos los ambientes (local, dev, prod, Cryopar): no hay ningún `Dockerfile` de backend/frontend en el repo, y el VPS ni siquiera tiene Docker instalado.

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
echo 'VITE_API_URL=http://localhost:3001/api' > .env   # no hay .env.example: es la única variable
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

# o para apuntar a producción PMS
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
| **POST** | `/api/entregas` | Crear una remisión (reparto o salón, ver `canal`) | `OPERADOR` |
| **PUT** | `/api/entregas/:id/confirmar` | Confirmar entrega, incluye retorno de cilindros | `REPARTIDOR` |
| **PUT** | `/api/entregas/:id/cancelar` | Cancelar remisión y revertir estados | `OPERADOR` |
| **GET** | `/api/alquileres` | Listar contratos de alquiler | Cualquiera |
| **POST** | `/api/cargas` | Registrar recarga de gas a un tubo | `OPERADOR` |
| **POST** | `/api/cargas/venta-camion` | Venta fraccionada de gas desde el camión | `REPARTIDOR` |
| **GET** | `/api/camiones` | Listar camiones y stock asignado | Cualquiera |
| **GET** | `/api/cilindros-terceros` | Listar cilindros de terceros pendientes | Cualquiera |
| **POST** | `/api/cilindros-terceros/:id/adquirir` | Convertir un cilindro de tercero en tubo propio | `OPERADOR` |
| **GET** | `/api/productos` | Listar catálogo de productos | Cualquiera |
| **POST** | `/api/ventas-productos` | Registrar venta de productos (descuenta stock) | `OPERADOR` |
| **GET** | `/api/movimientos-dinero` | Listar movimientos de caja | `OPERADOR` |
| **POST** | `/api/movimientos-dinero` | Registrar ingreso/egreso de caja | `OPERADOR` |
| **GET** | `/api/precios` | Obtener tarifario actual por gas | Cualquiera |
| **PUT** | `/api/precios` | Actualizar tarifas de gas | `ADMIN` |
| **GET** | `/api/auditoria` | Listar historial de auditoría global | Cualquiera |
| **GET** | `/api/reportes/resumen` | KPIs, rendición por repartidor y stock | `ADMIN`/`SUPERVISOR` |
| **GET** | `/api/usuarios` | Listar cuentas de usuario | `ADMIN` |
| **POST** | `/api/usuarios` | Crear cuenta de usuario | `ADMIN` |
| **GET** | `/api/health` | Estado del backend | — |

> Tabla no exhaustiva — cada módulo tiene endpoints adicionales de detalle/edición. Ver `backend/src/routes/` para el listado completo.

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
- [x] Despliegue en VPS propio con arquitectura de 3 ambientes independientes, HTTPS y proceso administrado con PM2 — desarrollo y producción PMS ya desplegados; producción Cryopar pendiente.
- [x] Venta fraccionada de gas desde el camión del repartidor.
- [x] Venta de productos de catálogo (no gas) con control de stock.
- [x] Entrega en salón — retiro en mostrador con el mismo control de retorno de cilindros del reparto.
- [x] Módulo de Movimiento de Dinero (caja).
- [x] Impresión de tickets vía Web Bluetooth desde el navegador del celular, sin depender de la app instalada.
- [ ] Tareas cron automatizadas para la alerta y vencimiento de alquileres.
- [ ] Envío automático de notificaciones por WhatsApp/Email al cliente ante vencimientos.
- [ ] Módulo de facturación directa y registro de métodos de pago.
- [ ] Backups automáticos programados de las 3 bases de datos en el VPS.