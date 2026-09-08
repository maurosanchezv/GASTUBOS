// gastubos/backend/src/utils/fechas.js
//
// Aritmética de fechas para períodos de alquiler, en calendario UTC puro
// (año/mes/día), nunca por diferencia de milisegundos ni por setDate() sobre
// un Date con hora local — eso es lo que introduce corrimientos de un día
// cuando el proceso corre en una zona horaria distinta a America/Asuncion.

// Trunca cualquier Date a medianoche UTC del mismo año/mes/día.
export function aMedianocheUTC(fecha) {
  const d = new Date(fecha)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

// Suma (o resta, con dias negativo) días de calendario a una fecha, operando
// sobre los componentes Y-M-D en UTC — evita drift por horario de verano o
// diferencias de zona horaria entre el servidor y Paraguay.
export function sumarDias(fecha, dias) {
  const d = aMedianocheUTC(fecha)
  d.setUTCDate(d.getUTCDate() + dias)
  return d
}

// true si `fecha` (medianoche UTC) ya pasó respecto a hoy (medianoche UTC).
export function yaVencio(fecha) {
  return aMedianocheUTC(fecha).getTime() < aMedianocheUTC(new Date()).getTime()
}

// Días de calendario entre hoy y `fecha` (positivo = en el futuro, negativo = vencido).
export function diasHasta(fecha) {
  const msPorDia = 24 * 60 * 60 * 1000
  return Math.round((aMedianocheUTC(fecha).getTime() - aMedianocheUTC(new Date()).getTime()) / msPorDia)
}
