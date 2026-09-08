// gastubos/backend/src/utils/alquilerCargos.js
//
// Lógica económica central del alquiler: crear el cargo INICIAL al confirmar
// la entrega, y la función idempotente que genera las mensualidades pendientes
// y recalcula el estado financiero de cada contrato. Pensada para poder
// invocarse desde un botón administrativo, un cron, o ambos — nunca duplica
// nada porque se apoya en la restricción única de la base
// (@@unique([alquilerId, tipo, periodoDesde]) en CargoAlquiler).

import { sumarDias, aMedianocheUTC, diasHasta } from './fechas.js'

// ─── Estado financiero ─────────────────────────────────────────────────────
// VENCIDO            > hay un cargo PENDIENTE/PARCIAL cuya fecha de vencimiento ya pasó
// PAGO_PENDIENTE      > hay un cargo PENDIENTE/PARCIAL, todavía no vencido
// PROXIMO_VENCIMIENTO > nada pendiente, pero faltan <= 7 días para el próximo cobro
// AL_DIA              > nada pendiente y faltan > 7 días
export function calcularEstadoFinanciero({ proximaFechaCobro, cargosPendientes }) {
  const hayVencido = cargosPendientes.some(c => aMedianocheUTC(c.fechaVencimiento) < aMedianocheUTC(new Date()))
  if (hayVencido) return 'VENCIDO'
  if (cargosPendientes.length > 0) return 'PAGO_PENDIENTE'
  if (diasHasta(proximaFechaCobro) <= 7) return 'PROXIMO_VENCIMIENTO'
  return 'AL_DIA'
}

// Nivel de alerta visual (frontend) según cuántos días faltan para el próximo
// cobro — puramente informativo de agenda, no depende del estado de pago.
export function calcularNivelAlerta(proximaFechaCobro) {
  const dias = diasHasta(proximaFechaCobro)
  if (dias < 0)  return 'vencido'        // rojo crítico
  if (dias === 0) return 'hoy'           // rojo
  if (dias <= 3) return 'proximo3'       // naranja
  if (dias <= 7) return 'proximo7'       // amarillo
  return 'normal'
}

// Recalcula y persiste estadoFinanciero de UN alquiler puntual. Única función
// que debe llamarse después de cualquier operación que pueda mover la deuda
// del contrato (pagar, anular cargo, generar mensualidad) — así el criterio
// de AL_DIA/PROXIMO_VENCIMIENTO/PAGO_PENDIENTE/VENCIDO vive en un solo lugar.
export async function recalcularEstadoFinancieroAlquiler(tx, alquilerId) {
  const alquiler = await tx.alquiler.findUnique({
    where: { id: alquilerId },
    include: { cargos: { where: { estado: { in: ['PENDIENTE', 'PARCIAL', 'VENCIDO'] } } } },
  })
  if (!alquiler) return null

  const nuevoEstado = calcularEstadoFinanciero({
    proximaFechaCobro: alquiler.fechaVencimiento,
    cargosPendientes: alquiler.cargos,
  })
  if (nuevoEstado === alquiler.estadoFinanciero) return alquiler

  return tx.alquiler.update({ where: { id: alquilerId }, data: { estadoFinanciero: nuevoEstado } })
}

// Error tipado: la ruta HTTP lo usa para devolver el status/mensaje correctos
// sin tener que inspeccionar el texto del error.
export class ErrorPagoAlquiler extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'ErrorPagoAlquiler'
    this.status = status
  }
}

