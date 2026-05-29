// gastubos/backend/src/routes/alquileres.js

import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/alquileres — con filtro por estado
router.get('/', async (req, res, next) => {
  try {
    const { estado, clienteId } = req.query
    const where = {}
    if (estado)    where.estado    = estado
    if (clienteId) where.clienteId = clienteId

    // Marcar como vencidos los que pasaron la fecha (sin actualizarlos en masa aquí,
    // se puede hacer con un cron job separado o al momento de leer)
    const alquileres = await prisma.alquiler.findMany({
      where,
      include: {
        cliente: { select: { id: true, nombre: true } },
        tubo:    { select: { id: true, gas: true, talla: true } },
      },
      orderBy: { fechaVencimiento: 'asc' },
    })

    // Marcar en memoria los vencidos (sin tocar la BD en cada GET)
    const hoy = new Date()
    const resultado = alquileres.map(a => ({
      ...a,
      estadoCalculado: a.estado === 'ACTIVO' && a.fechaVencimiento < hoy ? 'VENCIDO' : a.estado,
    }))

    res.json(resultado)
  } catch (err) { next(err) }
})

// GET /api/alquileres/vencidos — solo los vencidos (para alertas del dashboard)
router.get('/vencidos', async (req, res, next) => {
  try {
    const vencidos = await prisma.alquiler.findMany({
      where: {
        estado: 'ACTIVO',
        fechaVencimiento: { lt: new Date() },
      },
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true } },
        tubo:    { select: { id: true, gas: true } },
      },
      orderBy: { fechaVencimiento: 'asc' },
    })
    res.json(vencidos)
  } catch (err) { next(err) }
})

export default router
