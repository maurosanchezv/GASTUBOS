// gastubos/backend/src/routes/cargas.js

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import { generarNumero } from '../utils/helpers.js'
import { registrarAuditoria } from '../utils/auditoria.js'
import { TRANSICIONES_VALIDAS } from '../utils/estadosTubo.js'

const router = Router()
router.use(requireAuth)

const cargaSchema = z.object({
  tuboId:        z.string().min(1).optional().nullable(),
  tipoGas:       z.enum(['CO2','OXIGENO','ARGON','NITROGENO','AIRE_COMPRIMIDO','MEZCLA_CO2_ARGON','ACETILENO']),
  unidad:        z.enum(['KG','M3']),
  cantidad:      z.number().positive(),
  precioUnitario: z.number().nonnegative().optional().default(0),
  fechaCarga:    z.string().datetime(),
  observaciones: z.string().optional(),
})

// ─── GET /api/cargas ──────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { tuboId, tipoGas, desde, hasta, page = 1, limit = 50 } = req.query
    const where = {}
    if (tuboId)  where.tuboId  = tuboId
    if (tipoGas) where.tipoGas = tipoGas
    if (desde || hasta) {
      where.fechaCarga = {}
      if (desde) where.fechaCarga.gte = new Date(desde)
      if (hasta) where.fechaCarga.lte = new Date(hasta)
    }

    const [cargas, total] = await Promise.all([
      prisma.carga.findMany({
        where,
        include: {
          tubo:     { select: { id: true, serie: true, gas: true } },
          operador: { select: { id: true, username: true, nombre: true } },
        },
        orderBy: { fechaCarga: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.carga.count({ where }),
    ])

    res.json({ cargas, total, page: Number(page), limit: Number(limit) })
  } catch (err) { next(err) }
})

// ─── GET /api/cargas/tubo/:tuboId ─────────────────────────────────────────────
router.get('/tubo/:tuboId', async (req, res, next) => {
  try {
    const cargas = await prisma.carga.findMany({
      where: { tuboId: req.params.tuboId },
      include: {
        operador: { select: { username: true, nombre: true } },
      },
      orderBy: { fechaCarga: 'desc' },
    })
    res.json(cargas)
  } catch (err) { next(err) }
})

// ─── POST /api/cargas ─────────────────────────────────────────────────────────
router.post('/', requireRol('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = cargaSchema.parse(req.body)

    let tubo = null
    if (data.tuboId) {
      tubo = await prisma.tubo.findUnique({ where: { id: data.tuboId, activo: true } })
      if (!tubo) return res.status(404).json({ error: 'Tubo no encontrado' })

      if (!TRANSICIONES_VALIDAS[tubo.estado]?.includes('CARGADO')) {
        return res.status(400).json({
          error: `No se puede cargar un tubo en estado ${tubo.estado}`,
        })
      }
    }

    const numero = await generarNumero('CG')

    const carga = await prisma.$transaction(async (tx) => {
      const nueva = await tx.carga.create({
        data: {
          numero,
          tuboId:        data.tuboId || null,
          tipoGas:       data.tipoGas,
          unidad:        data.unidad,
          cantidad:      data.cantidad,
          precioUnitario: data.precioUnitario,
          fechaCarga:    new Date(data.fechaCarga),
          operadorId:    req.user.id,
          observaciones: data.observaciones,
        },
        include: {
          tubo:     { select: { id: true, serie: true, gas: true } },
          operador: { select: { username: true, nombre: true } },
        },
      })

      if (data.tuboId) {
        await tx.tubo.update({
          where: { id: data.tuboId },
          data:  { estado: 'CARGADO' },
        })
      }

      return nueva
    })

    if (data.tuboId && tubo) {
      await registrarAuditoria({
        tuboId:         data.tuboId,
        usuarioId:      req.user.id,
        accion:         'Carga registrada',
        estadoAnterior: tubo.estado,
        estadoNuevo:    'CARGADO',
        observaciones:  data.observaciones,
        metadata:       { cargaId: carga.id, numero, tipoGas: data.tipoGas, cantidad: data.cantidad, unidad: data.unidad },
      })
    }

    res.status(201).json(carga)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

export default router
