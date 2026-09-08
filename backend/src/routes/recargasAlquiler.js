// gastubos/backend/src/routes/recargasAlquiler.js
//
// Servicio operativo de recarga/recambio a domicilio para un contrato de
// alquiler ACTIVO (OrdenRecargaAlquiler). No es una venta desde camión (eso
// es gas fraccionado sin contrato) ni una entrega genérica — es su propio
// flujo, que reutiliza Cliente/Tubo/Camion/Usuario y la infraestructura
// financiera de ETAPA 1.1 (CargoAlquiler + PagoCargoAlquiler).

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import { generarNumero } from '../utils/helpers.js'
import { completarOrdenRecarga, cancelarOrdenRecarga, ErrorOrdenRecarga } from '../utils/ordenesRecarga.js'

const router = Router()
router.use(requireAuth)

const ESTADOS_ASIGNABLES_REPARTIDOR = ['ASIGNADA', 'EN_RUTA', 'EN_SERVICIO']

const INCLUDE_DETALLE = {
  cliente: { select: { id: true, nombre: true, telefono: true } },
  tubo: { select: { id: true, gas: true, estado: true } },
  tuboNuevo: { select: { id: true, gas: true } },
  repartidor: { select: { id: true, nombre: true, username: true } },
  camion: { select: { id: true, placa: true } },
  alquiler: { select: { id: true, numero: true, plan: { select: { codigo: true, nombre: true } } } },
  cargoAlquiler: true,
}

// ─── POST /api/recargas-alquiler — solicitar ──────────────────────────────
const solicitarSchema = z.object({
  alquilerId: z.string().min(1),
  tipoServicio: z.enum(['RECARGA_MISMO_TUBO', 'RECAMBIO_TUBO']),
  fechaProgramada: z.string().datetime().optional(),
  observaciones: z.string().optional(),
})

router.post('/', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = solicitarSchema.parse(req.body)

    const alquiler = await prisma.alquiler.findUnique({
      where: { id: data.alquilerId },
      include: { cliente: true, entrega: true },
    })
    if (!alquiler) return res.status(404).json({ error: 'Alquiler no encontrado' })
    if (alquiler.estado !== 'ACTIVO') {
      return res.status(400).json({ error: 'Solo se puede solicitar una recarga para un contrato ACTIVO' })
    }

    // Dirección real de la entrega (donde está el equipo) si existe; si no,
    // la dirección registrada del cliente.
    const direccion = alquiler.entrega?.direccionEntrega || alquiler.cliente.direccion || ''
    const latitud   = alquiler.entrega?.latitud   ?? alquiler.cliente.latitud   ?? null
    const longitud  = alquiler.entrega?.longitud  ?? alquiler.cliente.longitud  ?? null

    const numero = await generarNumero('OR')

    const orden = await prisma.$transaction(async (tx) => {
      const nueva = await tx.ordenRecargaAlquiler.create({
        data: {
          numero,
          alquilerId: alquiler.id,
          clienteId: alquiler.clienteId,
          tuboId: alquiler.tuboId,
          tipoServicio: data.tipoServicio,
          estado: 'SOLICITADA',
          precioAplicado: alquiler.precioRecargaAplicado || 0,
          direccion, latitud, longitud,
          fechaProgramada: data.fechaProgramada ? new Date(data.fechaProgramada) : null,
          observaciones: data.observaciones,
          createdById: req.user.id,
        },
        include: INCLUDE_DETALLE,
      })

      await tx.auditoria.create({
        data: {
          usuarioId: req.user.id,
          accion: 'Recarga de alquiler solicitada',
          metadata: { ordenRecargaId: nueva.id, numero, alquilerId: alquiler.id, tipoServicio: data.tipoServicio },
        },
      })

      return nueva
    })

    res.status(201).json(orden)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── GET /api/recargas-alquiler — listado admin ───────────────────────────
router.get('/', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const { estado } = req.query
    const where = {}
    if (estado) where.estado = estado

    const ordenes = await prisma.ordenRecargaAlquiler.findMany({
      where,
      include: INCLUDE_DETALLE,
      orderBy: { fechaSolicitud: 'desc' },
    })
    res.json(ordenes)
  } catch (err) { next(err) }
})

// ─── GET /api/recargas-alquiler/mis-asignaciones — vista del repartidor ──
router.get('/mis-asignaciones', requireRol('REPARTIDOR'), async (req, res, next) => {
  try {
    const ordenes = await prisma.ordenRecargaAlquiler.findMany({
      where: { repartidorId: req.user.id, estado: { in: ESTADOS_ASIGNABLES_REPARTIDOR } },
      include: INCLUDE_DETALLE,
      orderBy: { fechaAsignacion: 'asc' },
    })
    res.json(ordenes)
  } catch (err) { next(err) }
})

// ─── GET /api/recargas-alquiler/:id — detalle ─────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const orden = await prisma.ordenRecargaAlquiler.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_DETALLE,
    })
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    if (req.user.rol === 'REPARTIDOR' && orden.repartidorId !== req.user.id) {
      return res.status(403).json({ error: 'No podés ver una orden que no te fue asignada' })
    }
    res.json(orden)
  } catch (err) { next(err) }
})

// ─── POST /api/recargas-alquiler/:id/asignar ──────────────────────────────
const asignarSchema = z.object({
  repartidorId: z.string().min(1),
  camionId: z.string().optional(),
})

