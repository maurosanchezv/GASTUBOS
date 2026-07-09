// gastubos/backend/src/routes/tubos.js

import { Router } from 'express'
import { z } from 'zod'
import QRCode from 'qrcode'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import { generarIdTubo } from '../utils/helpers.js'
import { registrarAuditoria } from '../utils/auditoria.js'
import { TRANSICIONES_VALIDAS } from '../utils/estadosTubo.js'

const router = Router()
router.use(requireAuth)

// Validación de tubo nuevo
const tuboSchema = z.object({
  serie:            z.string().min(1),
  gas:              z.string().min(1),
  capacidadLitros:  z.number().int().positive().optional().nullable(),
  capacidadKg:      z.number().positive().optional().nullable(),
  talla:            z.string().min(1),
  pesoKg:           z.number().positive().optional(),
  propietario:      z.enum(['PROPIO', 'CLIENTE']).default('PROPIO'),
  propietarioClienteId: z.string().optional().nullable(),
  fechaCompra:      z.string().datetime().optional().nullable(),
  ubicacion:        z.string().optional(),
  observaciones:    z.string().optional(),
  estado:           z.enum(['DISPONIBLE','CARGADO','VACIO']).default('DISPONIBLE'),
}).refine(data => {
  if (data.propietario === 'CLIENTE' && !data.propietarioClienteId) {
    return false
  }
  return true
}, {
  message: "Debe seleccionar un cliente si el tubo es propiedad de un cliente",
  path: ["propietarioClienteId"]
}).refine(data => {
  const isAcetileno = data.gas.toLowerCase() === 'acetileno'
  if (isAcetileno) {
    if (data.capacidadLitros) return false
    const allowedSizes = [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8]
    if (!data.capacidadKg || !allowedSizes.includes(data.capacidadKg)) return false
  } else {
    if (!data.capacidadLitros) return false
    if (data.capacidadKg) return false
  }
  return true
}, {
  message: "Configuración de capacidad incorrecta para el tipo de gas",
  path: ["capacidadLitros"]
})

// ─── GET /api/tubos ───────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { estado, gas, propietario, clienteId, q, page = 1, limit = 50, disponibles } = req.query
    const where = { activo: true }
    if (estado)      where.estado      = estado
    if (disponibles === 'true') {
      where.estado = { in: ['DISPONIBLE', 'CARGADO', 'RESERVADO'] }
      where.detallesEntrega = {
        none: {
          entrega: {
            confirmada: false,
            cancelada: false
          }
        }
      }
    }
    if (gas)         where.gas         = { contains: gas, mode: 'insensitive' }
    if (propietario) where.propietario = propietario
    if (clienteId)   where.clienteId   = clienteId
    if (q) {
      where.OR = [
        { id:    { contains: q, mode: 'insensitive' } },
        { serie: { contains: q, mode: 'insensitive' } },
        { gas:   { contains: q, mode: 'insensitive' } },
      ]
    }

    const [tubos, total] = await Promise.all([
      prisma.tubo.findMany({
        where,
        include: { 
          cliente: { select: { id: true, nombre: true } },
          camion: { select: { id: true, placa: true } },
        },
        orderBy: { id: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.tubo.count({ where }),
    ])

    res.json({ tubos, total, page: Number(page), limit: Number(limit) })
  } catch (err) { next(err) }
})

// ─── GET /api/tubos/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const tubo = await prisma.tubo.findUnique({
      where: { id: req.params.id },
      include: {
        cliente: true,
        camion: true,
        auditoria: {
          include: { usuario: { select: { username: true, nombre: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        alquileres: {
          where: { estado: { in: ['ACTIVO', 'VENCIDO'] } },
          include: { cliente: true },
          take: 5,
        },
        cargas: {
          include: { operador: { select: { username: true, nombre: true } } },
          orderBy: { fechaCarga: 'desc' },
          take: 20,
        },
      },
    })
    if (!tubo) return res.status(404).json({ error: 'Tubo no encontrado' })
    res.json(tubo)
  } catch (err) { next(err) }
})

