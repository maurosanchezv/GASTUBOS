// gastubos/backend/src/routes/entregas.js
//
// Al confirmar una entrega:
//   - TipoOperacion = ENTREGA_SIMPLE → estado tubo → ENTREGADO
//   - TipoOperacion = ALQUILER       → estado tubo → ALQUILADO + crea Alquiler
//   - TipoOperacion = VENTA          → estado tubo → VENDIDO   + crea Venta

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import { registrarAuditoria } from '../utils/auditoria.js'
import { generarNumero } from '../utils/helpers.js'

const router = Router()
router.use(requireAuth)

const entregaSchema = z.object({
  clienteId:        z.string(),
  direccionEntrega: z.string().min(1),
  latitud:          z.number().optional(),
  longitud:         z.number().optional(),
  tipoOperacion:    z.enum(['ENTREGA_SIMPLE', 'ALQUILER', 'VENTA']),
  repartidorId:     z.string().optional(),
  observaciones:    z.string().optional(),
  tubosIds:         z.array(z.string()).min(1, 'Debe incluir al menos un tubo'),
  // Solo si tipoOperacion = ALQUILER
  fechaVencimiento: z.string().datetime().optional(),
  // Solo si tipoOperacion = VENTA
  referencia:       z.string().optional(),
})

// ─── GET /api/entregas ────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { clienteId, desde, hasta, page = 1, limit = 30 } = req.query
    const where = {}
    if (clienteId) where.clienteId = clienteId
    if (desde || hasta) {
      where.fechaEntrega = {}
      if (desde) where.fechaEntrega.gte = new Date(desde)
      if (hasta) where.fechaEntrega.lte = new Date(hasta)
    }

    const [entregas, total] = await Promise.all([
      prisma.entrega.findMany({
        where,
        include: {
          cliente:    { select: { id: true, nombre: true } },
          creadoPor:  { select: { username: true, nombre: true } },
          repartidor: { select: { username: true, nombre: true } },
          detalles:   { include: { tubo: { select: { id: true, gas: true, talla: true } } } },
        },
        orderBy: { fechaEntrega: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.entrega.count({ where }),
    ])

    res.json({ entregas, total })
  } catch (err) { next(err) }
})

// ─── POST /api/entregas ───────────────────────────────────────────────────────
router.post('/', requireRol('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = entregaSchema.parse(req.body)

    // Validar que todos los tubos existen y están en estado permitido
    const tubos = await prisma.tubo.findMany({
      where: { id: { in: data.tubosIds }, activo: true },
    })

    if (tubos.length !== data.tubosIds.length) {
      return res.status(400).json({ error: 'Uno o más tubos no encontrados' })
    }

    const estadosPermitidos = ['DISPONIBLE', 'CARGADO', 'RESERVADO']
    const noDisponibles = tubos.filter(t => !estadosPermitidos.includes(t.estado))
    if (noDisponibles.length > 0) {
      return res.status(400).json({
        error: 'Tubos no disponibles para entrega',
        tubos: noDisponibles.map(t => ({ id: t.id, estado: t.estado })),
      })
    }

    // Validaciones específicas por tipo
    if (data.tipoOperacion === 'ALQUILER' && !data.fechaVencimiento) {
      return res.status(400).json({ error: 'fechaVencimiento requerido para alquileres' })
    }

    const numero = await generarNumero('E')

    // Determinar estado destino de los tubos
    const estadoDestino = {
      ENTREGA_SIMPLE: 'ENTREGADO',
      ALQUILER:       'ALQUILADO',
      VENTA:          'VENDIDO',
    }[data.tipoOperacion]

    // Todo en una transacción
    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Crear entrega con detalles
      const entrega = await tx.entrega.create({
        data: {
          numero,
          clienteId:        data.clienteId,
          direccionEntrega: data.direccionEntrega,
          latitud:          data.latitud,
          longitud:         data.longitud,
          tipoOperacion:    data.tipoOperacion,
          repartidorId:     data.repartidorId,
          observaciones:    data.observaciones,
          creadoPorId:      req.user.id,
          detalles: {
            create: data.tubosIds.map(tuboId => ({ tuboId })),
          },
        },
        include: { detalles: true },
      })

      // 2. Actualizar estado de todos los tubos
      await tx.tubo.updateMany({
        where: { id: { in: data.tubosIds } },
        data: {
          estado:    estadoDestino,
          clienteId: data.tipoOperacion !== 'VENTA' ? data.clienteId : null,
          ubicacion: data.tipoOperacion !== 'VENTA' ? 'Cliente' : 'Vendido',
        },
      })

      // 3. Crear registros adicionales según tipo
      if (data.tipoOperacion === 'ALQUILER') {
        await Promise.all(data.tubosIds.map(async tuboId =>
          tx.alquiler.create({
            data: {
              numero:           await generarNumero('AL'),
              clienteId:        data.clienteId,
              tuboId,
              entregaId:        entrega.id,
              fechaInicio:      new Date(),
              fechaVencimiento: new Date(data.fechaVencimiento),
              estado:           'ACTIVO',
            },
          })
        ))
      }

      if (data.tipoOperacion === 'VENTA') {
        await Promise.all(data.tubosIds.map(async tuboId =>
          tx.venta.create({
            data: {
              numero:    await generarNumero('V'),
              clienteId: data.clienteId,
              tuboId,
              referencia: data.referencia,
            },
          })
        ))
      }

      // 4. Registrar auditoría para cada tubo
      const tubosConEstado = await tx.tubo.findMany({ where: { id: { in: data.tubosIds } } })
      await Promise.all(tubosConEstado.map(t =>
        tx.auditoria.create({
          data: {
            tuboId:         t.id,
            usuarioId:      req.user.id,
            accion:         `Entrega registrada (${data.tipoOperacion})`,
            estadoAnterior: tubos.find(x => x.id === t.id)?.estado,
            estadoNuevo:    estadoDestino,
            observaciones:  data.observaciones,
            metadata:       { entregaId: entrega.id, numero },
          },
        })
      ))

      return entrega
    })

    res.status(201).json(resultado)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

export default router
