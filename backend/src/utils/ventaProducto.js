// gastubos/backend/src/utils/ventaProducto.js
//
// Lógica de cobro de una venta de producto a crédito. Mismo patrón que
// alquilerCargos.js (registrarPagoCargo): VentaProducto no tiene un estado de
// cobro propio, se deriva de montoCobrado vs. total (ver estadoCreditoVenta).

import { z } from 'zod'
import { diasHasta } from './fechas.js'

// Error tipado: la ruta HTTP lo usa para devolver el status/mensaje correctos
// sin tener que inspeccionar el texto del error.
export class ErrorPagoVentaProducto extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'ErrorPagoVentaProducto'
    this.status = status
  }
}

// Un ítem de venta: producto de catálogo (productoId) o ítem libre
// (descripcion + precioUnitario). Compartido por ventasProductos.js y por
// el "Agregar productos" de entregas.js.
export const detalleVentaProductoSchema = z.object({
  productoId:     z.string().optional().nullable(),
  descripcion:    z.string().min(1).optional(),
  cantidad:       z.coerce.number().positive().default(1),
  precioUnitario: z.coerce.number().nonnegative().optional(),
}).refine(d => d.productoId || (d.descripcion && d.precioUnitario !== undefined), {
  message: 'Cada ítem debe tener productoId, o una descripción y un precio unitario',
})

// Calcula descripción/precio/subtotal de cada ítem y el total de la venta.
// Los precios de ítems de catálogo siempre se toman del maestro (fuente
// única de verdad); nunca se confía en lo que mande el cliente si hay
// productoId.
export function calcularDetallesVenta(detalles, productosPorId) {
  let total = 0
  const detallesCreate = detalles.map(d => {
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
  return { detallesCreate, total }
}

// Convierte 'YYYY-MM-DD' a medianoche UTC. null/undefined → sin vencimiento.
// Rechaza fechas inválidas y fechas ya pasadas, con 1 día de tolerancia:
// pasadas las 21:00 en Paraguay (UTC-3), el "hoy" del usuario ya es "mañana"
// en UTC, y sin esa tolerancia se rechazaría un "hoy" válido.
export function parsearFechaVencimiento(valor) {
  if (valor === undefined || valor === null || valor === '') return null
  const fecha = new Date(valor + 'T00:00:00.000Z')
  if (Number.isNaN(fecha.getTime())) throw new ErrorPagoVentaProducto('Fecha de vencimiento inválida')
  if (diasHasta(fecha) < -1) throw new ErrorPagoVentaProducto('La fecha de vencimiento no puede ser una fecha pasada')
  return fecha
}

// PENDIENTE si no se cobró nada, PARCIAL si se cobró algo, COBRADO si el
// saldo llegó a 0. Estado derivado, no guardado.
export function estadoCreditoVenta(venta) {
  const cobrado = Number(venta.montoCobrado)
  if (cobrado <= 0) return 'PENDIENTE'
  if (cobrado >= Number(venta.total)) return 'COBRADO'
  return 'PARCIAL'
}

// ─── Registrar un pago sobre una venta a crédito ───────────────────────────
// Fuente de verdad del dinero: crea un PagoVentaProducto (nunca pisa uno
// anterior) y mantiene VentaProducto.montoCobrado como acumulado/cache.
// Nunca recorta el monto en silencio: si supera el saldo pendiente, rechaza
// la operación completa — no crea el pago ni toca la venta.
export async function registrarPagoVentaProducto(tx, { ventaProductoId, monto, metodoPago, fechaPago, observacion, usuarioId }) {
  const venta = await tx.ventaProducto.findUnique({ where: { id: ventaProductoId } })
  if (!venta) throw new ErrorPagoVentaProducto('Venta no encontrada', 404)
  if (venta.cancelada) throw new ErrorPagoVentaProducto('La venta está cancelada')
  if (venta.metodoPago !== 'CREDITO') throw new ErrorPagoVentaProducto('Solo las ventas a crédito admiten cobros')

  const montoNum = Number(monto)
  const saldo = Number(venta.total) - Number(venta.montoCobrado)
  if (saldo <= 0) throw new ErrorPagoVentaProducto('La venta ya está totalmente cobrada')
  if (montoNum > saldo) throw new ErrorPagoVentaProducto('El monto supera el saldo pendiente')

  const fechaPagoFinal = fechaPago || new Date()

  const pago = await tx.pagoVentaProducto.create({
    data: { ventaProductoId, monto: montoNum, metodoPago, fechaPago: fechaPagoFinal, observacion, usuarioId },
  })

  const ventaActualizada = await tx.ventaProducto.update({
    where: { id: ventaProductoId },
    data: { montoCobrado: Number(venta.montoCobrado) + montoNum },
  })

  return { venta: ventaActualizada, pago }
}
