// gastubos/backend/src/routes/camiones.js
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

const camionSchema = z.object({
  placa:        z.string().min(1, 'La placa/patente es obligatoria'),
  capacidadMax: z.number().int().positive('La capacidad máxima debe ser un número entero positivo'),
  activo:       z.boolean().optional().default(true),
})

// ─── GET /api/camiones ────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const camiones = await prisma.camion.findMany({
      include: {
        _count: { select: { tubos: true } }
      },
      orderBy: { placa: 'asc' }
    })
    res.json(camiones)
  } catch (err) { next(err) }
})

// ─── GET /api/camiones/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const camion = await prisma.camion.findUnique({
      where: { id: req.params.id },
      include: {
        tubos: true,
        _count: { select: { tubos: true } }
      }
    })
    if (!camion) return res.status(404).json({ error: 'Camión no encontrado' })
    res.json(camion)
  } catch (err) { next(err) }
})

// ─── GET /api/camiones/:id/stock ──────────────────────────────────────────────
router.get('/:id/stock', async (req, res, next) => {
  try {
    const { id } = req.params
    const camion = await prisma.camion.findUnique({ where: { id } })
    if (!camion) return res.status(404).json({ error: 'Camión no encontrado' })

    const tubos = await prisma.tubo.findMany({
      where: { camionId: id, activo: true },
      orderBy: { id: 'asc' }
    })
    res.json(tubos)
  } catch (err) { next(err) }
})

// ─── POST /api/camiones ───────────────────────────────────────────────────────
router.post('/', requireRol('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = camionSchema.parse(req.body)
    
    // Validar duplicado de placa
    const existente = await prisma.camion.findUnique({ where: { placa: data.placa } })
    if (existente) {
      return res.status(400).json({ error: 'Ya existe un camión con esa placa/patente' })
    }

    const camion = await prisma.camion.create({ data })
    res.status(201).json(camion)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── PATCH /api/camiones/:id ──────────────────────────────────────────────────
router.patch('/:id', requireRol('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = camionSchema.partial().parse(req.body)

    if (data.placa) {
      const existente = await prisma.camion.findFirst({
        where: { placa: data.placa, NOT: { id: req.params.id } }
      })
      if (existente) {
        return res.status(400).json({ error: 'Ya existe otro camión con esa placa/patente' })
      }
    }

    const camion = await prisma.camion.update({
      where: { id: req.params.id },
      data
    })
    res.json(camion)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── POST /api/camiones/:id/asignar ───────────────────────────────────────────
const asignarSchema = z.object({
  tubosIds: z.array(z.string()).min(1, 'Debe incluir al menos un tubo'),
})

router.post('/:id/asignar', requireRol('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { tubosIds } = asignarSchema.parse(req.body)

    const camion = await prisma.camion.findUnique({
      where: { id },
      include: { _count: { select: { tubos: true } } }
    })
    if (!camion) return res.status(404).json({ error: 'Camión no encontrado' })
    if (!camion.activo) return res.status(400).json({ error: 'El camión no está activo' })

    const totalActual = camion._count.tubos
    const totalNuevo = totalActual + tubosIds.length
    if (totalNuevo > camion.capacidadMax) {
      return res.status(400).json({
        error: `Excede la capacidad del camión. Capacidad máxima: ${camion.capacidadMax}. Ocupado actualmente: ${totalActual}. Intentás cargar ${tubosIds.length} tubos (Total: ${totalNuevo}).`
      })
    }

    // Validar que todos los tubos existen, están activos y NO están asignados a otro camión ni entregados/alquilados/vendidos/reservados
    const tubos = await prisma.tubo.findMany({
      where: { id: { in: tubosIds }, activo: true }
    })

    if (tubos.length !== tubosIds.length) {
      return res.status(400).json({ error: 'Uno o más tubos no fueron encontrados o están inactivos' })
    }

    const estadosInvalidos = ['ENTREGADO', 'ALQUILADO', 'VENDIDO', 'RESERVADO', 'PERDIDO']
    const noDisponibles = tubos.filter(t => estadosInvalidos.includes(t.estado) || t.camionId)
    if (noDisponibles.length > 0) {
      return res.status(400).json({
        error: 'Uno o más tubos no están disponibles para asignarse (ya reservados, en tránsito, entregados o en otro camión)',
        tubos: noDisponibles.map(t => ({ id: t.id, estado: t.estado, camionId: t.camionId }))
      })
    }

    // Ejecutar la asignación y registrar auditorías en transacción
    const resultado = await prisma.$transaction(async (tx) => {
      // Actualizar tubos
      await tx.tubo.updateMany({
        where: { id: { in: tubosIds } },
        data: {
          estado: 'RESERVADO',
          camionId: id,
          ubicacion: `Camión ${camion.placa}`
        }
      })

      // Registrar auditoría por cada tubo
      for (const tubo of tubos) {
        await tx.auditoria.create({
          data: {
            tuboId:         tubo.id,
            usuarioId:      req.user.id,
            accion:         'Asignado a camión',
            estadoAnterior: tubo.estado,
            estadoNuevo:    'RESERVADO',
            observaciones:  `Asignado al camión con placa/patente ${camion.placa}`,
            metadata:       { camionId: id, placa: camion.placa }
          }
        })
      }

      return { success: true, count: tubosIds.length }
    })

    res.json(resultado)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── POST /api/camiones/:id/liberar ───────────────────────────────────────────
const liberarSchema = z.object({
  tubosIds: z.array(z.string()).min(1, 'Debe incluir al menos un tubo'),
})

router.post('/:id/liberar', requireRol('ADMIN', 'OPERADOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { tubosIds } = liberarSchema.parse(req.body)

    const camion = await prisma.camion.findUnique({ where: { id } })
    if (!camion) return res.status(404).json({ error: 'Camión no encontrado' })

    // Validar que los tubos pertenecen a este camión
    const tubos = await prisma.tubo.findMany({
      where: { id: { in: tubosIds }, camionId: id, activo: true }
    })

    if (tubos.length !== tubosIds.length) {
      return res.status(400).json({ error: 'Uno o más tubos no pertenecen a este camión o no están activos' })
    }

    // Retornar al depósito y registrar auditoría en transacción
    const resultado = await prisma.$transaction(async (tx) => {
      for (const tubo of tubos) {
        // Encontrar el estado original antes de subirlo al camión
        const ultimaAudit = await tx.auditoria.findFirst({
          where: { tuboId: tubo.id, accion: 'Asignado a camión' },
          orderBy: { createdAt: 'desc' }
        })

        // Restaurar estado anterior (devolución al depósito), por defecto CARGADO
        const estadoRestaurado = ultimaAudit?.estadoAnterior || 'CARGADO'

        await tx.tubo.update({
          where: { id: tubo.id },
          data: {
            estado:    estadoRestaurado,
            camionId:  null,
            ubicacion: 'Depósito'
          }
        })

        // Registrar auditoría de liberación
        await tx.auditoria.create({
          data: {
            tuboId:         tubo.id,
            usuarioId:      req.user.id,
            accion:         'Retornado a depósito',
            estadoAnterior: 'RESERVADO',
            estadoNuevo:    estadoRestaurado,
            observaciones:  `Retornado a depósito desde camión con placa/patente ${camion.placa}`,
            metadata:       { camionId: id, placa: camion.placa }
          }
        })
      }

      return { success: true, count: tubosIds.length }
    })

    res.json(resultado)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

export default router
