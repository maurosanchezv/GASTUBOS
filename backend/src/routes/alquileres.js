// gastubos/backend/src/routes/alquileres.js

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import {
  calcularNivelAlerta,
  generarMensualidadesPendientes,
  registrarPagoCargo,
  anularCargo,
  ErrorPagoAlquiler,
} from '../utils/alquilerCargos.js'

const router = Router()
router.use(requireAuth)

function saldoPendiente(cargos) {
  return cargos
    .filter(c => c.estado !== 'ANULADO')
    .reduce((sum, c) => sum + (Number(c.monto) - Number(c.montoPagado)), 0)
}

// GET /api/alquileres — con filtro por estado (contrato) y cliente
router.get('/', async (req, res, next) => {
  try {
    const { estado, clienteId } = req.query
    const where = {}
    if (estado)    where.estado    = estado
    if (clienteId) where.clienteId = clienteId

    const alquileres = await prisma.alquiler.findMany({
      where,
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true } },
        tubo:    { select: { id: true, gas: true } },
        plan:    { select: { id: true, codigo: true, nombre: true } },
        cargos:  { where: { estado: { not: 'ANULADO' } }, select: { monto: true, montoPagado: true, estado: true } },
      },
      orderBy: { fechaVencimiento: 'asc' },
    })

    // Nada de mezclar contrato y finanzas acá: `estado` es el estado del
    // contrato tal cual está en la base, `estadoFinanciero` (persistido, ya
    // viene en `a`) es lo financiero. nivelAlerta y saldoPendiente son el
    // agregado para el panel.
    const resultado = alquileres.map(a => ({
      ...a,
      nivelAlerta: calcularNivelAlerta(a.fechaVencimiento),
      saldoPendiente: saldoPendiente(a.cargos),
    }))

    res.json(resultado)
  } catch (err) { next(err) }
})

// GET /api/alquileres/vencidos — solo los financieramente vencidos (alertas del dashboard)
router.get('/vencidos', async (req, res, next) => {
  try {
    const vencidos = await prisma.alquiler.findMany({
      where: { estado: 'ACTIVO', estadoFinanciero: 'VENCIDO' },
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true } },
        tubo:    { select: { id: true, gas: true } },
      },
      orderBy: { fechaVencimiento: 'asc' },
    })
    res.json(vencidos)
  } catch (err) { next(err) }
})

// GET /api/alquileres/indicadores — resumen para las tarjetas superiores del panel
router.get('/indicadores', async (req, res, next) => {
  try {
    const CARGOS_ABIERTOS = ['PENDIENTE', 'PARCIAL', 'VENCIDO']

    const [activos, proximosAVencer, mensualidadesPendientes, mensualidadesVencidas, cargosPendientesTotales] = await Promise.all([
      prisma.alquiler.count({ where: { estado: 'ACTIVO' } }),
      prisma.alquiler.count({ where: { estado: 'ACTIVO', estadoFinanciero: 'PROXIMO_VENCIMIENTO' } }),
      // Exclusivamente tipo MENSUALIDAD — INICIAL/RECARGA_DOMICILIO/OTRO no cuentan acá.
      prisma.cargoAlquiler.count({ where: { tipo: 'MENSUALIDAD', estado: { in: ['PENDIENTE', 'PARCIAL'] } } }),
      prisma.cargoAlquiler.count({ where: { tipo: 'MENSUALIDAD', estado: 'VENCIDO' } }),
      // Total de cargos abiertos de cualquier tipo — sí puede incluir todos.
      prisma.cargoAlquiler.count({ where: { estado: { in: CARGOS_ABIERTOS } } }),
    ])

    const cargosAbiertos = await prisma.cargoAlquiler.findMany({
      where: { estado: { in: CARGOS_ABIERTOS } },
      select: { monto: true, montoPagado: true },
    })
    const saldoTotalPendiente = saldoPendiente(cargosAbiertos.map(c => ({ ...c, estado: 'PENDIENTE' })))

    res.json({
      activos,
      proximosAVencer,
      mensualidadesPendientes,
      mensualidadesVencidas,
      cargosPendientesTotales,
      saldoTotalPendiente,
      equiposEnClientes: activos, // 1 alquiler ACTIVO = 1 tubo actualmente en manos del cliente
    })
  } catch (err) { next(err) }
})

// GET /api/alquileres/:id — detalle completo del contrato
router.get('/:id', async (req, res, next) => {
  try {
    const alquiler = await prisma.alquiler.findUnique({
      where: { id: req.params.id },
      include: {
        cliente: true,
        tubo:    { select: { id: true, gas: true, estado: true } },
        plan:    true,
        entrega: { select: { id: true, numero: true, direccionEntrega: true, fechaEntrega: true } },
        cargos:  {
          orderBy: { periodoDesde: 'asc' },
          include: {
            pagos: {
              orderBy: { fechaPago: 'asc' },
              include: { usuario: { select: { id: true, nombre: true, username: true } } },
            },
          },
        },
        // ETAPA 2: historial de tubos del contrato y servicios de recarga/recambio.
        tubosHistorial: {
          orderBy: { fechaDesde: 'asc' },
          include: { tubo: { select: { id: true, gas: true } } },
        },
        ordenesRecarga: {
          orderBy: { fechaSolicitud: 'desc' },
          include: {
            tubo:       { select: { id: true, gas: true } },
            tuboNuevo:  { select: { id: true, gas: true } },
            repartidor: { select: { id: true, nombre: true, username: true } },
          },
        },
      },
    })
    if (!alquiler) return res.status(404).json({ error: 'Alquiler no encontrado' })

    res.json({
      ...alquiler,
      nivelAlerta: calcularNivelAlerta(alquiler.fechaVencimiento),
      saldoPendiente: saldoPendiente(alquiler.cargos),
    })
  } catch (err) { next(err) }
})

