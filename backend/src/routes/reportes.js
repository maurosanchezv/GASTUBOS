// gastubos/backend/src/routes/reportes.js

import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
router.use(requireRol('ADMIN', 'SUPERVISOR'))

// GET /api/reportes/resumen?periodo=hoy|semana|mes|custom&desde=&hasta=
router.get('/resumen', async (req, res, next) => {
  try {
    const { periodo = 'hoy', desde, hasta } = req.query
    const ahora = new Date()
    let startDate, endDate

    if (desde && hasta) {
      startDate = new Date(desde)
      endDate = new Date(hasta)
      if (hasta.length === 10) {
        endDate.setHours(23, 59, 59, 999)
      }
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
      // Por defecto HOY
      startDate = new Date(ahora)
      startDate.setHours(0, 0, 0, 0)
      endDate = new Date(ahora)
      endDate.setHours(23, 59, 59, 999)
    }

    const [entregas, cargas, porEstado, alquileresVencidos, tercerosPendientes] = await Promise.all([
      prisma.entrega.findMany({
        where: {
          fechaEntrega: { gte: startDate, lte: endDate },
        },
        include: {
          cliente: { select: { id: true, nombre: true, ruc: true, tipo: true } },
          repartidor: { select: { id: true, nombre: true, username: true } },
          detalles: {
            select: {
              id: true,
              subtotal: true,
              cantidadGas: true,
              unidadGas: true,
              precioUnitario: true,
              tuboId: true,
            }
          }
        },
        orderBy: { fechaEntrega: 'desc' },
      }),

      prisma.carga.findMany({
        where: {
          fechaCarga: { gte: startDate, lte: endDate }
        },
        include: {
          operador: { select: { id: true, nombre: true, username: true } },
          tubo: { select: { id: true, gas: true } },
          cliente: { select: { id: true, nombre: true } }
        },
        orderBy: { fechaCarga: 'desc' }
      }),

      prisma.tubo.groupBy({
        by: ['estado'],
        where: { activo: true },
        _count: { estado: true },
      }),

      prisma.alquiler.count({
        where: { estado: 'ACTIVO', fechaVencimiento: { lt: ahora } },
      }),

      prisma.cilindroTerceroInfo.count({
        where: { estado: 'PENDIENTE' }
      })
    ])

    // KPI Metrics calculation
    let totalFacturado = 0
    let montoRecibido = 0
    let entregasConcretadas = 0
    let entregasCanceladas = 0

    const entregasProcesadas = entregas.map(e => {
      const subtotalProductos = (e.detalles || []).reduce((sum, d) => sum + Number(d.subtotal || 0), 0)
      const delivery = Number(e.costoDelivery || 0)
      const totalOperacion = subtotalProductos + delivery
      const recibido = Number(e.montoRecibido || 0)

      let estadoCobro = 'PENDIENTE'
      if (e.cancelada) {
        estadoCobro = 'NO_CONCRETADO'
        entregasCanceladas++
      } else {
        if (e.confirmada) entregasConcretadas++
        if (recibido >= totalOperacion && totalOperacion > 0) {
          estadoCobro = 'COBRADO'
        } else if (recibido > 0) {
          estadoCobro = 'PARCIAL'
        } else {
          estadoCobro = 'PENDIENTE'
        }

        totalFacturado += totalOperacion
        montoRecibido += recibido
      }

      return {
        id: e.id,
        numero: e.numero,
        fechaEntrega: e.fechaEntrega,
        clienteNombre: e.cliente?.nombre || 'Cliente sin nombre',
        repartidorNombre: e.repartidor?.nombre || e.repartidor?.username || 'Sin repartidor',
        tipoOperacion: e.tipoOperacion,
        subtotalProductos,
        costoDelivery: delivery,
        totalOperacion,
        montoRecibido: recibido,
        metodoPago: e.metodoPago || 'NO_ESPECIFICADO',
        confirmada: e.confirmada,
        cancelada: e.cancelada,
        estadoCobro
      }
    })

    // Agrupación de Cargas (entradas de stock: NORMAL/SALON) por Tipo de Gas y Unidad
    const cargasGroupMap = {}
    cargas.filter(c => c.tipoCarga !== 'CAMION').forEach(c => {
      const key = `${c.tipoGas}_${c.unidad}`
      if (!cargasGroupMap[key]) {
        cargasGroupMap[key] = {
          tipoGas: c.tipoGas,
          unidad: c.unidad,
          conteo: 0,
          cantidadTotal: 0,
          valorTotal: 0
        }
      }
      const cant = Number(c.cantidad || 0)
      const prec = Number(c.precioUnitario || 0)
      cargasGroupMap[key].conteo += 1
      cargasGroupMap[key].cantidadTotal += cant
      cargasGroupMap[key].valorTotal += cant * prec
    })

    const cargasPorGas = Object.values(cargasGroupMap).map(g => ({
      ...g,
      promedioCarga: g.conteo > 0 ? (g.cantidadTotal / g.conteo) : 0
    }))

    // Ventas fraccionadas desde camión (tipoCarga=CAMION), agrupadas igual que cargasPorGas
    const ventasCamionGroupMap = {}
    const cargasCamion = cargas.filter(c => c.tipoCarga === 'CAMION')
    cargasCamion.forEach(c => {
      const key = `${c.tipoGas}_${c.unidad}`
      if (!ventasCamionGroupMap[key]) {
        ventasCamionGroupMap[key] = {
          tipoGas: c.tipoGas,
          unidad: c.unidad,
          conteo: 0,
          cantidadTotal: 0,
          valorTotal: 0
        }
      }
      const cant = Number(c.cantidad || 0)
      const prec = Number(c.precioUnitario || 0)
      ventasCamionGroupMap[key].conteo += 1
      ventasCamionGroupMap[key].cantidadTotal += cant
      ventasCamionGroupMap[key].valorTotal += cant * prec
    })

    const ventasCamion = Object.values(ventasCamionGroupMap)

    // Rendición por repartidor
    const repartidoresMap = {}
    entregas.filter(e => !e.cancelada).forEach(e => {
      const rId = e.repartidorId || 'SIN_ASIGNAR'
      const rNombre = e.repartidor?.nombre || e.repartidor?.username || 'Sin asignación'
      if (!repartidoresMap[rId]) {
        repartidoresMap[rId] = {
          repartidorId: rId,
          repartidorNombre: rNombre,
          entregasCount: 0,
          totalFacturado: 0,
          montoRecibido: 0,
          efectivo: 0,
          transferencia: 0,
          otrosMetodos: 0,
          saldoPendiente: 0
        }
      }
      const subtotalProductos = (e.detalles || []).reduce((sum, d) => sum + Number(d.subtotal || 0), 0)
      const totalOperacion = subtotalProductos + Number(e.costoDelivery || 0)
      const recibido = Number(e.montoRecibido || 0)
      const metodo = (e.metodoPago || '').toUpperCase()

      repartidoresMap[rId].entregasCount += 1
      repartidoresMap[rId].totalFacturado += totalOperacion
      repartidoresMap[rId].montoRecibido += recibido

      if (metodo.includes('EFECTIVO')) {
        repartidoresMap[rId].efectivo += recibido
      } else if (metodo.includes('TRANSFERENCIA') || metodo.includes('BANCO')) {
        repartidoresMap[rId].transferencia += recibido
      } else {
        repartidoresMap[rId].otrosMetodos += recibido
      }

      repartidoresMap[rId].saldoPendiente += Math.max(0, totalOperacion - recibido)
    })

    // Sumar ventas fraccionadas desde camión a la misma rendición por repartidor
    cargasCamion.forEach(c => {
      const rId = c.operadorId || 'SIN_ASIGNAR'
      const rNombre = c.operador?.nombre || c.operador?.username || 'Sin asignación'
      if (!repartidoresMap[rId]) {
        repartidoresMap[rId] = {
          repartidorId: rId,
          repartidorNombre: rNombre,
          entregasCount: 0,
          totalFacturado: 0,
          montoRecibido: 0,
          efectivo: 0,
          transferencia: 0,
          otrosMetodos: 0,
          saldoPendiente: 0
        }
      }
      const totalOperacion = Number(c.cantidad || 0) * Number(c.precioUnitario || 0)
      const recibido = Number(c.montoRecibido || 0)
      const metodo = (c.metodoPago || '').toUpperCase()

      repartidoresMap[rId].totalFacturado += totalOperacion
      repartidoresMap[rId].montoRecibido += recibido

      if (metodo.includes('EFECTIVO')) {
        repartidoresMap[rId].efectivo += recibido
      } else if (metodo.includes('TRANSFERENCIA') || metodo.includes('BANCO')) {
        repartidoresMap[rId].transferencia += recibido
      } else {
        repartidoresMap[rId].otrosMetodos += recibido
      }

      repartidoresMap[rId].saldoPendiente += Math.max(0, totalOperacion - recibido)
      totalFacturado += totalOperacion
      montoRecibido += recibido
    })

    const rendicionRepartidores = Object.values(repartidoresMap)
    const saldoPendiente = Math.max(0, totalFacturado - montoRecibido)

    const estadosMap = Object.fromEntries(
      porEstado.map(r => [r.estado, r._count.estado])
    )

    res.json({
      periodo,
      rango: { startDate, endDate },
      kpis: {
        totalFacturado,
        montoRecibido,
        saldoPendiente,
        entregasConcretadas,
        entregasCanceladas,
        cargasRealizadas: cargas.length - cargasCamion.length,
        ventasCamionRealizadas: cargasCamion.length
      },
      ventasYCobros: entregasProcesadas,
      cargasPorGas,
      ventasCamion,
      rendicionRepartidores,
      inventario: {
        porEstado: estadosMap,
        alquileresVencidos,
        tercerosPendientes
      }
    })
  } catch (err) { next(err) }
})

