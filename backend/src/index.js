// gastubos/backend/src/index.js

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import authRoutes     from './routes/auth.js'
import tuboRoutes     from './routes/tubos.js'
import clienteRoutes  from './routes/clientes.js'
import entregaRoutes  from './routes/entregas.js'
import devolucionRoutes from './routes/devoluciones.js'
import alquilerRoutes from './routes/alquileres.js'
import ventaRoutes    from './routes/ventas.js'
import auditoriaRoutes from './routes/auditoria.js'
import usuarioRoutes  from './routes/usuarios.js'
import reporteRoutes  from './routes/reportes.js'
import cargaRoutes    from './routes/cargas.js'
import publicRoutes   from './routes/public.js'   // ruta pública para QR sin auth
import precioRoutes   from './routes/precios.js'
import camionRoutes   from './routes/camiones.js'

const app  = express()
const PORT = process.env.PORT || 3001

app.set('trust proxy', 1) // Habilitar trust proxy para ngrok / proxies externos

// ─── Seguridad básica ─────────────────────────────────────────────────────────
app.use(helmet())
const rawOrigins = process.env.FRONTEND_URL || '';
const allowedOrigins = rawOrigins
  ? rawOrigins.split(',').map(o => o.trim().replace(/^['"]|['"]$/g, ''))
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

console.log('CORS FRONTEND_URL raw:', process.env.FRONTEND_URL)
console.log('CORS Allowed Origins (cleaned):', allowedOrigins)

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}))

// Rate limiting global (Aumentado para evitar bloqueos por IP compartida en ngrok/demos)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5000,
  message: { error: 'Demasiadas solicitudes, intentá más tarde.' },
}))

// Rate limiting para login (Aumentado para pruebas de desarrollo)
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiados intentos de login.' },
}))

app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ limit: '5mb', extended: true }))

// ─── Rutas públicas (sin auth) ────────────────────────────────────────────────
// Accedidas al escanear QR desde celular
app.use('/api/public/tubos', publicRoutes)

// ─── API protegida ────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes)
app.use('/api/tubos',      tuboRoutes)
app.use('/api/clientes',   clienteRoutes)
app.use('/api/entregas',   entregaRoutes)
app.use('/api/devoluciones', devolucionRoutes)
app.use('/api/alquileres', alquilerRoutes)
app.use('/api/ventas',     ventaRoutes)
app.use('/api/auditoria',  auditoriaRoutes)
app.use('/api/usuarios',   usuarioRoutes)
app.use('/api/cargas',     cargaRoutes)
app.use('/api/reportes',   reporteRoutes)
app.use('/api/precios',    precioRoutes)
app.use('/api/camiones',   camionRoutes)

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, version: '1.0.0' }))

app.get('/', (req, res) => res.json({ ok: true, message: 'GasTubos API Backend is running. Access the app via the frontend or mobile build.' }))

// ─── Error handler global ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err)
  const status = err.status || 500
  res.status(status).json({ error: err.message || 'Error interno del servidor' })
})

app.listen(PORT, () => {
  console.log(`✅ GasTubos API corriendo en http://localhost:${PORT}`)
})
