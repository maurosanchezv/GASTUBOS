// gastubos/backend/src/utils/ordenesRecarga.js
//
// Lógica central para completar/cancelar una OrdenRecargaAlquiler. Vive acá
// (no en la ruta) por el mismo motivo que alquilerCargos.js: que la ruta HTTP
// sea una capa fina y no haya dos lugares con la misma lógica de negocio.

import { crearCargoRecarga } from './alquilerCargos.js'
import { recambiarTubo, ErrorAlquilerTubo } from './alquilerTubos.js'

export class ErrorOrdenRecarga extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'ErrorOrdenRecarga'
    this.status = status
  }
}

const ESTADOS_COMPLETABLES = ['ASIGNADA', 'EN_RUTA', 'EN_SERVICIO']

// Completa una orden dentro de una transacción. Concurrencia: el primer paso
// es un UPDATE condicionado al estado actual (compare-and-swap) — si dos
// repartidores completan la misma orden en simultáneo, solo uno gana la
// carrera; el otro recibe ErrorOrdenRecarga con status 409 y no deja rastro.
export async function completarOrdenRecarga(tx, {
  ordenId,
  usuarioId,
  tuboNuevoId,      // requerido solo para RECAMBIO_TUBO
  metodoPago,       // 'EFECTIVO' | 'TRANSFERENCIA' | null (no cobrado)
  montoPagado = 0,
  // Descuento opcional del stock de gas del camión (solo RECARGA_MISMO_TUBO):
  // el repartidor rellenó el tubo del cliente con gas de un tubo RESERVADO de
  // su camión. No cambia el monto que se cobra (ese sigue siendo el precio del
  // contrato) — es puramente movimiento de inventario, en espejo de venta-camion.
  descontarCamion = false,
  tuboOrigenId,     // tubo RESERVADO del camión del que sale el gas
  cantidadGas = 0,  // kg/m³ a descontar de tuboOrigen.cantidadActual
}) {
  const orden = await tx.ordenRecargaAlquiler.findUnique({
    where: { id: ordenId },
    include: { alquiler: true, tubo: true },
  })
  if (!orden) throw new ErrorOrdenRecarga('Orden no encontrada', 404)

  if (orden.estado === 'COMPLETADA') {
    // Idempotencia: no es un error de negocio, es un reintento — se devuelve
    // el resultado ya existente en vez de duplicar cargo/pago/recambio.
    throw new ErrorOrdenRecarga('Esta orden ya fue completada', 409)
  }
  if (orden.estado === 'CANCELADA') {
    throw new ErrorOrdenRecarga('Esta orden está cancelada', 400)
  }

  if (descontarCamion && orden.tipoServicio !== 'RECARGA_MISMO_TUBO') {
    throw new ErrorOrdenRecarga('El descuento de gas del camión solo aplica a la recarga del mismo tubo', 400)
  }

  const fechaFinalizacion = new Date()

  // Compare-and-swap: reclama la orden antes de tocar nada más. Si otro
  // proceso ya la completó entre el findUnique de arriba y este update,
  // count será 0 y abortamos sin haber escrito nada.
  const claim = await tx.ordenRecargaAlquiler.updateMany({
    where: { id: ordenId, estado: { in: ESTADOS_COMPLETABLES } },
    data: {
      estado: 'COMPLETADA',
      fechaInicioServicio: orden.fechaInicioServicio || fechaFinalizacion,
      fechaFinalizacion,
    },
  })
  if (claim.count === 0) {
    throw new ErrorOrdenRecarga('La orden ya no está en un estado que se pueda completar (otra operación la modificó primero)', 409)
  }

  let tuboViejo = null
  let tuboNuevo = null
  let descuentoCamion = null

  if (orden.tipoServicio === 'RECAMBIO_TUBO') {
    if (!tuboNuevoId) throw new ErrorOrdenRecarga('Falta indicar el tubo nuevo para el recambio', 400)
    if (tuboNuevoId === orden.tuboId) throw new ErrorOrdenRecarga('El tubo nuevo no puede ser el mismo que se retira', 400)

    const candidato = await tx.tubo.findUnique({ where: { id: tuboNuevoId, activo: true } })
    if (!candidato) throw new ErrorOrdenRecarga('Tubo nuevo no encontrado o inactivo', 404)

    const ESTADOS_DISPONIBLES = ['DISPONIBLE', 'CARGADO', 'RESERVADO']
    if (!ESTADOS_DISPONIBLES.includes(candidato.estado)) {
      throw new ErrorOrdenRecarga(`El tubo ${tuboNuevoId} no está disponible (estado: ${candidato.estado})`, 400)
    }
    if (candidato.gas !== orden.tubo.gas) {
      throw new ErrorOrdenRecarga(`El tubo ${tuboNuevoId} es de ${candidato.gas}, se necesita ${orden.tubo.gas}`, 400)
    }

    // Cierra la asignación vigente y abre la nueva — valida además que nadie
    // más tenga tuboNuevo activo en otro contrato (además del índice único
    // parcial de la base, que es el backstop final).
    try {
      await recambiarTubo(tx, {
        alquilerId: orden.alquilerId,
        tuboNuevoId,
        motivo: 'RECAMBIO',
        fecha: fechaFinalizacion,
      })
    } catch (err) {
      if (err instanceof ErrorAlquilerTubo) throw new ErrorOrdenRecarga(err.message, err.status)
      throw err
    }

    // Movimiento físico: el tubo que se retira vuelve al camión del
    // repartidor (si tiene uno seleccionado) o al depósito — mismo criterio
    // que ya usa el recambio genérico de entregas.js. El tubo entregado pasa
    // a estar con el cliente. No se toca cantidadActual: eso es exclusivo de
    // venta-camion (gas fraccionado), acá se intercambian tubos completos.
    const camionRepartidor = orden.camionId
      ? await tx.camion.findUnique({ where: { id: orden.camionId } })
      : null

    tuboViejo = await tx.tubo.update({
      where: { id: orden.tuboId },
      data: {
        estado: 'DEVUELTO',
        clienteId: null,
        camionId: camionRepartidor ? camionRepartidor.id : null,
        ubicacion: camionRepartidor ? `Camión ${camionRepartidor.placa}` : 'Depósito',
      },
    })
    tuboNuevo = await tx.tubo.update({
      where: { id: tuboNuevoId },
      data: {
        estado: 'ALQUILADO',
        clienteId: orden.clienteId,
        camionId: null,
        ubicacion: 'Cliente',
      },
    })

    await tx.auditoria.create({
      data: {
        tuboId: tuboViejo.id, usuarioId,
        accion: 'Recambio de alquiler: tubo retirado',
        estadoAnterior: 'ALQUILADO', estadoNuevo: 'DEVUELTO',
        metadata: { ordenRecargaId: orden.id, numero: orden.numero, alquilerId: orden.alquilerId, tuboNuevoId },
      },
    })
    await tx.auditoria.create({
      data: {
        tuboId: tuboNuevo.id, usuarioId,
        accion: 'Recambio de alquiler: tubo entregado',
        estadoAnterior: candidato.estado, estadoNuevo: 'ALQUILADO',
        metadata: { ordenRecargaId: orden.id, numero: orden.numero, alquilerId: orden.alquilerId, tuboRetiradoId: orden.tuboId },
      },
    })
  } else {
    // RECARGA_MISMO_TUBO: el cliente conserva su tubo — no cambia AlquilerTubo
    // ni Alquiler.tuboId. Se registra igual el servicio para trazabilidad.
    await tx.auditoria.create({
      data: {
        tuboId: orden.tuboId, usuarioId,
        accion: 'Recarga a domicilio completada (mismo tubo)',
        metadata: { ordenRecargaId: orden.id, numero: orden.numero, alquilerId: orden.alquilerId },
      },
    })

    // Descuento opcional del stock del camión — mismo mecanismo que
    // POST /cargas/venta-camion: valida el tubo origen, descuenta cantidadActual
    // y, si se agota, saca el tubo del camión y lo deja VACIO.
    if (descontarCamion) {
      const cant = Number(cantidadGas)
      if (!tuboOrigenId) throw new ErrorOrdenRecarga('Indicá de qué tubo del camión sale el gas', 400)
      if (!(cant > 0)) throw new ErrorOrdenRecarga('La cantidad de gas a descontar debe ser mayor a 0', 400)

      const tuboOrigen = await tx.tubo.findUnique({ where: { id: tuboOrigenId, activo: true } })
      if (!tuboOrigen) throw new ErrorOrdenRecarga('Tubo origen no encontrado o inactivo', 404)
      if (tuboOrigen.estado !== 'RESERVADO') {
        throw new ErrorOrdenRecarga(`El tubo ${tuboOrigenId} no está cargado en un camión (estado: ${tuboOrigen.estado})`, 400)
      }
      // El gas tiene que salir del camión asignado a la orden.
      if (orden.camionId && tuboOrigen.camionId !== orden.camionId) {
        throw new ErrorOrdenRecarga('Ese tubo no está en el camión asignado a esta orden', 400)
      }
      const disponible = Number(tuboOrigen.cantidadActual || 0)
      if (disponible <= 0) throw new ErrorOrdenRecarga('El tubo del camión no tiene gas disponible', 400)
      if (cant > disponible) {
        throw new ErrorOrdenRecarga(`Solo quedan ${disponible} disponibles en el tubo ${tuboOrigenId}`, 400)
      }

      const restante = disponible - cant
      const seAgota = restante <= 0

      const tuboOrigenActualizado = await tx.tubo.update({
        where: { id: tuboOrigenId },
        data: seAgota
          ? { cantidadActual: 0, estado: 'VACIO', camionId: null, ubicacion: 'Depósito' }
          : { cantidadActual: restante },
      })

      await tx.auditoria.create({
        data: {
          tuboId: tuboOrigenId, usuarioId,
          accion: 'Recarga de alquiler: gas descontado del camión',
          estadoAnterior: seAgota ? 'RESERVADO' : null,
          estadoNuevo: seAgota ? 'VACIO' : null,
          metadata: {
            ordenRecargaId: orden.id, numero: orden.numero, alquilerId: orden.alquilerId,
            tuboClienteId: orden.tuboId, cantidad: cant, restante: seAgota ? 0 : restante,
          },
        },
      })

      descuentoCamion = { tuboOrigen: tuboOrigenActualizado, cantidad: cant, restante: seAgota ? 0 : restante, seAgota }
    }

    // Persiste el descuento (o lo deja en null si no se aplicó) para el ticket
    // y el historial del repartidor.
    await tx.ordenRecargaAlquiler.update({
      where: { id: ordenId },
      data: {
        tuboOrigenId: descontarCamion ? tuboOrigenId : null,
        cantidadGasRecargada: descontarCamion ? Number(cantidadGas) : null,
      },
    })
  }

  // Cobro: un CargoAlquiler propio (RECARGA_DOMICILIO), pagado en el momento
  // si corresponde — misma infraestructura que INICIAL/MENSUALIDAD.
  const cargo = await crearCargoRecarga(tx, orden.alquiler, {
    monto: orden.precioAplicado,
    montoPagado,
    metodoPago,
    fechaPago: montoPagado > 0 ? fechaFinalizacion : null,
    usuarioId,
    ordenNumero: orden.numero,
  })

  await tx.ordenRecargaAlquiler.update({ where: { id: ordenId }, data: { cargoAlquilerId: cargo.id } })

  await tx.auditoria.create({
    data: {
      usuarioId,
      accion: `Servicio de alquiler completado (${orden.tipoServicio})`,
      observaciones: montoPagado > 0 ? `Cobrado Gs. ${montoPagado} vía ${metodoPago}` : 'Sin cobrar en el momento',
      metadata: { ordenRecargaId: orden.id, numero: orden.numero, alquilerId: orden.alquilerId, cargoAlquilerId: cargo.id },
    },
  })

  return { orden: await tx.ordenRecargaAlquiler.findUnique({ where: { id: ordenId } }), cargo, tuboViejo, tuboNuevo, descuentoCamion }
}

