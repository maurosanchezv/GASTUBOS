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
  costoDelivery:    z.coerce.number().optional().default(0),
  tubosDetalles:    z.array(z.object({
    tuboId:      z.string(),
    cantidadGas: z.coerce.number().optional(),
    unidadGas:   z.enum(['KG', 'M3']).optional(),
  })).optional(),
  // Solo si tipoOperacion = ALQUILER
  fechaVencimiento: z.string().datetime().optional(),
  // Solo si tipoOperacion = VENTA
  referencia:       z.string().optional(),
})

// Helper para mapear el gas del tubo (string) al enum de TipoGas
function mapTuboGasToTipoGas(tuboGas) {
  if (!tuboGas) return 'CO2'
  const norm = tuboGas.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  if (norm.includes('co2')) return 'CO2'
  if (norm.includes('oxigeno')) return 'OXIGENO'
  if (norm.includes('argon')) return 'ARGON'
  if (norm.includes('nitrogeno')) return 'NITROGENO'
  if (norm.includes('aire')) return 'AIRE_COMPRIMIDO'
  if (norm.includes('mezcla')) return 'MEZCLA_CO2_ARGON'
  if (norm.includes('acetileno')) return 'ACETILENO'
  return 'CO2'
}

// ─── GET /api/entregas ────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { clienteId, repartidorId, confirmada, cancelada, desde, hasta, page = 1, limit = 30 } = req.query
    const where = {}
    if (clienteId) where.clienteId = clienteId
    if (repartidorId) where.repartidorId = repartidorId
    
    if (confirmada !== undefined) {
      where.confirmada = confirmada === 'true'
      // Si piden las no confirmadas, por defecto ocultamos las canceladas (no concretadas)
      if (confirmada === 'false' && cancelada === undefined) {
        where.cancelada = false
      }
    }
    if (cancelada !== undefined) {
      where.cancelada = cancelada === 'true'
    }

    if (desde || hasta) {
      where.fechaEntrega = {}
      if (desde) where.fechaEntrega.gte = new Date(desde)
      if (hasta) where.fechaEntrega.lte = new Date(hasta)
    }

    const [entregas, total] = await Promise.all([
      prisma.entrega.findMany({
        where,
        include: {
          cliente:    { select: { id: true, nombre: true, ruc: true } },
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
      // 1. Obtener los precios de todos los gases vigentes
      const todosLosPrecios = await tx.precioGas.findMany()

      // 2. Para cada tubo, calcular detalles de carga y precio
      const detallesAInsertar = []

      for (const tuboId of data.tubosIds) {
        const tubo = tubos.find(t => t.id === tuboId)
        const tipoGas = mapTuboGasToTipoGas(tubo.gas)
        const precioGasInfo = todosLosPrecios.find(p => p.gas === tipoGas)

        const precioUnitario = precioGasInfo ? Number(precioGasInfo.precioUnitario) : 0
        let cantidadGas = 0
        let unidadGas = precioGasInfo ? precioGasInfo.unidad : 'KG'

        // Verificar si la cantidad fue ingresada manualmente
        const manualDetail = data.tubosDetalles?.find(d => d.tuboId === tuboId)
        if (manualDetail && manualDetail.cantidadGas !== undefined) {
          cantidadGas = Number(manualDetail.cantidadGas)
          if (manualDetail.unidadGas) {
            unidadGas = manualDetail.unidadGas
          }
        } else {
          // Buscar última carga en la base de datos
          const ultimaCarga = await tx.carga.findFirst({
            where: { tuboId },
            orderBy: { fechaCarga: 'desc' },
          })
          if (ultimaCarga) {
            cantidadGas = Number(ultimaCarga.cantidad)
            unidadGas = ultimaCarga.unidad
          }
        }

        const subtotal = cantidadGas * precioUnitario

        detallesAInsertar.push({
          tuboId,
          cantidadGas,
          unidadGas,
          precioUnitario,
          subtotal,
          estadoAnterior: tubo.estado,
        })
      }

      // 3. Crear entrega con detalles
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
          costoDelivery:    data.costoDelivery,
          detalles: {
            create: detallesAInsertar,
          },
        },
        include: { detalles: true },
      })

      // 4. Actualizar estado de todos los tubos a RESERVADO (En Tránsito)
      await tx.tubo.updateMany({
        where: { id: { in: data.tubosIds } },
        data: {
          estado:    'RESERVADO',
          clienteId: data.clienteId,
          ubicacion: 'En Tránsito',
        },
      })

      // 5. Crear registros adicionales según tipo
      if (data.tipoOperacion === 'ALQUILER') {
        for (const tuboId of data.tubosIds) {
          const numeroAlquiler = await generarNumero('AL', tx)
          await tx.alquiler.create({
            data: {
              numero:           numeroAlquiler,
              clienteId:        data.clienteId,
              tuboId,
              entregaId:        entrega.id,
              fechaInicio:      new Date(),
              fechaVencimiento: new Date(data.fechaVencimiento),
              estado:           'ACTIVO',
            },
          })
        }
      }

      if (data.tipoOperacion === 'VENTA') {
        for (const tuboId of data.tubosIds) {
          const numeroVenta = await generarNumero('V', tx)
          await tx.venta.create({
            data: {
              numero:    numeroVenta,
              clienteId: data.clienteId,
              tuboId,
              referencia: data.referencia,
            },
          })
        }
      }

      // 6. Registrar auditoría para cada tubo
      const tubosConEstado = await tx.tubo.findMany({ where: { id: { in: data.tubosIds } } })
      await Promise.all(tubosConEstado.map(t =>
        tx.auditoria.create({
          data: {
            tuboId:         t.id,
            usuarioId:      req.user.id,
            accion:         `Entrega registrada (${data.tipoOperacion})`,
            estadoAnterior: tubos.find(x => x.id === t.id)?.estado,
            estadoNuevo:    'RESERVADO',
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

// ─── PUT /api/entregas/:id/confirmar ─────────────────────────────────────────
router.put('/:id/confirmar', requireRol('ADMIN', 'OPERADOR', 'REPARTIDOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const entrega = await prisma.entrega.findUnique({
      where: { id },
      include: { detalles: true }
    })
    if (!entrega) return res.status(404).json({ error: 'Entrega no encontrada' })
    if (entrega.confirmada) return res.status(400).json({ error: 'La entrega ya está confirmada' })

    // Un REPARTIDOR solo puede confirmar las entregas que le fueron asignadas a él.
    if (req.user.rol === 'REPARTIDOR' && entrega.repartidorId !== req.user.id) {
      return res.status(403).json({ error: 'Solo podés confirmar entregas asignadas a vos' })
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Confirmar la entrega
      const entregaActualizada = await tx.entrega.update({
        where: { id },
        data: { confirmada: true },
        include: { detalles: true }
      })

      const estadoDestino = {
        ENTREGA_SIMPLE: 'ENTREGADO',
        ALQUILER:       'ALQUILADO',
        VENTA:          'VENDIDO',
      }[entrega.tipoOperacion]

      // 2. Actualizar estado y ubicación de todos los tubos de la entrega
      for (const d of entrega.detalles) {
        await tx.tubo.update({
          where: { id: d.tuboId },
          data: {
            estado:    estadoDestino,
            clienteId: entrega.tipoOperacion !== 'VENTA' ? entrega.clienteId : null,
            ubicacion: entrega.tipoOperacion !== 'VENTA' ? 'Cliente' : 'Vendido',
          }
        })

        // 3. Registrar auditoría de entrega confirmada con cambio de estado
        await tx.auditoria.create({
          data: {
            tuboId:         d.tuboId,
            usuarioId:      req.user.id,
            accion:         `Entrega confirmada en terreno (Móvil)`,
            estadoAnterior: 'RESERVADO',
            estadoNuevo:    estadoDestino,
            observaciones:  `Confirmado por chofer/repartidor`,
            metadata:       { entregaId: id, numero: entrega.numero }
          }
        })
      }

      // 4. Actualizar fecha de inicio/venta de los alquileres/ventas asociados a la fecha real de confirmación
      if (entrega.tipoOperacion === 'ALQUILER') {
        await tx.alquiler.updateMany({
          where: { entregaId: id },
          data: { fechaInicio: new Date() }
        })
      }

      if (entrega.tipoOperacion === 'VENTA') {
        const tuboIds = entrega.detalles.map(d => d.tuboId)
        await tx.venta.updateMany({
          where: {
            tuboId: { in: tuboIds },
            clienteId: entrega.clienteId,
          },
          data: { fechaVenta: new Date() }
        })
      }

      return entregaActualizada
    })

    res.json(resultado)
  } catch (err) {
    next(err)
  }
})

// ─── PUT /api/entregas/:id/cancelar ──────────────────────────────────────────
router.put('/:id/cancelar', requireRol('ADMIN', 'OPERADOR', 'REPARTIDOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { motivo } = req.body
    const entrega = await prisma.entrega.findUnique({
      where: { id },
      include: { detalles: true }
    })
    if (!entrega) return res.status(404).json({ error: 'Entrega no encontrada' })
    if (entrega.confirmada) return res.status(400).json({ error: 'No se puede cancelar una entrega ya confirmada' })
    if (entrega.cancelada) return res.status(400).json({ error: 'La entrega ya está cancelada' })

    // Un REPARTIDOR solo puede cancelar las entregas que le fueron asignadas a él.
    if (req.user.rol === 'REPARTIDOR' && entrega.repartidorId !== req.user.id) {
      return res.status(403).json({ error: 'Solo podés cancelar entregas asignadas a vos' })
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Marcar la entrega como cancelada con motivo
      const entregaActualizada = await tx.entrega.update({
        where: { id },
        data: {
          cancelada: true,
          motivoCancelacion: motivo || 'Cancelada sin motivo especificado'
        },
        include: { detalles: true }
      })

      // 2. Eliminar alquileres asociados (si los hay)
      await tx.alquiler.deleteMany({
        where: { entregaId: id }
      })

      // 3. Eliminar ventas asociadas (si las hay)
      if (entrega.tipoOperacion === 'VENTA') {
        const tuboIds = entrega.detalles.map(d => d.tuboId)
        await tx.venta.deleteMany({
          where: {
            tuboId: { in: tuboIds },
            clienteId: entrega.clienteId,
          }
        })
      }

      // 4. Revertir el estado de los tubos
      for (const d of entrega.detalles) {
        // Fallback para entregas creadas antes de la migración que añadió el campo.
        let estadoAnterior = d.estadoAnterior
        if (!estadoAnterior) {
          const ultimaAudit = await tx.auditoria.findFirst({
            where: { tuboId: d.tuboId, metadata: { path: ['entregaId'], equals: id } },
            orderBy: { createdAt: 'desc' },
          })
          estadoAnterior = ultimaAudit?.estadoAnterior || 'CARGADO'
        }

        // Revertir tubo a estado anterior, sin cliente asignado y ubicación depósito
        await tx.tubo.update({
          where: { id: d.tuboId },
          data: {
            estado:    estadoAnterior,
            clienteId: null,
            ubicacion: 'Depósito'
          }
        })

        // Registrar auditoría de cancelación
        await tx.auditoria.create({
          data: {
            tuboId:         d.tuboId,
            usuarioId:      req.user.id,
            accion:         `Entrega cancelada (Retorno a depósito)`,
            estadoAnterior: 'RESERVADO',
            estadoNuevo:    estadoAnterior,
            observaciones:  `Entrega ${entrega.numero} cancelada. Motivo: ${motivo || 'No especificado'}`,
            metadata:       { entregaId: id, numero: entrega.numero }
          }
        })
      }

      return entregaActualizada
    })

    res.json({ success: true, message: 'Entrega cancelada y cilindros devueltos correctamente', entrega: resultado })
  } catch (err) {
    next(err)
  }
})

export default router