// ─── Registrar un pago sobre un cargo ──────────────────────────────────────
// Fuente de verdad del dinero: crea un PagoCargoAlquiler (nunca pisa uno
// anterior) y mantiene CargoAlquiler.montoPagado como acumulado/cache.
// Nunca recorta el monto en silencio: si supera el saldo pendiente, rechaza
// la operación completa — no crea el pago ni toca el cargo.
export async function registrarPagoCargo(tx, { cargoAlquilerId, monto, metodoPago, fechaPago, observacion, usuarioId }) {
  const cargo = await tx.cargoAlquiler.findUnique({ where: { id: cargoAlquilerId } })
  if (!cargo) throw new ErrorPagoAlquiler('Cargo no encontrado', 404)
  if (cargo.estado === 'ANULADO') throw new ErrorPagoAlquiler('El cargo está anulado')
  if (cargo.estado === 'PAGADO')  throw new ErrorPagoAlquiler('El cargo ya está pagado')

  const montoNum = Number(monto)
  const saldo = Number(cargo.monto) - Number(cargo.montoPagado)
  if (montoNum > saldo) {
    throw new ErrorPagoAlquiler('El monto supera el saldo pendiente del cargo')
  }

  const fechaPagoFinal = fechaPago || new Date()

  const pago = await tx.pagoCargoAlquiler.create({
    data: { cargoAlquilerId, monto: montoNum, metodoPago, fechaPago: fechaPagoFinal, observacion, usuarioId },
  })

  const nuevoPagado = Number(cargo.montoPagado) + montoNum
  const nuevoEstado = nuevoPagado >= Number(cargo.monto) ? 'PAGADO' : 'PARCIAL'

  const cargoActualizado = await tx.cargoAlquiler.update({
    where: { id: cargoAlquilerId },
    data: {
      montoPagado: nuevoPagado,
      estado: nuevoEstado,
      // Legacy (ver comentario en el modelo): queda el último pago nada más.
      metodoPago,
      fechaPago: fechaPagoFinal,
      observacion: observacion || cargo.observacion,
    },
  })

  await recalcularEstadoFinancieroAlquiler(tx, cargo.alquilerId)

  return { cargo: cargoActualizado, pago }
}

// ─── Anular un cargo ────────────────────────────────────────────────────────
// Rechaza si ya tiene pagos registrados: todavía no existe un mecanismo de
// reversión, así que anular ahí borraría trazabilidad de dinero ya cobrado.
export async function anularCargo(tx, { cargoAlquilerId, motivo }) {
  const cargo = await tx.cargoAlquiler.findUnique({ where: { id: cargoAlquilerId } })
  if (!cargo) throw new ErrorPagoAlquiler('Cargo no encontrado', 404)
  if (cargo.estado === 'ANULADO') throw new ErrorPagoAlquiler('El cargo ya está anulado')

  const cantPagos = await tx.pagoCargoAlquiler.count({ where: { cargoAlquilerId } })
  if (cantPagos > 0) {
    throw new ErrorPagoAlquiler('No se puede anular un cargo que posee pagos registrados')
  }

  const cargoActualizado = await tx.cargoAlquiler.update({
    where: { id: cargoAlquilerId },
    data: { estado: 'ANULADO', observacion: motivo || cargo.observacion },
  })

  await recalcularEstadoFinancieroAlquiler(tx, cargo.alquilerId)

  return cargoActualizado
}