// GET /api/reportes/dashboard — todos los indicadores del dashboard en una sola llamada
router.get('/dashboard', async (req, res, next) => {
  try {
    const hoy = new Date()

    const [
      porEstado,
      alquileresVencidos,
      entregasRecientes,
      tubosTotal,
      clientesActivos,
    ] = await Promise.all([
      // Conteo por estado
      prisma.tubo.groupBy({
        by: ['estado'],
        where: { activo: true },
        _count: { estado: true },
      }),
      // Alquileres vencidos
      prisma.alquiler.count({
        where: { estado: 'ACTIVO', fechaVencimiento: { lt: hoy } },
      }),
      // Últimas 5 entregas
      prisma.entrega.findMany({
        take: 5,
        orderBy: { fechaEntrega: 'desc' },
        include: {
          cliente:  { select: { nombre: true } },
          detalles: { select: { tuboId: true } },
        },
      }),
      prisma.tubo.count({ where: { activo: true } }),
      prisma.cliente.count({ where: { activo: true } }),
    ])

    const estadosMap = Object.fromEntries(
      porEstado.map(r => [r.estado, r._count.estado])
    )

    res.json({
      tubosTotal,
      clientesActivos,
      alquileresVencidos,
      porEstado: estadosMap,
      entregasRecientes,
    })
  } catch (err) { next(err) }
})

