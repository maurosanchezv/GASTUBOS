// gastubos/backend/src/utils/alquilerTubos.js
//
// Historial de qué tubo físico estuvo asignado a un contrato de alquiler y
// cuándo (AlquilerTubo). El contrato (Alquiler) nunca cambia de número por
// un recambio de tubo — lo que cambia es cuál AlquilerTubo está activo.
// Alquiler.tuboId se mantiene en paralelo como "tubo actual" de compatibilidad.
//
// Las dos reglas de integridad (máximo un AlquilerTubo activo por alquiler,
// máximo un alquiler activo por tubo) están reforzadas por índices únicos
// parciales en la base (ver migration.sql) — estas funciones ya validan antes
// de escribir, pero el índice es la última línea de defensa ante una carrera.

import { aMedianocheUTC } from './fechas.js'

export class ErrorAlquilerTubo extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'ErrorAlquilerTubo'
    this.status = status
  }
}

async function validarTuboDisponible(tx, tuboId) {
  const asignacion = await tx.alquilerTubo.findFirst({
    where: { tuboId, activo: true },
    include: { alquiler: { select: { numero: true, estado: true } } },
  })
  if (!asignacion) return

  const { numero, estado } = asignacion.alquiler
  const cerrado = ['FINALIZADO', 'CANCELADO'].includes(estado)
  throw new ErrorAlquilerTubo(
    cerrado
      ? `El tubo ${tuboId} conserva una asignación abierta en el alquiler ${numero}, aunque el contrato está ${estado}. Solicite revisar el cierre de esa asignación antes de volver a usar el tubo.`
      : `El tubo ${tuboId} ya está asignado al alquiler ${numero} (estado: ${estado}). Revise ese alquiler y registre la devolución si corresponde antes de volver a asignarlo.`,
    409,
  )
}

async function crearAsignacion(tx, data) {
  try {
    return await tx.alquilerTubo.create({ data })
  } catch (err) {
    // Otra solicitud puede asignar el tubo después de nuestra validación.
    // No consultar dentro de una transacción que ya falló.
    if (err.code === 'P2002') {
      throw new ErrorAlquilerTubo(
        `No se pudo asignar el tubo ${data.tuboId}: el tubo o el alquiler ya tiene una asignación activa. Actualice la pantalla y revise las asignaciones antes de reintentar.`,
        409,
      )
    }
    throw err
  }
}

// Asigna el primer tubo de un contrato recién activado (al confirmar la
// entrega). Idempotente: si ya existe un AlquilerTubo activo para este
// alquiler, no crea uno nuevo (reintento de confirmación, etc.).
export async function asignarTuboInicial(tx, { alquilerId, tuboId, fechaDesde }) {
  const existente = await tx.alquilerTubo.findFirst({ where: { alquilerId, activo: true } })
  if (existente) return existente

  await validarTuboDisponible(tx, tuboId)
  return crearAsignacion(tx, {
      alquilerId,
      tuboId,
      fechaDesde: aMedianocheUTC(fechaDesde),
      motivoAsignacion: 'ENTREGA_INICIAL',
      activo: true,
  })
}

// Cierra el AlquilerTubo activo de un contrato al finalizarlo (devolución,
// recambio con retorno, etc.). Sin esto, el índice único parcial
// alquiler_tubos_un_activo_por_tubo deja el tubo físico "ocupado" para
// siempre y falla el próximo asignarTuboInicial() de ese mismo tubo.
// Idempotente: si el contrato no tiene tubo activo, no hace nada.
export async function cerrarTuboActivo(tx, { alquilerId, fecha } = {}) {
  const activo = await tx.alquilerTubo.findFirst({ where: { alquilerId, activo: true } })
  if (!activo) return null

  return tx.alquilerTubo.update({
    where: { id: activo.id },
    data: { activo: false, fechaHasta: fecha || new Date() },
  })
}

// Recambia el tubo activo de un contrato: cierra la asignación vigente y abre
// una nueva, en la misma transacción, sin tocar fechaInicio/plan/mensualidad/
// historial financiero/número de contrato. Actualiza Alquiler.tuboId en paralelo.
export async function recambiarTubo(tx, { alquilerId, tuboNuevoId, motivo = 'RECAMBIO', fecha } = {}) {
  const fechaCambio = fecha || new Date()

  const activo = await tx.alquilerTubo.findFirst({ where: { alquilerId, activo: true } })
  if (!activo) throw new ErrorAlquilerTubo('El contrato no tiene un tubo activo asignado', 400)
  if (activo.tuboId === tuboNuevoId) throw new ErrorAlquilerTubo('El tubo nuevo es el mismo que ya tiene asignado el contrato', 400)

  // Nadie más puede tener este tubo activo en otro contrato (además del
  // índice único parcial de la base, que es el backstop final ante carreras).
  await validarTuboDisponible(tx, tuboNuevoId)

  await tx.alquilerTubo.update({
    where: { id: activo.id },
    data: { activo: false, fechaHasta: fechaCambio },
  })

  const nuevo = await crearAsignacion(tx, {
      alquilerId,
      tuboId: tuboNuevoId,
      fechaDesde: fechaCambio,
      motivoAsignacion: motivo,
      activo: true,
  })

  await tx.alquiler.update({ where: { id: alquilerId }, data: { tuboId: tuboNuevoId } })

  return { anterior: activo, actual: nuevo }
}