// ─── Cargo INICIAL ──────────────────────────────────────────────────────────
// Se crea una sola vez, al confirmar la entrega (momento en que se conoce la
// fecha real de inicio). Si ya existe (reintento de confirmación, etc.) no
// duplica: se apoya en el mismo @@unique que las mensualidades.
export async function crearCargoInicial(tx, alquiler, { montoPagado = 0, metodoPago = null, fechaPago = null, usuarioId = null } = {}) {
  const periodoDesde = aMedianocheUTC(alquiler.fechaInicio)

  const existente = await tx.cargoAlquiler.findUnique({
    where: { alquilerId_tipo_periodoDesde: { alquilerId: alquiler.id, tipo: 'INICIAL', periodoDesde } },
  })
  if (existente) return existente // idempotente: no pisa un pago ya registrado

  const monto = Number(alquiler.precioInicialAplicado || 0)
  // El monto recibido en la confirmación de entrega cubre potencialmente más
  // que el alquiler (delivery, vuelto, etc.) — acá sí seguimos recortando en
  // silencio al precio del plan, a diferencia de POST /cargos/:id/pagar, que
  // ahora rechaza cualquier exceso explícito del operador (ver esa ruta).
  const pagado = Math.min(Number(montoPagado || 0), monto)
  const estado = pagado >= monto && monto > 0 ? 'PAGADO' : (pagado > 0 ? 'PARCIAL' : 'PENDIENTE')
  const fechaPagoFinal = pagado > 0 ? (fechaPago || new Date()) : null

  const cargo = await tx.cargoAlquiler.create({
    data: {
      alquilerId: alquiler.id,
      tipo: 'INICIAL',
      periodoDesde,
      periodoHasta: aMedianocheUTC(alquiler.primerPeriodoHasta),
      fechaEmision: new Date(),
      fechaVencimiento: periodoDesde, // pago por adelantado, vence al inicio
      monto,
      montoPagado: pagado,
      estado,
      // Legacy (ver comentario en el modelo): reflejan el pago inicial, que
      // en este caso puntual siempre es uno solo, así que no hay ambigüedad.
      metodoPago: pagado > 0 ? metodoPago : null,
      fechaPago: fechaPagoFinal,
      observacion: 'Cargo inicial generado automáticamente al confirmar la entrega',
    },
  })

  // Fuente de verdad del cobro: el mismo pago también queda en PagoCargoAlquiler,
  // igual que cualquier otro pago (así Movimiento de Dinero lee de un solo lugar).
  if (pagado > 0 && usuarioId) {
    await tx.pagoCargoAlquiler.create({
      data: {
        cargoAlquilerId: cargo.id,
        monto: pagado,
        metodoPago: metodoPago || 'EFECTIVO',
        fechaPago: fechaPagoFinal,
        observacion: 'Pago inicial recibido al confirmar la entrega',
        usuarioId,
      },
    })
  }

  // Si el cargo quedó PENDIENTE/PARCIAL (no se cobró todo en el momento), el
  // contrato recién activado debe reflejarlo ya mismo, no recién en la
  // próxima corrida de generar-mensualidades.
  await recalcularEstadoFinancieroAlquiler(tx, alquiler.id)

  return cargo
}

// ─── Cargo OTRO (delivery / conceptos adicionales de la entrega) ──────────
// PRECHECK de Etapa 2: si al confirmar una entrega ALQUILER el monto recibido
// supera precioInicialAplicado (típicamente por costoDelivery), ese excedente
// no puede desaparecer — antes se descartaba en silencio al salir del reparto
// de montoRestante en entregas.js. Se registra acá como un cargo propio
// (tipo OTRO) por el monto exacto de costoDelivery, con el mismo criterio de
// idempotencia y auto-liquidación que crearCargoInicial.
export async function crearCargoDelivery(tx, alquiler, { monto, montoPagado = 0, metodoPago = null, fechaPago = null, usuarioId = null } = {}) {
  if (!monto || monto <= 0) return null

  const periodoDesde = aMedianocheUTC(new Date())
  const existente = await tx.cargoAlquiler.findUnique({
    where: { alquilerId_tipo_periodoDesde: { alquilerId: alquiler.id, tipo: 'OTRO', periodoDesde } },
  })
  if (existente) return existente // idempotente

  const pagado = Math.min(Number(montoPagado || 0), Number(monto))
  const estado = pagado >= Number(monto) ? 'PAGADO' : (pagado > 0 ? 'PARCIAL' : 'PENDIENTE')
  const fechaPagoFinal = pagado > 0 ? (fechaPago || new Date()) : null

  const cargo = await tx.cargoAlquiler.create({
    data: {
      alquilerId: alquiler.id,
      tipo: 'OTRO',
      periodoDesde,
      periodoHasta: periodoDesde,
      fechaEmision: new Date(),
      fechaVencimiento: periodoDesde,
      monto,
      montoPagado: pagado,
      estado,
      metodoPago: pagado > 0 ? metodoPago : null,
      fechaPago: fechaPagoFinal,
      observacion: 'Costo de delivery de la entrega inicial del alquiler',
    },
  })

  if (pagado > 0 && usuarioId) {
    await tx.pagoCargoAlquiler.create({
      data: {
        cargoAlquilerId: cargo.id,
        monto: pagado,
        metodoPago: metodoPago || 'EFECTIVO',
        fechaPago: fechaPagoFinal,
        observacion: 'Delivery cobrado al confirmar la entrega',
        usuarioId,
      },
    })
  }

  await recalcularEstadoFinancieroAlquiler(tx, alquiler.id)

  return cargo
}