// GET /api/reportes/tubos-por-cliente
router.get('/tubos-por-cliente', async (req, res, next) => {
  try {
    const datos = await prisma.cliente.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        _count: { select: { tubos: true } },
      },
      orderBy: { tubos: { _count: 'desc' } },
    })
    res.json(datos)
  } catch (err) { next(err) }
})

// GET /api/reportes/gases
router.get('/gases', async (req, res, next) => {
  try {
    const datos = await prisma.tubo.groupBy({
      by: ['gas'],
      where: { activo: true },
      _count: { gas: true },
      orderBy: { _count: { gas: 'desc' } },
    })
    res.json(datos)
  } catch (err) { next(err) }
})

// GET /api/reportes/movimientos?desde=&hasta=
router.get('/movimientos', async (req, res, next) => {
  try {
    const { desde, hasta, tuboId, usuarioId, page = 1, limit = 50 } = req.query
    const where = {}
    if (tuboId)    where.tuboId    = tuboId
    if (usuarioId) where.usuarioId = usuarioId
    if (desde || hasta) {
      where.createdAt = {}
      if (desde) where.createdAt.gte = new Date(desde)
      if (hasta) where.createdAt.lte = new Date(hasta)
    }

    const [movimientos, total] = await Promise.all([
      prisma.auditoria.findMany({
        where,
        include: {
          tubo:    { select: { id: true, gas: true } },
          usuario: { select: { username: true, nombre: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.auditoria.count({ where }),
    ])

    res.json({ movimientos, total })
  } catch (err) { next(err) }
})

export default router