router.post('/:id/asignar', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const data = asignarSchema.parse(req.body)

    const orden = await prisma.ordenRecargaAlquiler.findUnique({ where: { id } })
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    if (orden.estado !== 'SOLICITADA') {
      return res.status(400).json({ error: `No se puede asignar una orden en estado ${orden.estado}` })
    }

    const repartidor = await prisma.usuario.findUnique({ where: { id: data.repartidorId } })
    if (!repartidor || repartidor.rol !== 'REPARTIDOR') {
      return res.status(400).json({ error: 'El usuario indicado no es un repartidor válido' })
    }

    // Si no se indica camión explícito, se reutiliza el que el repartidor ya
    // tiene seleccionado (ver POST /camiones/:id/seleccionar) — no se inventa
    // un catálogo de rutas nuevo.
    let camionId = data.camionId || null
    if (!camionId) {
      const camionActual = await prisma.camion.findFirst({ where: { repartidorActualId: data.repartidorId } })
      camionId = camionActual?.id || null
    }

    const actualizada = await prisma.$transaction(async (tx) => {
      const upd = await tx.ordenRecargaAlquiler.update({
        where: { id },
        data: { estado: 'ASIGNADA', repartidorId: data.repartidorId, camionId, fechaAsignacion: new Date() },
        include: INCLUDE_DETALLE,
      })
      await tx.auditoria.create({
        data: {
          usuarioId: req.user.id,
          accion: 'Recarga de alquiler asignada',
          metadata: { ordenRecargaId: id, numero: orden.numero, repartidorId: data.repartidorId, camionId },
        },
      })
      return upd
    })

    res.json(actualizada)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── POST /api/recargas-alquiler/:id/iniciar ──────────────────────────────
// El repartidor arranca el servicio. Un solo botón cubre "salir hacia allá" y
// "llegué" (ver nota de diseño en ordenesRecarga.js) — completar() se encarga
// de sellar fechaInicioServicio si todavía no estaba seteada.
router.post('/:id/iniciar', requireRol('REPARTIDOR', 'ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const orden = await prisma.ordenRecargaAlquiler.findUnique({ where: { id } })
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    if (req.user.rol === 'REPARTIDOR' && orden.repartidorId !== req.user.id) {
      return res.status(403).json({ error: 'Esta orden no te fue asignada' })
    }
    if (orden.estado !== 'ASIGNADA') {
      return res.status(400).json({ error: `No se puede iniciar una orden en estado ${orden.estado}` })
    }

    const actualizada = await prisma.$transaction(async (tx) => {
      const upd = await tx.ordenRecargaAlquiler.update({
        where: { id },
        data: { estado: 'EN_RUTA' },
        include: INCLUDE_DETALLE,
      })
      await tx.auditoria.create({
        data: { usuarioId: req.user.id, accion: 'Recarga de alquiler iniciada', metadata: { ordenRecargaId: id, numero: orden.numero } },
      })
      return upd
    })

    res.json(actualizada)
  } catch (err) { next(err) }
})

// ─── POST /api/recargas-alquiler/:id/completar ────────────────────────────
const completarSchema = z.object({
  tuboNuevoId: z.string().optional(),      // requerido si RECAMBIO_TUBO
  metodoPago: z.enum(['EFECTIVO', 'TRANSFERENCIA']).optional(),
  montoPagado: z.coerce.number().nonnegative().optional().default(0),
})

router.post('/:id/completar', requireRol('REPARTIDOR', 'ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const data = completarSchema.parse(req.body)

    const ordenPrevia = await prisma.ordenRecargaAlquiler.findUnique({ where: { id } })
    if (!ordenPrevia) return res.status(404).json({ error: 'Orden no encontrada' })
    if (req.user.rol === 'REPARTIDOR' && ordenPrevia.repartidorId !== req.user.id) {
      return res.status(403).json({ error: 'Esta orden no te fue asignada' })
    }
    if (data.montoPagado > 0 && !data.metodoPago) {
      return res.status(400).json({ error: 'Indicá la forma de pago si vas a registrar un cobro' })
    }

    let resultado
    try {
      resultado = await prisma.$transaction(tx => completarOrdenRecarga(tx, {
        ordenId: id,
        usuarioId: req.user.id,
        tuboNuevoId: data.tuboNuevoId,
        metodoPago: data.montoPagado > 0 ? data.metodoPago : null,
        montoPagado: data.montoPagado,
      }))
    } catch (err) {
      if (err instanceof ErrorOrdenRecarga) return res.status(err.status).json({ error: err.message })
      throw err
    }

    const ordenCompleta = await prisma.ordenRecargaAlquiler.findUnique({ where: { id }, include: INCLUDE_DETALLE })
    res.json({ ...resultado, orden: ordenCompleta })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── POST /api/recargas-alquiler/:id/cancelar ─────────────────────────────
router.post('/:id/cancelar', requireRol('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { motivo } = req.body || {}

    let actualizada
    try {
      actualizada = await prisma.$transaction(tx => cancelarOrdenRecarga(tx, { ordenId: id, motivo, usuarioId: req.user.id }))
    } catch (err) {
      if (err instanceof ErrorOrdenRecarga) return res.status(err.status).json({ error: err.message })
      throw err
    }

    res.json(actualizada)
  } catch (err) { next(err) }
})

export default router