// ─── Cargo RECARGA_DOMICILIO (ETAPA 2 — OrdenRecargaAlquiler) ─────────────
// A diferencia de crearCargoInicial/crearCargoDelivery (que auto-liquidan
// recortando en silencio, porque ese monto viene de un cobro combinado de la
// entrega), acá el monto lo tipea el repartidor específicamente para ESTE
// servicio — mismo criterio que POST /alquileres/:id/cargos/:id/pagar en
// ETAPA 1.1: si se pasa del precio, se rechaza en vez de recortar.
// No busca un cargo existente por [alquilerId, tipo, periodoDesde] como
// idempotencia propia — esa la da completarOrdenRecarga() con su
// compare-and-swap sobre OrdenRecargaAlquiler.estado (ver ordenesRecarga.js);
// acá periodoDesde usa el timestamp completo (no truncado a medianoche)
// justamente para no chocar si hay dos servicios distintos el mismo día.
export async function crearCargoRecarga(tx, alquiler, { monto, montoPagado = 0, metodoPago = null, fechaPago = null, usuarioId = null, ordenNumero = '' } = {}) {
  const montoNum = Number(monto || 0)
  const pagado = Number(montoPagado || 0)
  if (pagado > montoNum) {
    throw new ErrorPagoAlquiler('El monto cobrado supera el precio de la recarga', 400)
  }

  const periodoDesde = new Date()
  const estado = pagado >= montoNum && montoNum > 0 ? 'PAGADO' : (pagado > 0 ? 'PARCIAL' : 'PENDIENTE')
  const fechaPagoFinal = pagado > 0 ? (fechaPago || new Date()) : null

  const cargo = await tx.cargoAlquiler.create({
    data: {
      alquilerId: alquiler.id,
      tipo: 'RECARGA_DOMICILIO',
      periodoDesde,
      periodoHasta: periodoDesde,
      fechaEmision: periodoDesde,
      fechaVencimiento: periodoDesde,
      monto: montoNum,
      montoPagado: pagado,
      estado,
      metodoPago: pagado > 0 ? metodoPago : null,
      fechaPago: fechaPagoFinal,
      observacion: `Recarga a domicilio${ordenNumero ? ` (orden ${ordenNumero})` : ''}`,
    },
  })

  if (pagado > 0 && usuarioId) {
    await tx.pagoCargoAlquiler.create({
      data: {
        cargoAlquilerId: cargo.id,
        monto: pagado,
        metodoPago: metodoPago || 'EFECTIVO',
        fechaPago: fechaPagoFinal,
        observacion: 'Cobrado al completar el servicio de recarga',
        usuarioId,
      },
    })
  }

  await recalcularEstadoFinancieroAlquiler(tx, alquiler.id)

  return cargo
}

