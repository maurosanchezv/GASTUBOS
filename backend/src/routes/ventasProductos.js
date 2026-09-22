// gastubos/backend/src/routes/ventasProductos.js
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import { generarNumero } from '../utils/helpers.js'
import { registrarPagoVentaProducto, parsearFechaVencimiento, ErrorPagoVentaProducto, detalleVentaProductoSchema, calcularDetallesVenta } from '../utils/ventaProducto.js'
import { registrarAuditoria } from '../utils/auditoria.js'

const router = Router()
router.use(requireAuth)

const ventaProductoSchema = z.object({
  clienteId:        z.string().optional().nullable(),
  metodoPago:       z.enum(['EFECTIVO', 'TRANSFERENCIA', 'CREDITO']),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional().nullable(),
  observaciones:    z.string().optional().nullable(),
  detalles:         z.array(detalleVentaProductoSchema).min(1, 'Debe incluir al menos un ítem'),
}).refine(data => data.metodoPago !== 'CREDITO' || !!data.clienteId, {
  message: 'Debe seleccionar un cliente para vender a crédito',
  path: ['clienteId'],
}).refine(data => !data.fechaVencimiento || data.metodoPago === 'CREDITO', {
  message: 'Solo las ventas a crédito admiten fecha de vencimiento',
  path: ['fechaVencimiento'],
})

const includeCompleto = {
  cliente: { select: { id: true, nombre: true, ruc: true } },
  usuario: { select: { id: true, nombre: true, username: true } },
  detalles: { include: { producto: { select: { id: true, codigo: true } } } },
  pagos: {
    include: { usuario: { select: { id: true, nombre: true, username: true } } },
    orderBy: { fechaPago: 'desc' },
  },
}

// ─── GET /api/venta-productos ──────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { clienteId, metodoPago } = req.query
    const where = {}
    if (clienteId)  where.clienteId  = clienteId
    if (metodoPago) where.metodoPago = metodoPago

    const ventas = await prisma.ventaProducto.findMany({
      where,
      include: includeCompleto,
      orderBy: { fechaVenta: 'desc' },
    })
    res.json(ventas)
  } catch (err) { next(err) }
})

// ─── GET /api/venta-productos/:id ──────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const venta = await prisma.ventaProducto.findUnique({
      where: { id: req.params.id },
      include: includeCompleto,
    })
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    res.json(venta)
  } catch (err) { next(err) }
})

