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
import { generarNumero, mapTuboGasToTipoGas } from '../utils/helpers.js'
import { sumarDias, aMedianocheUTC } from '../utils/fechas.js'
import { crearCargoInicial, crearCargoDelivery } from '../utils/alquilerCargos.js'
import { asignarTuboInicial, cerrarTuboActivo } from '../utils/alquilerTubos.js'
import { detalleVentaProductoSchema, calcularDetallesVenta } from '../utils/ventaProducto.js'

const router = Router()
router.use(requireAuth)

function parseGasYCapacidadInfo(str, tuboReferencia) {
  let gas = 'Oxígeno'
  if (tuboReferencia && tuboReferencia.gas) gas = tuboReferencia.gas

  if (str && typeof str === 'string') {
    const sLower = str.toLowerCase()
    if (sLower.includes('co2')) gas = 'CO2'
    else if (sLower.includes('oxígeno') || sLower.includes('oxigeno')) gas = 'Oxígeno'
    else if (sLower.includes('argón') || sLower.includes('argon')) gas = 'Argón'
    else if (sLower.includes('nitrógeno') || sLower.includes('nitrogeno')) gas = 'Nitrógeno'
    else if (sLower.includes('aire')) gas = 'Aire comprimido'
    else if (sLower.includes('mezcla')) gas = 'Mezcla CO2/Argón'
    else if (sLower.includes('acetileno')) gas = 'Acetileno'
  }

  const isKgGas = gas.toLowerCase() === 'co2' || gas.toLowerCase() === 'acetileno'

  let numVal = null
  if (str && typeof str === 'string') {
    // Si la cadena incluye prefijos de entrega, extraer únicamente la sección tras 'Detalle:'
    const targetPart = str.includes('Detalle:') ? str.split('Detalle:')[1] : str
    const cleanStr = targetPart
      .replace(/#\d+/g, '')
      .replace(/co2|co₂|m3|m³/gi, ' ')
      .trim()
    const matchNumber = cleanStr.match(/(\d+(?:\.\d+)?)/)
    if (matchNumber) {
      const candidato = parseFloat(matchNumber[1])
      // La columna capacidadLitros/capacidadKg es Decimal(5,2): sólo admite hasta 999.99.
      // El texto puede ser un código/serie escaneado (no la capacidad real), así que un
      // número fuera de un rango plausible de capacidad se descarta en vez de intentar
      // guardarlo (evita "numeric field overflow" en cilindroTerceroInfo.create).
      if (!isNaN(candidato) && candidato > 0 && candidato < 1000) {
        numVal = candidato
      }
    }
  }

  let capacidadLitros = null
  let capacidadKg = null

  if (numVal !== null && !isNaN(numVal)) {
    if (isKgGas) {
      capacidadKg = numVal
    } else {
      capacidadLitros = numVal
    }
  } else if (tuboReferencia) {
    capacidadLitros = tuboReferencia.capacidadLitros ? Number(tuboReferencia.capacidadLitros) : null
    capacidadKg = tuboReferencia.capacidadKg ? Number(tuboReferencia.capacidadKg) : null
  }

  return { gas, capacidadLitros, capacidadKg }
}

const entregaSchema = z.object({
  clienteId:        z.string(),
  sucursalId:       z.string().optional().nullable(),
  direccionEntrega: z.string().min(1),
  latitud:          z.number().optional(),
  longitud:         z.number().optional(),
  tipoOperacion:    z.enum(['ENTREGA_SIMPLE', 'ALQUILER', 'VENTA']),
  canal:            z.enum(['REPARTO', 'SALON']).optional().default('REPARTO'),
  repartidorId:     z.string().min(1, 'repartidorId es requerido'),
  observaciones:    z.string().optional(),
  tubosIds:         z.array(z.string()).min(1, 'Debe incluir al menos un tubo'),
  costoDelivery:    z.coerce.number().optional().default(0),
  metodoPago:       z.enum(['EFECTIVO', 'TRANSFERENCIA']),
  tubosDetalles:    z.array(z.object({
    tuboId:         z.string(),
    cantidadGas:    z.coerce.number().optional(),
    unidadGas:      z.enum(['KG', 'M3']).optional(),
    precioUnitario: z.coerce.number().optional(),
  })).optional(),
  // Solo si tipoOperacion = ALQUILER
  planId:           z.string().optional(),
  // Lista de ítems del plan, ya editada por el operador de oficina (precargada
  // del plan pero puede agregar/quitar/cambiar cantidades). Si no viene, se
  // copian tal cual los ítems activos del plan.
  itemsAlquiler:    z.array(z.object({
    descripcion: z.string().min(1),
    cantidad:    z.coerce.number().int().positive().default(1),
    serializado: z.coerce.boolean().optional().default(false),
    orden:       z.coerce.number().int().nonnegative().optional(),
  })).optional(),
  // Deprecado: el vencimiento ahora se calcula desde PlanAlquiler.diasIncluidos.
  // Se mantiene opcional en el schema por compatibilidad con clientes viejos
  // que todavía lo manden; el backend ya no lo usa para ALQUILER.
  fechaVencimiento: z.string().datetime().optional(),
  // Solo si tipoOperacion = VENTA
  referencia:       z.string().optional(),
  // Productos de catálogo agregados a la entrega (botón "Agregar productos"),
  // independiente del tipoOperacion. Se cobran junto con el resto vía
  // metodoPago/montoRecibido de la entrega — nunca a crédito (ver arriba).
  productos:        z.array(detalleVentaProductoSchema).optional().default([]),
}).superRefine((data, ctx) => {
  // Entrega en Salón: se exige georreferenciar dónde retira el tubo el
  // cliente, para dejar precedente en el mapa (a diferencia de REPARTO,
  // que ya trae GPS real del repartidor en el momento de la entrega).
  if (data.canal === 'SALON' && (data.latitud == null || data.longitud == null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La ubicación es obligatoria para entregas en salón', path: ['latitud'] })
  }
})

// ─── GET /api/entregas ────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { clienteId, repartidorId, canal, confirmada, cancelada, desde, hasta, page = 1, limit = 30, activasEnCliente } = req.query
    const where = {}
    if (clienteId) where.clienteId = clienteId
    if (canal) where.canal = canal
    if (repartidorId) where.repartidorId = repartidorId

    if (activasEnCliente === 'true') {
      // Para el mapa de "tubos entregados": entregas concretadas, no canceladas, con al
      // menos un tubo que siga activo en manos del cliente (no cuenta si ya se devolvió).
      where.confirmada = true
      where.cancelada = false
      where.detalles = { some: { tubo: { estado: { in: ['ENTREGADO', 'ALQUILADO'] } } } }
    } else {
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
          cliente:    { select: { id: true, nombre: true, ruc: true, telefono: true, contacto: true } },
          sucursal:   true,
          creadoPor:  { select: { username: true, nombre: true } },
          repartidor: { select: { username: true, nombre: true } },
          detalles:   { include: { tubo: { select: { id: true, gas: true, capacidadLitros: true, capacidadKg: true, estado: true, clienteId: true } } } },
          recambios:  { include: { tuboEntregado: { select: { id: true, gas: true, observaciones: true } } } },
          alquileres: { include: { plan: { select: { codigo: true, nombre: true } }, items: { orderBy: { orden: 'asc' } } } },
          cilindrosTerceros: true,
          ventaProducto: { include: { detalles: { include: { producto: { select: { id: true, codigo: true } } } } } },
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

// ─── GET /api/entregas/numero/:numero ─────────────────────────────────────────
// Detalle de una remisión por su número (E-2026-001). Alimenta la landing que
// se abre al escanear el QR del ticket. Requiere sesión (router.use(requireAuth)).
router.get('/numero/:numero', async (req, res, next) => {
  try {
    const entrega = await prisma.entrega.findUnique({
      where: { numero: req.params.numero },
      include: {
        cliente:    true,
        sucursal:   true,
        creadoPor:  { select: { username: true, nombre: true } },
        repartidor: { select: { username: true, nombre: true } },
        detalles:   { include: { tubo: { select: { id: true, gas: true, capacidadLitros: true, capacidadKg: true, estado: true, clienteId: true } } } },
        recambios:  { include: { tuboEntregado: { select: { id: true, gas: true, observaciones: true } } } },
        alquileres: { include: { plan: { select: { codigo: true, nombre: true } }, items: { orderBy: { orden: 'asc' } } } },
        cilindrosTerceros: true,
        ventaProducto: { include: { detalles: { include: { producto: { select: { id: true, codigo: true } } } } } },
      },
    })
    if (!entrega) return res.status(404).json({ error: 'Remisión no encontrada' })
    res.json(entrega)
  } catch (err) { next(err) }
})

// ─── POST /api/entregas ───────────────────────────────────────────────────────
router.post('/', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = entregaSchema.parse(req.body)

    // En salón, el "repartidor" es en realidad quien atiende el mostrador —
    // se fuerza al usuario logueado sin confiar en lo que mande el frontend.
    const repartidorId = data.canal === 'SALON' ? req.user.id : data.repartidorId

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
    let planAlquiler = null
    let itemsAlquilerSnapshot = []
    if (data.tipoOperacion === 'ALQUILER') {
      if (!data.planId) {
        return res.status(400).json({ error: 'Seleccioná un plan de alquiler' })
      }
      planAlquiler = await prisma.planAlquiler.findUnique({
        where: { id: data.planId },
        include: { items: { where: { activo: true }, orderBy: { orden: 'asc' } } },
      })
      if (!planAlquiler || !planAlquiler.activo) {
        return res.status(400).json({ error: 'Plan de alquiler no encontrado o inactivo' })
      }
      // Lista efectiva de ítems: la que mandó el operador ya editada, o —si no
      // vino el campo— los ítems activos del plan tal cual. Se guarda como
      // snapshot por contrato (ItemAlquiler), sin referenciar PlanAlquilerItem.
      const fuenteItems = data.itemsAlquiler !== undefined ? data.itemsAlquiler : planAlquiler.items
      itemsAlquilerSnapshot = fuenteItems
        .filter(i => String(i.descripcion || '').trim())
        .map((i, idx) => ({
          descripcion: i.descripcion.trim(),
          cantidad:    Number(i.cantidad) > 0 ? Math.trunc(Number(i.cantidad)) : 1,
          serializado: !!i.serializado,
          orden:       i.orden !== undefined ? Number(i.orden) : idx,
        }))
    }

    // Productos de catálogo agregados a la entrega ("Agregar productos")
    const productoIds = [...new Set(data.productos.map(p => p.productoId).filter(Boolean))]
    const productos = productoIds.length
      ? await prisma.producto.findMany({ where: { id: { in: productoIds } } })
      : []
    if (productos.length !== productoIds.length) {
      return res.status(400).json({ error: 'Uno o más productos no existen' })
    }
    const productosPorId = new Map(productos.map(p => [p.id, p]))

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

        // Buscar la última carga de este tubo para usar su precio unitario
        const ultimaCargaTubo = await tx.carga.findFirst({
          where: { tuboId },
          orderBy: { fechaCarga: 'desc' }
        })

        let precioUnitario = 0
        if (ultimaCargaTubo && Number(ultimaCargaTubo.precioUnitario) > 0) {
          precioUnitario = Number(ultimaCargaTubo.precioUnitario)
        }

        let cantidadGas = 0
        let unidadGas = precioGasInfo ? precioGasInfo.unidad : 'KG'

        // Verificar si la cantidad o precio fue ingresado manualmente
        const manualDetail = data.tubosDetalles?.find(d => d.tuboId === tuboId)
        if (manualDetail) {
          if (manualDetail.cantidadGas !== undefined) {
            cantidadGas = Number(manualDetail.cantidadGas)
          }
          if (manualDetail.unidadGas) {
            unidadGas = manualDetail.unidadGas
          }
          if (manualDetail.precioUnitario !== undefined && manualDetail.precioUnitario !== null && !isNaN(Number(manualDetail.precioUnitario))) {
            precioUnitario = Number(manualDetail.precioUnitario)
          }
        } else {
          // Si no hay detalle manual, usar cantidad de la última carga
          if (ultimaCargaTubo) {
            cantidadGas = Number(ultimaCargaTubo.cantidad)
            unidadGas = ultimaCargaTubo.unidad
          }
        }

        // ALQUILER se cobra por plan (precioInicial fijo), no por gas × precio:
        // cantidadGas se conserva a título informativo (cuánto gas tenía el
        // tubo al salir), pero el precio/subtotal se anula acá para que el
        // total de la entrega no duplique el cobro que hace CargoAlquiler.
        if (data.tipoOperacion === 'ALQUILER') {
          precioUnitario = 0
        }

        const cantNum = Number(cantidadGas || 0)
        const precNum = Number(precioUnitario || 0)
        const subtotal = data.tipoOperacion === 'ALQUILER' ? 0 : (cantNum > 0 ? (cantNum * precNum) : precNum)

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
          sucursalId:       data.sucursalId || null,
          direccionEntrega: data.direccionEntrega,
          latitud:          data.latitud,
          longitud:         data.longitud,
          tipoOperacion:    data.tipoOperacion,
          canal:            data.canal,
          repartidorId,
          observaciones:    data.observaciones,
          creadoPorId:      req.user.id,
          costoDelivery:    data.costoDelivery,
          metodoPago:       data.metodoPago,
          detalles: {
            create: detallesAInsertar,
          },
        },
        include: { detalles: true, sucursal: true },
      })

      // 3b. Productos de catálogo agregados a la entrega, si vinieron. Es una
      // VentaProducto propia ligada por entregaId (nunca a crédito, ver schema).
      let ventaProducto = null
      if (data.productos.length > 0) {
        const { detallesCreate, total } = calcularDetallesVenta(data.productos, productosPorId)
        const numeroVP = await generarNumero('VP', tx)
        ventaProducto = await tx.ventaProducto.create({
          data: {
            numero: numeroVP,
            entregaId: entrega.id,
            clienteId: data.clienteId,
            usuarioId: req.user.id,
            metodoPago: data.metodoPago,
            total,
            detalles: { create: detallesCreate },
          },
          include: { detalles: { include: { producto: { select: { id: true, codigo: true } } } } },
        })

        for (const d of detallesCreate) {
          if (!d.productoId) continue
          if (productosPorId.get(d.productoId).stock === null) continue
          await tx.producto.update({
            where: { id: d.productoId },
            data: { stock: { decrement: Math.round(d.cantidad) } },
          })
        }
      }

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
        // Fechas reales (fechaInicio, fechaVencimiento, primerPeriodoHasta) se
        // fijan recién cuando el repartidor confirma la entrega — acá son
        // provisorias, el contrato nace en PENDIENTE_ENTREGA.
        const provisional = aMedianocheUTC(new Date())
        for (const tuboId of data.tubosIds) {
          const numeroAlquiler = await generarNumero('AL', tx)
          await tx.alquiler.create({
            data: {
              numero:           numeroAlquiler,
              clienteId:        data.clienteId,
              tuboId,
              entregaId:        entrega.id,
              fechaInicio:      provisional,
              fechaVencimiento: sumarDias(provisional, planAlquiler.diasIncluidos),
              estado:           'PENDIENTE_ENTREGA',
              planId:                 planAlquiler.id,
              precioInicialAplicado:  planAlquiler.precioInicial,
              precioMensualAplicado:  planAlquiler.precioMensual,
              precioRecargaAplicado:  planAlquiler.precioRecargaDomicilio,
              diasIncluidosAplicados: planAlquiler.diasIncluidos,
              // Snapshot de ítems del plan, duplicado en cada contrato de la
              // entrega (1 tubo = 1 equipo completo con su propio regulador, etc.).
              items: itemsAlquilerSnapshot.length > 0
                ? { create: itemsAlquilerSnapshot.map(i => ({ ...i })) }
                : undefined,
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

      return { ...entrega, ventaProducto }
    })

    res.status(201).json(resultado)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── PUT /api/entregas/:id/confirmar ─────────────────────────────────────────
const confirmacionSchema = z.object({
  recambios: z.array(z.string()).optional().default([]),
  confirmados: z.array(z.string()).optional(), // Si no viene, se confirman todos
  metodoPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'CREDITO', 'PENDIENTE']).optional(),
  montoRecibido: z.coerce.number().optional(),
  // Solo ALQUILER: series/estado que carga el repartidor por cada ítem del
  // equipo, y la nota general de verificación física. `itemId` referencia
  // ItemAlquiler; series sin match se ignoran. Nada de esto bloquea la
  // confirmación (serie "recomendada pero no obligatoria").
  itemsAlquiler: z.array(z.object({
    itemId:    z.string(),
    serie:     z.string().optional(),
    entregado: z.coerce.boolean().optional(),
  })).optional(),
  observacionEquipoAlquiler: z.string().max(2000).optional(),
})

router.put('/:id/confirmar', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR', 'REPARTIDOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { recambios, confirmados, metodoPago, montoRecibido, itemsAlquiler, observacionEquipoAlquiler } = confirmacionSchema.parse(req.body || {})
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

    const todosTuboIds = entrega.detalles.map(d => d.tuboId)
    const confirmadosIds = confirmados || todosTuboIds
    const noConfirmadosIds = todosTuboIds.filter(tId => !confirmadosIds.includes(tId))

    const resultado = await prisma.$transaction(async (tx) => {
      let observacionesActualizadas = entrega.observaciones || ''
      if (noConfirmadosIds.length > 0) {
        const nota = `Entrega Parcial: Retornaron ${noConfirmadosIds.length} tubo(s)`
        observacionesActualizadas = observacionesActualizadas
          ? `${observacionesActualizadas} | ${nota}`
          : nota
      }

      // 1. Confirmar la entrega
      const entregaActualizada = await tx.entrega.update({
        where: { id },
        data: {
          confirmada: true,
          // La forma de pago ya se elige al crear la entrega; solo se pisa acá
          // si explícitamente viene una nueva (compatibilidad hacia atrás).
          metodoPago: metodoPago || entrega.metodoPago || null,
          montoRecibido: montoRecibido !== undefined ? montoRecibido : null,
          observaciones: observacionesActualizadas || null,
        },
        include: { detalles: true }
      })

      const estadoDestino = {
        ENTREGA_SIMPLE: 'ENTREGADO',
        ALQUILER:       'ALQUILADO',
        VENTA:          'VENDIDO',
      }[entrega.tipoOperacion]

      // Buscar si algún tubo de esta entrega tiene camionId asignado
      const primerTuboConCamion = await tx.tubo.findFirst({
        where: { id: { in: todosTuboIds }, camionId: { not: null } },
        include: { camion: true }
      })
      const camionId = primerTuboConCamion?.camionId
      const camionAsociado = primerTuboConCamion?.camion

      // 2. Actualizar estado y ubicación de todos los tubos confirmados de la entrega
      for (const d of entrega.detalles.filter(x => confirmadosIds.includes(x.tuboId))) {
        await tx.tubo.update({
          where: { id: d.tuboId },
          data: {
            estado:    estadoDestino,
            clienteId: entrega.tipoOperacion !== 'VENTA' ? entrega.clienteId : null,
            ubicacion: entrega.tipoOperacion !== 'VENTA' ? 'Cliente' : 'Vendido',
            camionId:  null, // sale del stock del camión al confirmarse
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

      // 3. Procesar tubos NO confirmados (entregas parciales)
      for (const d of entrega.detalles.filter(x => noConfirmadosIds.includes(x.tuboId))) {
        const tuboDb = await tx.tubo.findUnique({ where: { id: d.tuboId } })
        const camionTubo = tuboDb?.camionId ? await tx.camion.findUnique({ where: { id: tuboDb.camionId } }) : null

        if (camionTubo) {
          // Si estaba en un camión, regresa al camión como RESERVADO
          await tx.tubo.update({
            where: { id: d.tuboId },
            data: {
              estado:    'RESERVADO',
              clienteId: null,
              ubicacion: `Camión ${camionTubo.placa}`,
            }
          })
        } else {
          // Si no, regresa al depósito
          let estadoAnterior = d.estadoAnterior || 'CARGADO'
          await tx.tubo.update({
            where: { id: d.tuboId },
            data: {
              estado:    estadoAnterior,
              clienteId: null,
              ubicacion: 'Depósito',
              camionId:  null,
            }
          })
        }

        // Auditoría
        await tx.auditoria.create({
          data: {
            tuboId:         d.tuboId,
            usuarioId:      req.user.id,
            accion:         `Entrega parcial: tubo no entregado`,
            estadoAnterior: 'RESERVADO',
            estadoNuevo:    tuboDb?.camionId ? 'RESERVADO' : (d.estadoAnterior || 'CARGADO'),
            observaciones:  `No entregado en remisión ${entrega.numero}. Queda en stock del camión o depósito.`,
            metadata:       { entregaId: id, numero: entrega.numero }
          }
        })

        // Eliminar detalle de entrega
        await tx.detalleEntrega.delete({
          where: {
            entregaId_tuboId: { entregaId: id, tuboId: d.tuboId }
          }
        })

        // Cancelar pre-alquileres si corresponde (soft-cancel)
        if (entrega.tipoOperacion === 'ALQUILER') {
          await tx.alquiler.updateMany({
            where: { entregaId: id, tuboId: d.tuboId },
            data: {
              estado: 'CANCELADO',
              observaciones: 'Cancelado por entrega parcial'
            }
          })
        }

        // Cancelar pre-ventas si corresponde (soft-cancel)
        if (entrega.tipoOperacion === 'VENTA') {
          await tx.venta.updateMany({
            where: {
              clienteId: entrega.clienteId,
              tuboId: d.tuboId,
              cancelada: false
            },
            data: {
              cancelada: true,
              observaciones: 'Cancelado por entrega parcial'
            }
          })
        }
      }

      // 2.b. Registrar recambios si existen
      if (recambios && recambios.length > 0) {
        for (const retId of recambios) {
          // A. Verificar si es un tubo ya registrado en el sistema (propio o de un cliente)
          const tuboPropio = await tx.tubo.findFirst({
            where: { id: retId, activo: true }
          })

          let tuboRetornadoId = null
          let estadoAnterior = 'DEVUELTO'

          if (tuboPropio) {
            // Si ya está registrado, actualizamos su estado y ubicación a DEVUELTO
            // en vez de tratarlo como cilindro de tercero desconocido
            tuboRetornadoId = tuboPropio.id
            estadoAnterior = tuboPropio.estado
            await tx.tubo.update({
              where: { id: tuboPropio.id },
              data: {
                activo: true,
                estado: 'DEVUELTO',
                clienteId: null,
                ubicacion: camionAsociado ? `Camión ${camionAsociado.placa}` : 'Depósito',
                camionId: camionId || null,
              }
            })

            // Finalizar alquileres del tubo retornado si corresponden: el
            // contrato pasa a FINALIZADO y se cierra su AlquilerTubo abierto,
            // si no ese tubo queda trabado para futuros alquileres.
            const fechaRetorno = new Date()
            const alquileresDelTubo = await tx.alquiler.findMany({
              where: { tuboId: tuboRetornadoId, estado: { in: ['ACTIVO', 'VENCIDO'] } },
              select: { id: true },
            })
            for (const { id: alquilerId } of alquileresDelTubo) {
              await tx.alquiler.update({
                where: { id: alquilerId },
                data:  { estado: 'FINALIZADO', fechaDevolucion: fechaRetorno },
              })
              await cerrarTuboActivo(tx, { alquilerId, fecha: fechaRetorno })
            }

            // Crear registro de Recambio
            await tx.recambio.create({
              data: {
                entregaId: id,
                tuboEntregadoId: tuboRetornadoId,
                clienteId: entrega.clienteId,
              }
            })

            // Auditoría del tubo retornado
            await tx.auditoria.create({
              data: {
                tuboId:         tuboRetornadoId,
                usuarioId:      req.user.id,
                accion:         'Recambio registrado en entrega',
                estadoAnterior: estadoAnterior,
                estadoNuevo:    'DEVUELTO',
                observaciones:  `Recambio devuelto en entrega ${entrega.numero}. Queda en ${camionAsociado ? 'camión ' + camionAsociado.placa : 'depósito'}.`,
                metadata:       { entregaId: id, numero: entrega.numero, camionId }
              }
            })
          } else {
            // Si NO es propio, se guarda como registro puramente informativo en CilindroTerceroInfo
            const primerDetalle = entrega.detalles[0]
            const tuboRef = primerDetalle ? await tx.tubo.findUnique({ where: { id: primerDetalle.tuboId } }) : null
            const parsed = parseGasYCapacidadInfo(retId, tuboRef)

            await tx.cilindroTerceroInfo.create({
              data: {
                gas: parsed.gas,
                codigo: retId,
                capacidadLitros: parsed.capacidadLitros,
                capacidadKg: parsed.capacidadKg,
                estado: 'PENDIENTE',
                clienteId: entrega.clienteId,
                entregaId: id,
                repartidorId: req.user.id,
                observaciones: `Recibido por repartidor en entrega ${entrega.numero}. Detalle: ${retId}`
              }
            })
          }
        }
      }

      // 4. Fecha de inicio real + activación del contrato + cargo INICIAL.
      // El contrato nace PENDIENTE_ENTREGA (ver POST /entregas); recién acá,
      // con la entrega confirmada en terreno, se conoce la fecha real y el
      // cliente empieza a recibir efectivamente sus días incluidos.
      if (entrega.tipoOperacion === 'ALQUILER') {
        const alquileresAConfirmar = await tx.alquiler.findMany({
          where: { entregaId: id, tuboId: { in: confirmadosIds } },
        })

        const fechaInicioReal = aMedianocheUTC(new Date())
        // Confirmar la entrega es evidencia de cobro: el repartidor no deja el
        // equipo sin cobrar el pago inicial (ni el delivery). El cargo queda
        // PAGADO por el monto completo del plan, sin depender de lo tipeado en
        // montoRecibido ni de la forma de pago elegida al confirmar.
        const metodoPagoCobro = metodoPago || entrega.metodoPago

        for (const alq of alquileresAConfirmar) {
          const dias = alq.diasIncluidosAplicados || 30
          const primerPeriodoHasta = sumarDias(fechaInicioReal, dias)

          const alqActualizado = await tx.alquiler.update({
            where: { id: alq.id },
            data: {
              fechaInicio:       fechaInicioReal,
              primerPeriodoHasta,
              fechaVencimiento:  primerPeriodoHasta,
              estado:            'ACTIVO',
            },
          })

          const precioInicial = Number(alq.precioInicialAplicado || 0)

          await crearCargoInicial(tx, alqActualizado, {
            montoPagado: precioInicial,
            metodoPago:  metodoPagoCobro,
            fechaPago:   new Date(),
            usuarioId:   req.user.id,
          })

          // Primer tubo del historial del contrato (ver ETAPA 2 — AlquilerTubo).
          await asignarTuboInicial(tx, { alquilerId: alq.id, tuboId: alq.tuboId, fechaDesde: fechaInicioReal })

          await tx.auditoria.create({
            data: {
              usuarioId: req.user.id,
              accion: 'Contrato de alquiler activado (entrega confirmada)',
              metadata: { alquilerId: alq.id, numero: alq.numero, entregaId: id, primerPeriodoHasta },
            },
          })
        }

        // Series/estado de los ítems del equipo que carga el repartidor + nota
        // general de verificación física. Todo opcional: no bloquea la confirmación.
        if (Array.isArray(itemsAlquiler) && itemsAlquiler.length > 0) {
          for (const it of itemsAlquiler) {
            const patch = {}
            if (it.serie !== undefined) patch.serie = String(it.serie).trim() || null
            if (it.entregado !== undefined) patch.entregado = !!it.entregado
            if (Object.keys(patch).length === 0) continue
            // El guard por entregaId evita tocar ítems de otra remisión aunque
            // manden un itemId cualquiera.
            await tx.itemAlquiler.updateMany({
              where: { id: it.itemId, alquiler: { entregaId: id } },
              data: patch,
            })
          }
        }
        if (observacionEquipoAlquiler !== undefined) {
          await tx.entrega.update({
            where: { id },
            data: { observacionEquipoAlquiler: String(observacionEquipoAlquiler).trim() || null },
          })
        }

        // El costo de delivery de la entrega no tiene fuente financiera propia
        // una vez que la Entrega ALQUILER queda excluida de Movimiento de Dinero
        // (ver movimientosDinero.js) — sin esto, ese monto desaparecía en
        // silencio. Se registra como cargo propio (OTRO) contra el primer
        // contrato de la entrega, también PAGADO por completo al confirmar
        // (mismo criterio que el cargo inicial, ver más arriba).
        const costoDelivery = Number(entrega.costoDelivery || 0)
        if (costoDelivery > 0 && alquileresAConfirmar.length > 0) {
          const alqParaDelivery = await tx.alquiler.findUnique({ where: { id: alquileresAConfirmar[0].id } })

          await crearCargoDelivery(tx, alqParaDelivery, {
            monto: costoDelivery,
            montoPagado: costoDelivery,
            metodoPago: metodoPagoCobro,
            fechaPago: new Date(),
            usuarioId: req.user.id,
          })
        }
      }

      if (entrega.tipoOperacion === 'VENTA') {
        await tx.venta.updateMany({
          where: {
            tuboId: { in: confirmadosIds },
            clienteId: entrega.clienteId,
          },
          data: { fechaVenta: new Date() }
        })
      }

      return entregaActualizada
    })

    res.json(resultado)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    res.status(400).json({ error: err.message || 'Error al confirmar entrega' })
  }
})

// ─── PUT /api/entregas/:id/cancelar ──────────────────────────────────────────
router.put('/:id/cancelar', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR', 'REPARTIDOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { motivo } = req.body
    const entrega = await prisma.entrega.findUnique({
      where: { id },
      include: { detalles: true, ventaProducto: { include: { detalles: true } } }
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

      // 2. Marcar alquileres asociados como CANCELADOS (si los hay)
      await tx.alquiler.updateMany({
        where: { entregaId: id },
        data: {
          estado: 'CANCELADO',
          observaciones: `Alquiler cancelado debido a cancelación de entrega ${entrega.numero}. Motivo: ${motivo || 'No concretada en terreno'}`
        }
      })

      // 3. Marcar ventas asociadas como CANCELADAS (si las hay)
      if (entrega.tipoOperacion === 'VENTA') {
        const tuboIds = entrega.detalles.map(d => d.tuboId)
        await tx.venta.updateMany({
          where: {
            tuboId: { in: tuboIds },
            clienteId: entrega.clienteId,
            cancelada: false
          },
          data: {
            cancelada: true,
            observaciones: `Venta cancelada debido a cancelación de entrega ${entrega.numero}. Motivo: ${motivo || 'No concretada en terreno'}`
          }
        })
      }

      // 3b. Cancelar la venta de productos ligada (si hay) y reponer stock
      if (entrega.ventaProducto && !entrega.ventaProducto.cancelada) {
        await tx.ventaProducto.update({
          where: { id: entrega.ventaProducto.id },
          data: { cancelada: true },
        })
        for (const d of entrega.ventaProducto.detalles) {
          if (!d.productoId) continue
          const producto = await tx.producto.findUnique({ where: { id: d.productoId } })
          if (!producto || producto.stock === null) continue
          await tx.producto.update({
            where: { id: d.productoId },
            data: { stock: { increment: Math.round(Number(d.cantidad)) } },
          })
        }
      }

      // 4. Revertir el estado de los tubos
      for (const d of entrega.detalles) {
        const tuboDb = await tx.tubo.findUnique({ where: { id: d.tuboId } })
        const camionTubo = tuboDb?.camionId ? await tx.camion.findUnique({ where: { id: tuboDb.camionId } }) : null

        if (camionTubo) {
          // Si estaba en un camión, regresa al camión como RESERVADO
          await tx.tubo.update({
            where: { id: d.tuboId },
            data: {
              estado:    'RESERVADO',
              clienteId: null,
              ubicacion: `Camión ${camionTubo.placa}`
            }
          })

          // Auditoría
          await tx.auditoria.create({
            data: {
              tuboId:         d.tuboId,
              usuarioId:      req.user.id,
              accion:         `Entrega cancelada (Retorno a camión)`,
              estadoAnterior: 'RESERVADO',
              estadoNuevo:    'RESERVADO',
              observaciones:  `Entrega ${entrega.numero} cancelada. Cilindro regresa al stock del camión ${camionTubo.placa}.`,
              metadata:       { entregaId: id, numero: entrega.numero }
            }
          })
        } else {
          // Si no, regresa al depósito con su estado anterior
          let estadoAnterior = d.estadoAnterior
          if (!estadoAnterior) {
            const ultimaAudit = await tx.auditoria.findFirst({
              where: { tuboId: d.tuboId, metadata: { path: ['entregaId'], equals: id } },
              orderBy: { createdAt: 'desc' },
            })
            estadoAnterior = ultimaAudit?.estadoAnterior || 'CARGADO'
          }

          await tx.tubo.update({
            where: { id: d.tuboId },
            data: {
              estado:    estadoAnterior,
              clienteId: null,
              ubicacion: 'Depósito',
              camionId:  null
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
      }

      return entregaActualizada
    })

    res.json({ success: true, message: 'Entrega cancelada y cilindros devueltos correctamente', entrega: resultado })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/entregas/:id/agregar-tubo ─────────────────────────────────────
// Permite al repartidor (u operador) añadir un tubo extra a una entrega en tránsito (no confirmada)
router.post('/:id/agregar-tubo', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR', 'REPARTIDOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { tuboId, cantidadGas, unidadGas, precioUnitario: reqPrecioUnitario } = req.body

    if (!tuboId) {
      return res.status(400).json({ error: 'Debe especificar el tuboId' })
    }

    // 1. Obtener la entrega
    const entrega = await prisma.entrega.findUnique({
      where: { id },
      include: { detalles: true }
    })

    if (!entrega) return res.status(404).json({ error: 'Entrega no encontrada' })
    if (entrega.confirmada) return res.status(400).json({ error: 'No se puede modificar una entrega ya confirmada' })
    if (entrega.cancelada) return res.status(400).json({ error: 'No se puede modificar una entrega cancelada' })

    // Verificar si el tubo ya está en la entrega
    if (entrega.detalles.some(d => d.tuboId === tuboId)) {
      return res.status(400).json({ error: 'El tubo ya se encuentra en esta entrega' })
    }

    // 2. Obtener el tubo
    const tubo = await prisma.tubo.findUnique({
      where: { id: tuboId, activo: true }
    })

    if (!tubo) return res.status(404).json({ error: 'Tubo no encontrado o inactivo' })

    // Estados permitidos para agregar
    const estadosPermitidos = ['DISPONIBLE', 'CARGADO', 'RESERVADO']
    if (!estadosPermitidos.includes(tubo.estado)) {
      return res.status(400).json({ error: `El tubo no está disponible para entrega (Estado: ${tubo.estado})` })
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // 3. Determinar precio unitario y cantidad de gas
      const tipoGas = mapTuboGasToTipoGas(tubo.gas)
      const precioGasInfo = await tx.precioGas.findFirst({
        where: { gas: tipoGas }
      })

      // Buscar la última carga de este tubo para usar su precio unitario
      const ultimaCarga = await tx.carga.findFirst({
        where: { tuboId },
        orderBy: { fechaCarga: 'desc' }
      })

      let precioUnitario = 0
      if (reqPrecioUnitario !== undefined && reqPrecioUnitario !== null && !isNaN(Number(reqPrecioUnitario))) {
        precioUnitario = Number(reqPrecioUnitario)
      } else if (ultimaCarga && Number(ultimaCarga.precioUnitario) > 0) {
        precioUnitario = Number(ultimaCarga.precioUnitario)
      }

      let finalCantidadGas = 0
      let finalUnidadGas = precioGasInfo ? precioGasInfo.unidad : 'KG'

      if (cantidadGas !== undefined) {
        finalCantidadGas = Number(cantidadGas)
        if (unidadGas) finalUnidadGas = unidadGas
      } else if (tubo.estado === 'DISPONIBLE') {
        finalCantidadGas = 0
      } else if (ultimaCarga) {
        finalCantidadGas = Number(ultimaCarga.cantidad)
        finalUnidadGas = ultimaCarga.unidad
      }

      // Mismo criterio que en POST /entregas: en ALQUILER el precio viene del
      // plan (vía CargoAlquiler), no de gas × precio.
      if (entrega.tipoOperacion === 'ALQUILER') {
        precioUnitario = 0
      }

      const cantNum = Number(finalCantidadGas || 0)
      const precNum = Number(precioUnitario || 0)
      const subtotal = entrega.tipoOperacion === 'ALQUILER' ? 0 : (cantNum > 0 ? (cantNum * precNum) : precNum)

      // 4. Crear el detalle de la entrega
      const nuevoDetalle = await tx.detalleEntrega.create({
        data: {
          entregaId: id,
          tuboId,
          cantidadGas: finalCantidadGas,
          unidadGas: finalUnidadGas,
          precioUnitario,
          subtotal,
          estadoAnterior: tubo.estado,
          esAdicional: true
        },
        include: {
          tubo: {
            select: {
              id: true,
              gas: true,
              serie: true,
              capacidadLitros: true,
              capacidadKg: true
            }
          }
        }
      })

      // 4.1 Actualizar observaciones generales de la entrega
      const notaAgregado = `[Agregado por repartidor en terreno: ${tuboId}]`
      const observacionesExistentes = entrega.observaciones || ''
      const nuevasObservaciones = observacionesExistentes
        ? (observacionesExistentes.includes(notaAgregado) ? observacionesExistentes : `${observacionesExistentes} | ${notaAgregado}`)
        : notaAgregado

      await tx.entrega.update({
        where: { id },
        data: { observaciones: nuevasObservaciones }
      })

      // 5. Actualizar el tubo
      await tx.tubo.update({
        where: { id: tuboId },
        data: {
          estado: 'RESERVADO',
          clienteId: entrega.clienteId,
          ubicacion: 'En Tránsito'
        }
      })

      // 6. Crear alquiler o venta si corresponde
      if (entrega.tipoOperacion === 'ALQUILER') {
        // Reusa el mismo plan que los demás tubos de esta entrega (todos los
        // tubos de una entrega ALQUILER comparten plan). Sin esto, un tubo
        // agregado en tránsito quedaría sin plan ni cargo inicial.
        const alquilerHermano = await tx.alquiler.findFirst({
          where: { entregaId: id },
          include: { items: { orderBy: { orden: 'asc' } } },
        })
        if (!alquilerHermano?.planId) {
          throw new Error('No se pudo determinar el plan de alquiler de esta entrega')
        }

        const numeroAlquiler = await generarNumero('AL', tx)
        const provisional = aMedianocheUTC(new Date())

        await tx.alquiler.create({
          data: {
            numero: numeroAlquiler,
            clienteId: entrega.clienteId,
            tuboId,
            entregaId: id,
            fechaInicio: provisional,
            fechaVencimiento: sumarDias(provisional, alquilerHermano.diasIncluidosAplicados || 30),
            estado: 'PENDIENTE_ENTREGA',
            planId:                 alquilerHermano.planId,
            precioInicialAplicado:  alquilerHermano.precioInicialAplicado,
            precioMensualAplicado:  alquilerHermano.precioMensualAplicado,
            precioRecargaAplicado:  alquilerHermano.precioRecargaAplicado,
            diasIncluidosAplicados: alquilerHermano.diasIncluidosAplicados,
            // Mismo detalle de ítems que el resto de la entrega (sin las series
            // que ya se hayan cargado en los hermanos: el repartidor las carga
            // por contrato al confirmar).
            items: alquilerHermano.items.length > 0
              ? { create: alquilerHermano.items.map(i => ({
                  descripcion: i.descripcion,
                  cantidad:    i.cantidad,
                  serializado: i.serializado,
                  orden:       i.orden,
                })) }
              : undefined,
          }
        })
      }

      if (entrega.tipoOperacion === 'VENTA') {
        const numeroVenta = await generarNumero('V', tx)
        await tx.venta.create({
          data: {
            numero: numeroVenta,
            clienteId: entrega.clienteId,
            tuboId
          }
        })
      }

      // 7. Registrar auditoría
      const usuarioExisteAdd = req.user?.id ? await tx.usuario.findUnique({ where: { id: req.user.id } }) : null
      await tx.auditoria.create({
        data: {
          tuboId,
          usuarioId: usuarioExisteAdd ? usuarioExisteAdd.id : null,
          accion: `Tubo agregado a entrega en tránsito (${entrega.tipoOperacion})`,
          estadoAnterior: tubo.estado,
          estadoNuevo: 'RESERVADO',
          metadata: { entregaId: id, numero: entrega.numero }
        }
      })

      return nuevoDetalle
    })

    res.status(201).json({ message: 'Tubo agregado con éxito a la entrega', detalle: resultado })
  } catch (err) {
    next(err)
  }
})

// ─── DELETE /api/entregas/:id/quitar-tubo-adicional/:tuboId ───────────────────
// Permite al repartidor (u operador) quitar un tubo adicional previamente añadido
router.delete('/:id/quitar-tubo-adicional/:tuboId', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR', 'REPARTIDOR'), async (req, res, next) => {
  try {
    const { id, tuboId } = req.params

    // 1. Obtener la entrega y verificar estado
    const entrega = await prisma.entrega.findUnique({
      where: { id },
      include: { detalles: true }
    })

    if (!entrega) return res.status(404).json({ error: 'Entrega no encontrada' })
    if (entrega.confirmada) return res.status(400).json({ error: 'No se puede modificar una entrega ya confirmada' })
    if (entrega.cancelada) return res.status(400).json({ error: 'No se puede modificar una entrega cancelada' })

    // 2. Buscar el detalle correspondiente
    const detalle = entrega.detalles.find(d => d.tuboId === tuboId)
    if (!detalle) return res.status(404).json({ error: 'El tubo no se encuentra en esta entrega' })

    if (!detalle.esAdicional) {
      return res.status(400).json({ error: 'Solo se pueden eliminar tubos agregados adicionalmente por el repartidor' })
    }

    await prisma.$transaction(async (tx) => {
      // 3. Eliminar el detalle de la entrega
      await tx.detalleEntrega.delete({
        where: { id: detalle.id }
      })

      // 4. Restaurar estado original del tubo
      const estadoRestaurado = detalle.estadoAnterior || 'CARGADO'
      await tx.tubo.update({
        where: { id: tuboId },
        data: {
          estado: estadoRestaurado,
          clienteId: null,
          ubicacion: 'Planta/Salón'
        }
      })

      // 5. Eliminar alquileres o ventas asociados a esta entrega y tubo si se crearon
      await tx.alquiler.deleteMany({
        where: { entregaId: id, tuboId }
      })

      await tx.venta.deleteMany({
        where: { clienteId: entrega.clienteId, tuboId }
      })

      // 6. Limpiar observaciones de la entrega
      if (entrega.observaciones) {
        const remainingAdicionales = entrega.detalles.filter(d => d.id !== detalle.id && d.esAdicional)
        let partes = entrega.observaciones.split('|').map(p => p.trim()).filter(Boolean)
        
        if (remainingAdicionales.length === 0) {
          partes = partes.filter(p => !p.includes('Agregado por repartidor'))
        } else {
          partes = partes.filter(p => !p.includes(`: ${tuboId}]`))
        }
        
        const obsLimpia = partes.join(' | ').trim()
        await tx.entrega.update({
          where: { id },
          data: { observaciones: obsLimpia || null }
        })
      }

      // 7. Registrar auditoría
      const usuarioExiste = req.user?.id ? await tx.usuario.findUnique({ where: { id: req.user.id } }) : null
      await tx.auditoria.create({
        data: {
          tuboId,
          usuarioId: usuarioExiste ? usuarioExiste.id : null,
          accion: `Tubo adicional eliminado de entrega en tránsito`,
          estadoAnterior: 'RESERVADO',
          estadoNuevo: estadoRestaurado,
          metadata: { entregaId: id, numero: entrega.numero }
        }
      })
    })

    res.json({ message: 'Tubo adicional removido con éxito del pedido' })
  } catch (err) {
    next(err)
  }
})

export default router