// ─── Generación idempotente de mensualidades + refresco de estado ─────────
// Recorre los alquileres ACTIVOS con plan asignado; por cada uno, si el
// período vigente ya venció, crea la(s) mensualidad(es) que falten (backfill
// si pasó más de un mes sin correr esta función) y actualiza fechaVencimiento
// del contrato al nuevo período. Al final recalcula estadoFinanciero de todos
// los alquileres ACTIVOS (generen o no cargo nuevo) y marca como VENCIDO los
// cargos PENDIENTE/PARCIAL cuya fecha ya pasó.
//
// Idempotente: puede llamarse las veces que sea (botón, cron, doble click)
// sin crear mensualidades repetidas — la restricción única de la base es la
// última línea de defensa incluso si dos llamadas corren en simultáneo.
export async function generarMensualidadesPendientes(tx) {
  const hoy = aMedianocheUTC(new Date())

  const alquileresActivos = await tx.alquiler.findMany({
    where: { estado: 'ACTIVO' },
    include: { plan: true },
  })

  const resumen = { mensualidadesCreadas: 0, alquileresActualizados: 0, alquileresSinPlan: [] }

  for (const alquiler of alquileresActivos) {
    if (!alquiler.plan || !alquiler.diasIncluidosAplicados) {
      // Alquiler histórico sin plan: no se le puede calcular un monto de
      // mensualidad sin inventar un precio. Se deja tal cual, documentado.
      resumen.alquileresSinPlan.push(alquiler.id)
      continue
    }

    let periodoHastaActual = aMedianocheUTC(alquiler.fechaVencimiento)
    const montoMensual = Number(alquiler.precioMensualAplicado || 0)
    const diasPeriodo = alquiler.diasIncluidosAplicados

    // Backfill: si pasó más de un período sin generar mensualidad, las crea todas.
    while (periodoHastaActual < hoy) {
      const periodoDesde = periodoHastaActual
      const periodoHasta = sumarDias(periodoDesde, diasPeriodo)

      // Existencia explícita en vez de upsert: así sabemos con certeza si la
      // creamos ahora o ya existía, sin depender de comparar timestamps.
      const existente = await tx.cargoAlquiler.findUnique({
        where: {
          alquilerId_tipo_periodoDesde: {
            alquilerId: alquiler.id,
            tipo: 'MENSUALIDAD',
            periodoDesde,
          },
        },
      })
      if (!existente) {
        await tx.cargoAlquiler.create({
          data: {
            alquilerId: alquiler.id,
            tipo: 'MENSUALIDAD',
            periodoDesde,
            periodoHasta,
            fechaEmision: new Date(),
            fechaVencimiento: periodoDesde, // se debe desde que arranca el nuevo período
            monto: montoMensual,
            estado: 'PENDIENTE',
            observacion: `Mensualidad generada automáticamente (período ${periodoDesde.toISOString().slice(0,10)} → ${periodoHasta.toISOString().slice(0,10)})`,
          },
        })
        resumen.mensualidadesCreadas++
      }

      periodoHastaActual = periodoHasta
    }

    if (periodoHastaActual.getTime() !== aMedianocheUTC(alquiler.fechaVencimiento).getTime()) {
      await tx.alquiler.update({
        where: { id: alquiler.id },
        data: { fechaVencimiento: periodoHastaActual },
      })
      resumen.alquileresActualizados++
    }
  }

  // Marcar como VENCIDO los cargos pendientes/parciales cuya fecha ya pasó
  // (de cualquier alquiler, no solo los recorridos arriba).
  await tx.cargoAlquiler.updateMany({
    where: { estado: { in: ['PENDIENTE', 'PARCIAL'] }, fechaVencimiento: { lt: hoy } },
    data: { estado: 'VENCIDO' },
  })

  // Recalcular estadoFinanciero de todos los alquileres con contrato abierto,
  // vía la misma función central que usan pagar/anular (nada de lógica duplicada).
  const alquileresParaRecalcular = await tx.alquiler.findMany({
    where: { estado: { in: ['ACTIVO', 'PENDIENTE_ENTREGA'] } },
    select: { id: true },
  })
  for (const { id: alquilerId } of alquileresParaRecalcular) {
    await recalcularEstadoFinancieroAlquiler(tx, alquilerId)
  }

  return resumen
}
