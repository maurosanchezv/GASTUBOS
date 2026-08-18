// gastubos/backend/src/routes/movimientosDinero.js
// Vista unificada de todos los movimientos de dinero del negocio (Entregas, Cargas
// y Venta de Productos), pensada exclusivamente para el rol SUPERVISOR: le permite
// ver de un vistazo el origen, la forma de pago, el usuario y el estado de cada
// movimiento de caja, sin tener que entrar a cada módulo por separado.

import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.use(requireRol('ADMIN', 'SUPERVISOR'))

const TIPO_LABEL = {
  ENTREGA:        'Entrega',
  ALQUILER:       'Alquiler',
  VENTA_CILINDRO: 'Venta de cilindro',
  RECARGA:        'Recarga (recambio)',
  VENTA_SALON:    'Venta en salón',
  VENTA_CAMION:   'Venta desde camión',
  VENTA_PRODUCTO: 'Venta de producto',
}

const ESTADO_LABEL = {
  COBRADO:    'Cobrado',
  PARCIAL:    'Cobro parcial',
  PENDIENTE:  'Pendiente de cobro',
  CONFIRMADO: 'Confirmado',
  CANCELADA:  'Cancelada',
}

function normalizarFormaPago(metodoPago) {
  const m = (metodoPago || '').toUpperCase()
  if (m.includes('TRANSFERENCIA') || m.includes('BANCO')) return 'TRANSFERENCIA'
  return 'EFECTIVO'
}

function resolveDateRange(periodo, desde, hasta) {
  const ahora = new Date()
  let startDate, endDate

  if (desde && hasta) {
    startDate = new Date(desde)
    endDate = new Date(hasta)
    if (hasta.length === 10) endDate.setHours(23, 59, 59, 999)
  } else if (periodo === 'semana') {
    startDate = new Date(ahora)
    const day = startDate.getDay()
    const diff = startDate.getDate() - day + (day === 0 ? -6 : 1)
    startDate.setDate(diff)
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(ahora)
    endDate.setHours(23, 59, 59, 999)
  } else if (periodo === 'mes') {
    startDate = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0)
    endDate = new Date(ahora)
    endDate.setHours(23, 59, 59, 999)
  } else {
    startDate = new Date(ahora)
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(ahora)
    endDate.setHours(23, 59, 59, 999)
  }

  return { startDate, endDate }
}

// GET /api/movimientos-dinero?periodo=hoy|semana|mes|custom&desde=&hasta=
router.get('/', async (req, res, next) => {
  try {
    const { periodo = 'hoy', desde, hasta } = req.query
    const { startDate, endDate } = resolveDateRange(periodo, desde, hasta)

    const [entregas, cargas, ventasProductos] = await Promise.all([
      prisma.entrega.findMany({
        where: { fechaEntrega: { gte: startDate, lte: endDate }, metodoPago: { not: null } },
        include: {
          cliente:    { select: { id: true, nombre: true } },
          repartidor: { select: { id: true, nombre: true, username: true } },
          creadoPor:  { select: { id: true, nombre: true, username: true } },
          detalles:   { select: { subtotal: true } },
        },
        orderBy: { fechaEntrega: 'desc' },
      }),

      prisma.carga.findMany({
        // Carga Normal es una recarga interna de depósito sin cobro propio ni ticket
        // (el cobro real ocurre en la Entrega correspondiente); se excluye acá para no
        // duplicar el movimiento de dinero, histórico incluido.
        where: { fechaCarga: { gte: startDate, lte: endDate }, tipoCarga: { not: 'NORMAL' }, metodoPago: { not: null } },
        include: {
          operador: { select: { id: true, nombre: true, username: true } },
          cliente:  { select: { id: true, nombre: true } },
        },
        orderBy: { fechaCarga: 'desc' },
      }),

      prisma.ventaProducto.findMany({
        where: { fechaVenta: { gte: startDate, lte: endDate } },
        include: {
          usuario: { select: { id: true, nombre: true, username: true } },
          cliente: { select: { id: true, nombre: true } },
        },
        orderBy: { fechaVenta: 'desc' },
      }),
    ])

    const movimientos = []

    for (const e of entregas) {
      const tipoKey = e.tipoOperacion === 'ALQUILER' ? 'ALQUILER'
        : e.tipoOperacion === 'VENTA' ? 'VENTA_CILINDRO'
        : 'ENTREGA'

      const subtotalProductos = (e.detalles || []).reduce((sum, d) => sum + Number(d.subtotal || 0), 0)
      const totalOperacion = subtotalProductos + Number(e.costoDelivery || 0)
      const recibido = Number(e.montoRecibido || 0)

      let estado = 'PENDIENTE'
      if (e.cancelada) estado = 'CANCELADA'
      else if (recibido >= totalOperacion && totalOperacion > 0) estado = 'COBRADO'
      else if (recibido > 0) estado = 'PARCIAL'

      movimientos.push({
        id: `entrega-${e.id}`,
        tipo: tipoKey,
        tipoLabel: TIPO_LABEL[tipoKey],
        referencia: e.numero,
        fecha: e.fechaEntrega,
        usuario: e.repartidor?.nombre || e.repartidor?.username || e.creadoPor?.nombre || e.creadoPor?.username || 'Sin asignar',
        cliente: e.cliente?.nombre || 'Sin cliente',
        formaPago: normalizarFormaPago(e.metodoPago),
        monto: recibido,
        estado,
        estadoLabel: ESTADO_LABEL[estado],
      })
    }

    for (const c of cargas) {
      const tipoKey = c.tipoCarga === 'SALON' ? 'VENTA_SALON'
        : c.tipoCarga === 'CAMION' ? 'VENTA_CAMION'
        : 'RECARGA'

      const monto = c.montoRecibido != null
        ? Number(c.montoRecibido)
        : Number(c.cantidad || 0) * Number(c.precioUnitario || 0)

      movimientos.push({
        id: `carga-${c.id}`,
        tipo: tipoKey,
        tipoLabel: TIPO_LABEL[tipoKey],
        referencia: c.numero,
        fecha: c.fechaCarga,
        usuario: c.operador?.nombre || c.operador?.username || 'Sin asignar',
        cliente: c.cliente?.nombre || 'Sin cliente',
        formaPago: normalizarFormaPago(c.metodoPago),
        monto,
        estado: 'CONFIRMADO',
        estadoLabel: ESTADO_LABEL.CONFIRMADO,
      })
    }

    for (const v of ventasProductos) {
      const estado = v.cancelada ? 'CANCELADA' : 'CONFIRMADO'
      movimientos.push({
        id: `venta-producto-${v.id}`,
        tipo: 'VENTA_PRODUCTO',
        tipoLabel: TIPO_LABEL.VENTA_PRODUCTO,
        referencia: v.numero,
        fecha: v.fechaVenta,
        usuario: v.usuario?.nombre || v.usuario?.username || 'Sin asignar',
        cliente: v.cliente?.nombre || 'Sin cliente',
        formaPago: normalizarFormaPago(v.metodoPago),
        monto: Number(v.total),
        estado,
        estadoLabel: ESTADO_LABEL[estado],
      })
    }

    movimientos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

    const resumen = { efectivo: 0, transferencia: 0, total: 0, cantidad: movimientos.length }
    for (const m of movimientos) {
      if (m.estado === 'CANCELADA') continue
      if (m.formaPago === 'TRANSFERENCIA') resumen.transferencia += m.monto
      else resumen.efectivo += m.monto
      resumen.total += m.monto
    }

    res.json({ movimientos, resumen, rango: { startDate, endDate } })
  } catch (err) { next(err) }
})

export default router