export async function cancelarOrdenRecarga(tx, { ordenId, motivo, usuarioId }) {
  const orden = await tx.ordenRecargaAlquiler.findUnique({ where: { id: ordenId } })
  if (!orden) throw new ErrorOrdenRecarga('Orden no encontrada', 404)
  if (orden.estado === 'COMPLETADA') {
    throw new ErrorOrdenRecarga('No se puede cancelar una orden ya completada — se necesita un proceso de corrección aparte', 400)
  }
  if (orden.estado === 'CANCELADA') {
    throw new ErrorOrdenRecarga('La orden ya está cancelada', 400)
  }

  const claim = await tx.ordenRecargaAlquiler.updateMany({
    where: { id: ordenId, estado: { not: { in: ['COMPLETADA', 'CANCELADA'] } } },
    data: { estado: 'CANCELADA', motivoCancelacion: motivo || null },
  })
  if (claim.count === 0) {
    throw new ErrorOrdenRecarga('La orden ya no está en un estado que se pueda cancelar', 409)
  }

  await tx.auditoria.create({
    data: {
      usuarioId,
      accion: 'Orden de recarga de alquiler cancelada',
      observaciones: motivo || null,
      metadata: { ordenRecargaId: orden.id, numero: orden.numero, alquilerId: orden.alquilerId },
    },
  })

  return tx.ordenRecargaAlquiler.findUnique({ where: { id: ordenId } })
}