// ─── POST /api/venta-productos ─────────────────────────────────────────────────
router.post('/', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = ventaProductoSchema.parse(req.body)

    let fechaVencimiento
    try {
      fechaVencimiento = parsearFechaVencimiento(data.fechaVencimiento)
    } catch (err) {
      if (err instanceof ErrorPagoVentaProducto) return res.status(err.status).json({ error: err.message })
      throw err
    }

    const productoIds = [...new Set(data.detalles.map(d => d.productoId).filter(Boolean))]
    const productos = productoIds.length
      ? await prisma.producto.findMany({ where: { id: { in: productoIds } } })
      : []
    if (productos.length !== productoIds.length) {
      return res.status(400).json({ error: 'Uno o más productos no existen' })
    }
    const productosPorId = new Map(productos.map(p => [p.id, p]))

    if (data.clienteId) {
      const cliente = await prisma.cliente.findUnique({ where: { id: data.clienteId } })
      if (!cliente) return res.status(400).json({ error: 'Cliente no encontrado' })
    }

    const { detallesCreate, total } = calcularDetallesVenta(data.detalles, productosPorId)

    const numero = await generarNumero('VP')
    // Registrar la venta y descontar el stock de los productos de catálogo
    // vendidos en la misma transacción: si el descuento de stock falla, la
    // venta tampoco debe quedar creada. Los productos con stock null no
    // llevan control de inventario (ver ProductosPage) y se dejan sin tocar.
    const venta = await prisma.$transaction(async (tx) => {
      const creada = await tx.ventaProducto.create({
        data: {
          numero,
          clienteId: data.clienteId || null,
          usuarioId: req.user.id,
          metodoPago: data.metodoPago,
          fechaVencimiento,
          observaciones: data.observaciones,
          total,
          detalles: { create: detallesCreate },
        },
        include: includeCompleto,
      })

      for (const d of detallesCreate) {
        if (!d.productoId) continue
        if (productosPorId.get(d.productoId).stock === null) continue
        await tx.producto.update({
          where: { id: d.productoId },
          data: { stock: { decrement: Math.round(d.cantidad) } },
        })
      }

      return creada
    })
    res.status(201).json(venta)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── POST /api/venta-productos/:id/pagar (cobro de venta a crédito) ───────────
const pagoSchema = z.object({
  monto:       z.coerce.number().positive(),
  metodoPago:  z.enum(['EFECTIVO', 'TRANSFERENCIA']),
  observacion: z.string().optional().nullable(),
})

router.post('/:id/pagar', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = pagoSchema.parse(req.body)

    let resultado
    try {
      resultado = await prisma.$transaction(tx => registrarPagoVentaProducto(tx, {
        ventaProductoId: req.params.id,
        monto: data.monto,
        metodoPago: data.metodoPago,
        observacion: data.observacion,
        usuarioId: req.user.id,
      }))
    } catch (err) {
      if (err instanceof ErrorPagoVentaProducto) return res.status(err.status).json({ error: err.message })
      throw err
    }

    const venta = await prisma.ventaProducto.findUnique({ where: { id: req.params.id }, include: includeCompleto })
    res.json({ venta, pago: resultado.pago })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── PATCH /api/venta-productos/:id/vencimiento (editar fecha de vencimiento) ──
const vencimientoSchema = z.object({
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').nullable(),
})

router.patch('/:id/vencimiento', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = vencimientoSchema.parse(req.body)

    const venta = await prisma.ventaProducto.findUnique({ where: { id: req.params.id } })
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    if (venta.cancelada) return res.status(400).json({ error: 'La venta está cancelada' })
    if (venta.metodoPago !== 'CREDITO') return res.status(400).json({ error: 'Solo las ventas a crédito admiten fecha de vencimiento' })
    if (Number(venta.montoCobrado) >= Number(venta.total)) {
      return res.status(400).json({ error: 'La venta ya está totalmente cobrada' })
    }

    let fechaVencimiento
    try {
      fechaVencimiento = parsearFechaVencimiento(data.fechaVencimiento)
    } catch (err) {
      if (err instanceof ErrorPagoVentaProducto) return res.status(err.status).json({ error: err.message })
      throw err
    }

    const anterior = venta.fechaVencimiento ? venta.fechaVencimiento.toISOString().slice(0, 10) : null
    const nueva = fechaVencimiento ? fechaVencimiento.toISOString().slice(0, 10) : null

    const actualizada = await prisma.ventaProducto.update({
      where: { id: req.params.id },
      data: { fechaVencimiento },
      include: includeCompleto,
    })

    await registrarAuditoria({
      usuarioId: req.user.id,
      accion: 'Vencimiento de crédito modificado',
      observaciones: `Venta ${venta.numero}`,
      metadata: { ventaProductoId: venta.id, numero: venta.numero, anterior, nueva },
    })

    res.json(actualizada)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── PATCH /api/venta-productos/:id/cancelar ───────────────────────────────────
router.patch('/:id/cancelar', requireRol('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const venta = await prisma.ventaProducto.findUnique({
      where: { id: req.params.id },
      include: { detalles: true, _count: { select: { pagos: true } } },
    })
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    if (venta.cancelada) return res.status(400).json({ error: 'La venta ya está cancelada' })
    if (venta._count.pagos > 0) {
      return res.status(400).json({ error: 'No se puede cancelar una venta que ya tiene cobros registrados' })
    }

    // Reponer el stock descontado al vender, en la misma transacción que la
    // cancelación. Los productos con stock null nunca se descontaron (no
    // llevan control de inventario), así que tampoco se reponen.
    const actualizada = await prisma.$transaction(async (tx) => {
      const upd = await tx.ventaProducto.update({
        where: { id: req.params.id },
        data: { cancelada: true },
        include: includeCompleto,
      })

      for (const d of venta.detalles) {
        if (!d.productoId) continue
        const producto = await tx.producto.findUnique({ where: { id: d.productoId } })
        if (!producto || producto.stock === null) continue
        await tx.producto.update({
          where: { id: d.productoId },
          data: { stock: { increment: Math.round(Number(d.cantidad)) } },
        })
      }

      return upd
    })
    res.json(actualizada)
  } catch (err) { next(err) }
})

export default router
