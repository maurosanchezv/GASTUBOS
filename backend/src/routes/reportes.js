// gastubos/backend/src/routes/reportes.js

import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/reportes/dashboard — todos los indicadores del dashboard en una sola llamada
router.get('/dashboard', async (req, res, next) => {
  try {
    const hoy = new Date()

    const [
      porEstado,
      alquileresVencidos,
      entregasRecientes,
      tubosTotal,
      clientesActivos,
    ] = await Promise.all([
      // Conteo por estado
      prisma.tubo.groupBy({
        by: ['estado'],
        where: { activo: true },
        _count: { estado: true },
      }),
      // Alquileres vencidos
      prisma.alquiler.count({
        where: { estado: 'ACTIVO', fechaVencimiento: { lt: hoy } },
      }),
      // Últimas 5 entregas
      prisma.entrega.findMany({
        take: 5,
        orderBy: { fechaEntrega: 'desc' },
        include: {
          cliente:  { select: { nombre: true } },
          detalles: { select: { tuboId: true } },
        },
      }),
      prisma.tubo.count({ where: { activo: true } }),
      prisma.cliente.count({ where: { activo: true } }),
    ])

    const estadosMap = Object.fromEntries(
      porEstado.map(r => [r.estado, r._count.estado])
    )

    res.json({
      tubosTotal,
      clientesActivos,
      alquileresVencidos,
      porEstado: estadosMap,
      entregasRecientes,
    })
  } catch (err) { next(err) }
})

// GET /api/reportes/tubos-por-cliente
router.get('/tubos-por-cliente', async (req, res, next) => {
  try {
    const datos = await prisma.cliente.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        _count: { select: { tubos: true } },
      },
      orderBy: { tubos: { _count: 'desc' } },
    })
    res.json(datos)
  } catch (err) { next(err) }
})

// GET /api/reportes/gases
router.get('/gases', async (req, res, next) => {
  try {
    const datos = await prisma.tubo.groupBy({
      by: ['gas'],
      where: { activo: true },
      _count: { gas: true },
      orderBy: { _count: { gas: 'desc' } },
    })
    res.json(datos)
  } catch (err) { next(err) }
})

// GET /api/reportes/movimientos?desde=&hasta=
router.get('/movimientos', async (req, res, next) => {
  try {
    const { desde, hasta, tuboId, usuarioId, page = 1, limit = 50 } = req.query
    const where = {}
    if (tuboId)    where.tuboId    = tuboId
    if (usuarioId) where.usuarioId = usuarioId
    if (desde || hasta) {
      where.createdAt = {}
      if (desde) where.createdAt.gte = new Date(desde)
      if (hasta) where.createdAt.lte = new Date(hasta)
    }

    const [movimientos, total] = await Promise.all([
      prisma.auditoria.findMany({
        where,
        include: {
          tubo:    { select: { id: true, gas: true } },
          usuario: { select: { username: true, nombre: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.auditoria.count({ where }),
    ])

    res.json({ movimientos, total })
  } catch (err) { next(err) }
})

export default router
