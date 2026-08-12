// gastubos/backend/src/routes/ventasProductos.js
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import { generarNumero } from '../utils/helpers.js'

const router = Router()
router.use(requireAuth)

const detalleSchema = z.object({
  productoId:     z.string().optional().nullable(),
  descripcion:    z.string().min(1).optional(),
  cantidad:       z.coerce.number().positive().default(1),
  precioUnitario: z.coerce.number().nonnegative().optional(),
}).refine(d => d.productoId || (d.descripcion && d.precioUnitario !== undefined), {
  message: 'Cada ítem debe tener productoId, o una descripción y un precio unitario',
})

const ventaProductoSchema = z.object({
  clienteId:     z.string().optional().nullable(),
  metodoPago:    z.enum(['EFECTIVO', 'TRANSFERENCIA']),
  observaciones: z.string().optional().nullable(),
  detalles:      z.array(detalleSchema).min(1, 'Debe incluir al menos un ítem'),
})

const includeCompleto = {
  cliente: { select: { id: true, nombre: true } },
  usuario: { select: { id: true, nombre: true, username: true } },
  detalles: { include: { producto: { select: { id: true, codigo: true } } } },
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

    // Los precios de ítems de catálogo siempre se toman del maestro (fuente única de verdad);
    // subtotal/total siempre se calculan acá, nunca se confía en lo que mande el cliente.
    let total = 0
    const detallesCreate = data.detalles.map(d => {
      const producto = d.productoId ? productosPorId.get(d.productoId) : null
      const descripcion = producto ? producto.nombre : d.descripcion
      const precioUnitario = producto ? Number(producto.precio) : d.precioUnitario
      const subtotal = Math.round(d.cantidad * precioUnitario * 100) / 100
      total += subtotal
      return {
        productoId: producto ? producto.id : null,
        descripcion,
        cantidad: d.cantidad,
        precioUnitario,
        subtotal,
      }
    })
    total = Math.round(total * 100) / 100

    const numero = await generarNumero('VP')
    const venta = await prisma.ventaProducto.create({
      data: {
        numero,
        clienteId: data.clienteId || null,
        usuarioId: req.user.id,
        metodoPago: data.metodoPago,
        observaciones: data.observaciones,
        total,
        detalles: { create: detallesCreate },
      },
      include: includeCompleto,
    })
    res.status(201).json(venta)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── PATCH /api/venta-productos/:id/cancelar ───────────────────────────────────
router.patch('/:id/cancelar', requireRol('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const venta = await prisma.ventaProducto.findUnique({ where: { id: req.params.id } })
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    if (venta.cancelada) return res.status(400).json({ error: 'La venta ya está cancelada' })

    const actualizada = await prisma.ventaProducto.update({
      where: { id: req.params.id },
      data: { cancelada: true },
      include: includeCompleto,
    })
    res.json(actualizada)
  } catch (err) { next(err) }
})

export default router
