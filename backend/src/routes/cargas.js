// gastubos/backend/src/routes/cargas.js

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import { generarNumero, mapTuboGasToTipoGas } from '../utils/helpers.js'
import { registrarAuditoria } from '../utils/auditoria.js'
import { TRANSICIONES_VALIDAS } from '../utils/estadosTubo.js'

const router = Router()
router.use(requireAuth)

const cargaSchema = z.object({
  tuboId:        z.string().min(1).optional().nullable(),
  tipoGas:       z.enum(['CO2','OXIGENO','ARGON','NITROGENO','AIRE_COMPRIMIDO','MEZCLA_CO2_ARGON','ACETILENO']),
  unidad:        z.enum(['KG','M3']),
  tipoCarga:     z.enum(['NORMAL', 'SALON']).optional().default('NORMAL'),
  cantidad:      z.number().positive(),
  precioUnitario: z.number().nonnegative().optional().default(0),
  fechaCarga:    z.string().datetime(),
  observaciones: z.string().optional(),
  metodoPago:    z.enum(['EFECTIVO', 'TRANSFERENCIA']),
})

const ventaCamionSchema = z.object({
  tuboId:        z.string().min(1),
  clienteId:     z.string().min(1),
  cantidad:      z.number().positive(),
  precioUnitario: z.number().nonnegative(),
  metodoPago:    z.string().optional(),
  montoRecibido: z.coerce.number().optional(),
  observaciones: z.string().optional(),
})

// ─── GET /api/cargas ──────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { tuboId, tipoGas, tipoCarga, operadorId, desde, hasta, page = 1, limit = 50 } = req.query
    const where = {}
    if (tuboId)     where.tuboId     = tuboId
    if (tipoGas)    where.tipoGas    = tipoGas
    if (tipoCarga)  where.tipoCarga  = tipoCarga
    if (operadorId) where.operadorId = operadorId
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
          cliente:  { select: { id: true, nombre: true, ruc: true } },
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
router.post('/', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
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
          tipoCarga:     data.tipoCarga,
          cantidad:      data.cantidad,
          precioUnitario: data.precioUnitario,
          fechaCarga:    new Date(data.fechaCarga),
          operadorId:    req.user.id,
          observaciones: data.observaciones,
          metodoPago:    data.metodoPago,
        },
        include: {
          tubo:     { select: { id: true, serie: true, gas: true } },
          operador: { select: { username: true, nombre: true } },
        },
      })

      if (data.tuboId) {
        await tx.tubo.update({
          where: { id: data.tuboId },
          data:  { estado: 'CARGADO', cantidadActual: data.cantidad },
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

// ─── POST /api/cargas/venta-camion ────────────────────────────────────────────
// Venta fraccionada de gas hecha por el repartidor con el stock de su camión
// (tubos en estado RESERVADO con camionId asignado). Descuenta tubo.cantidadActual;
// si llega a 0, el tubo sale del camión y queda VACIO, listo para su próxima carga.
router.post('/venta-camion', requireRol('REPARTIDOR'), async (req, res, next) => {
  try {
    const data = ventaCamionSchema.parse(req.body)

    const tubo = await prisma.tubo.findUnique({
      where: { id: data.tuboId, activo: true },
      include: { camion: true },
    })
    if (!tubo) return res.status(404).json({ error: 'Tubo no encontrado' })

    if (!tubo.camionId || tubo.camion?.repartidorActualId !== req.user.id) {
      return res.status(403).json({ error: 'Este tubo no está en el camión que tenés seleccionado' })
    }
    // Un tubo asignado a un camión (ver POST /camiones/:id/asignar) queda en RESERVADO,
    // no en CARGADO — CARGADO es solo el estado transitorio mientras está en depósito.
    if (tubo.estado !== 'RESERVADO') {
      return res.status(400).json({ error: `El tubo está en estado ${tubo.estado}, no se puede vender` })
    }
    const cantidadActual = Number(tubo.cantidadActual || 0)
    if (cantidadActual <= 0) {
      return res.status(400).json({ error: 'El tubo no tiene gas disponible para vender' })
    }
    if (data.cantidad > cantidadActual) {
      return res.status(400).json({ error: `Solo quedan ${cantidadActual} disponibles en este tubo` })
    }

    const cliente = await prisma.cliente.findUnique({ where: { id: data.clienteId, activo: true } })
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })

    // Hereda tipo de gas/unidad de la última carga NORMAL del tubo (mismo patrón que entregas.js)
    const ultimaCargaNormal = await prisma.carga.findFirst({
      where: { tuboId: tubo.id, tipoCarga: 'NORMAL' },
      orderBy: { fechaCarga: 'desc' },
    })
    const tipoGas = ultimaCargaNormal?.tipoGas || mapTuboGasToTipoGas(tubo.gas)
    const unidad  = ultimaCargaNormal?.unidad || (tubo.capacidadKg ? 'KG' : 'M3')

    const restante = cantidadActual - data.cantidad
    const seAgota  = restante <= 0

    const numero = await generarNumero('CG')

    const carga = await prisma.$transaction(async (tx) => {
      const nueva = await tx.carga.create({
        data: {
          numero,
          tuboId:        tubo.id,
          tipoGas,
          unidad,
          tipoCarga:     'CAMION',
          cantidad:      data.cantidad,
          precioUnitario: data.precioUnitario,
          fechaCarga:    new Date(),
          operadorId:    req.user.id,
          observaciones: data.observaciones,
          clienteId:     data.clienteId,
          metodoPago:    data.metodoPago,
          montoRecibido: data.montoRecibido,
        },
        include: {
          tubo:     { select: { id: true, serie: true, gas: true, capacidadLitros: true, capacidadKg: true } },
          cliente:  { select: { id: true, nombre: true, ruc: true, telefono: true, direccion: true } },
          operador: { select: { id: true, username: true, nombre: true } },
        },
      })

      await tx.tubo.update({
        where: { id: tubo.id },
        data: seAgota
          ? { cantidadActual: 0, estado: 'VACIO', camionId: null, ubicacion: 'Depósito' }
          : { cantidadActual: restante },
      })

      return nueva
    })

    await registrarAuditoria({
      tuboId:         tubo.id,
      usuarioId:      req.user.id,
      accion:         'Venta desde camión',
      estadoAnterior: seAgota ? 'RESERVADO' : null,
      estadoNuevo:    seAgota ? 'VACIO' : null,
      observaciones:  data.observaciones,
      metadata:       { cargaId: carga.id, numero, clienteId: data.clienteId, cantidad: data.cantidad, restante: seAgota ? 0 : restante },
    })

    res.status(201).json(carga)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

export default router