// POST /api/alquileres/generar-mensualidades
// Función central idempotente: crea las mensualidades que falten y refresca
// el estado financiero de todos los contratos. Pensada para invocarse desde
// este botón administrativo hoy, y desde un cron más adelante — sin cambios.
router.post('/generar-mensualidades', requireRol('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const resumen = await prisma.$transaction(tx => generarMensualidadesPendientes(tx))

    if (resumen.mensualidadesCreadas > 0) {
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user.id,
          accion: 'Generación de mensualidades de alquiler',
          observaciones: `${resumen.mensualidadesCreadas} mensualidad(es) creada(s), ${resumen.alquileresActualizados} contrato(s) actualizado(s)`,
          metadata: resumen,
        },
      })
    }

    res.json(resumen)
  } catch (err) { next(err) }
})

// POST /api/alquileres/:id/cargos/:cargoId/pagar
const pagoSchema = z.object({
  montoPagado: z.coerce.number().positive(),
  metodoPago:  z.enum(['EFECTIVO', 'TRANSFERENCIA']),
  fechaPago:   z.string().datetime().optional(),
  observacion: z.string().optional(),
})

router.post('/:id/cargos/:cargoId/pagar', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const { id, cargoId } = req.params
    const data = pagoSchema.parse(req.body)

    const cargoExistente = await prisma.cargoAlquiler.findUnique({ where: { id: cargoId } })
    if (!cargoExistente || cargoExistente.alquilerId !== id) {
      return res.status(404).json({ error: 'Cargo no encontrado' })
    }

    let resultado
    try {
      resultado = await prisma.$transaction(tx => registrarPagoCargo(tx, {
        cargoAlquilerId: cargoId,
        monto: data.montoPagado,
        metodoPago: data.metodoPago,
        fechaPago: data.fechaPago ? new Date(data.fechaPago) : new Date(),
        observacion: data.observacion,
        usuarioId: req.user.id,
      }))
    } catch (err) {
      if (err instanceof ErrorPagoAlquiler) {
        await prisma.auditoria.create({
          data: {
            usuarioId: req.user.id,
            accion: 'Intento de pago rechazado',
            observaciones: err.message,
            metadata: { alquilerId: id, cargoAlquilerId: cargoId, tipo: cargoExistente.tipo, montoIntentado: data.montoPagado },
          },
        })
        return res.status(err.status).json({ error: err.message })
      }
      throw err
    }

    // Auditoría del pago exitoso, fuera de la transacción del pago en sí —
    // así queda registrada incluso si algo posterior fallara.
    await prisma.auditoria.create({
      data: {
        usuarioId: req.user.id,
        accion: `Pago registrado (${resultado.cargo.tipo})`,
        observaciones: `Gs. ${resultado.pago.monto} vía ${resultado.pago.metodoPago}`,
        metadata: {
          alquilerId: id, cargoAlquilerId: cargoId, pagoId: resultado.pago.id,
          tipo: resultado.cargo.tipo, monto: Number(resultado.pago.monto),
        },
      },
    })

    res.json(resultado)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// POST /api/alquileres/:id/cargos/:cargoId/anular
router.post('/:id/cargos/:cargoId/anular', requireRol('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const { id, cargoId } = req.params
    const { motivo } = req.body || {}

    const cargoExistente = await prisma.cargoAlquiler.findUnique({ where: { id: cargoId } })
    if (!cargoExistente || cargoExistente.alquilerId !== id) {
      return res.status(404).json({ error: 'Cargo no encontrado' })
    }

    let actualizado
    try {
      actualizado = await prisma.$transaction(tx => anularCargo(tx, { cargoAlquilerId: cargoId, motivo }))
    } catch (err) {
      if (err instanceof ErrorPagoAlquiler) {
        await prisma.auditoria.create({
          data: {
            usuarioId: req.user.id,
            accion: 'Intento de anulación de cargo rechazado',
            observaciones: err.message,
            metadata: { alquilerId: id, cargoAlquilerId: cargoId, tipo: cargoExistente.tipo },
          },
        })
        return res.status(err.status).json({ error: err.message })
      }
      throw err
    }

    await prisma.auditoria.create({
      data: {
        usuarioId: req.user.id,
        accion: `Cargo de alquiler anulado (${actualizado.tipo})`,
        observaciones: motivo || null,
        metadata: { alquilerId: id, cargoAlquilerId: cargoId, tipo: actualizado.tipo },
      },
    })

    res.json(actualizado)
  } catch (err) { next(err) }
})

export default router