// ─── POST /api/tubos ──────────────────────────────────────────────────────────
router.post('/', requireRol('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = tuboSchema.parse(req.body)

    // Contador + creación + auditoría en la misma transacción: si falla la
    // creación (p. ej. `serie` duplicada), el incremento del contador se revierte.
    const tubo = await prisma.$transaction(async (tx) => {
      const id = await generarIdTubo(tx)

      const creado = await tx.tubo.create({
        data: { ...data, id, fechaCompra: data.fechaCompra ? new Date(data.fechaCompra) : null },
      })

      await tx.auditoria.create({
        data: {
          tuboId:        id,
          usuarioId:     req.user.id,
          accion:        'Tubo creado',
          estadoNuevo:   creado.estado,
          observaciones: data.observaciones,
        },
      })

      return creado
    })

    res.status(201).json(tubo)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── PATCH /api/tubos/:id ─────────────────────────────────────────────────────
router.patch('/:id', requireRol('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const tubo = await prisma.tubo.findUnique({ where: { id: req.params.id } })
    if (!tubo) return res.status(404).json({ error: 'Tubo no encontrado' })

    // No permitimos cambiar el estado por este endpoint (usar /cambiar-estado)
    const { estado: _estado, id: _id, ...rest } = req.body

    const actualizado = await prisma.tubo.update({
      where: { id: req.params.id },
      data: rest,
    })

    await registrarAuditoria({
      tuboId:    req.params.id,
      usuarioId: req.user.id,
      accion:    'Tubo editado',
    })

    res.json(actualizado)
  } catch (err) { next(err) }
})

// ─── POST /api/tubos/:id/cambiar-estado ───────────────────────────────────────
const cambioEstadoSchema = z.object({
  estadoNuevo:   z.string(),
  observaciones: z.string().optional(),
  clienteId:     z.string().optional().nullable(),
})

router.post('/:id/cambiar-estado', async (req, res, next) => {
  try {
    const { estadoNuevo, observaciones, clienteId } = cambioEstadoSchema.parse(req.body)
    const tubo = await prisma.tubo.findUnique({ where: { id: req.params.id } })
    if (!tubo) return res.status(404).json({ error: 'Tubo no encontrado' })

    // Verificar transición válida
    const permitidas = TRANSICIONES_VALIDAS[tubo.estado] || []
    if (!permitidas.includes(estadoNuevo)) {
      return res.status(400).json({
        error: `No se puede pasar de ${tubo.estado} a ${estadoNuevo}`,
        transicionesPermitidas: permitidas,
      })
    }

    const updateData = { estado: estadoNuevo }
    if (clienteId !== undefined) {
      updateData.clienteId = clienteId
      if (estadoNuevo === 'RESERVADO' && clienteId) {
        updateData.ubicacion = 'Reservado'
      } else if (!clienteId) {
        updateData.ubicacion = 'Depósito'
      }
    }

    const actualizado = await prisma.tubo.update({
      where: { id: req.params.id },
      data:  updateData,
    })

    await registrarAuditoria({
      tuboId:         req.params.id,
      usuarioId:      req.user.id,
      accion:         'Cambio de estado',
      estadoAnterior: tubo.estado,
      estadoNuevo,
      observaciones,
    })

    res.json(actualizado)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── GET /api/tubos/:id/qr ────────────────────────────────────────────────────
// Devuelve el QR como PNG en base64 (para imprimir)
router.get('/:id/qr', async (req, res, next) => {
  try {
    const tubo = await prisma.tubo.findUnique({ where: { id: req.params.id } })
    if (!tubo) return res.status(404).json({ error: 'Tubo no encontrado' })

    const url = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/tubos/${tubo.id}`
    const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 })

    await registrarAuditoria({
      tuboId:    req.params.id,
      usuarioId: req.user.id,
      accion:    'QR generado',
    })

    res.json({ qr: qrDataUrl, url })
  } catch (err) { next(err) }
})

export default router
