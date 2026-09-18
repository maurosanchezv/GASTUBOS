// gastubos/frontend/src/utils/metodoPago.js
export const METODO_PAGO_INFO = {
  EFECTIVO:      { label: 'Efectivo',      bg: 'var(--green-light)', color: 'var(--green)' },
  TRANSFERENCIA: { label: 'Transferencia', bg: 'var(--blue-light)',  color: 'var(--blue-dark)' },
  CREDITO:       { label: 'Crédito',       bg: 'var(--amber-light)', color: 'var(--amber)' },
}

export function metodoPagoLabel(metodoPago) {
  return METODO_PAGO_INFO[metodoPago]?.label || metodoPago
}

// ─── Fecha de vencimiento de ventas a crédito ──────────────────────────────
// Se guarda como fecha sin hora, a medianoche UTC (ver parsearFechaVencimiento
// en el backend) — por eso se formatea siempre en UTC acá. Sin esto, un
// vencimiento del 30/09 se muestra como 29/09 en Paraguay (UTC-3).
export function fmtVencimiento(fecha) {
  if (!fecha) return null
  return new Date(fecha).toLocaleDateString('es-PY', { timeZone: 'UTC' })
}

// 'YYYY-MM-DD' de hoy, en hora local (para el min del <input type="date">).
export function hoyLocalStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 'YYYY-MM-DD' de hoy + n días, en hora local (para los botones +7/+15/+30).
export function sumarDiasStr(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// true si la venta es un crédito no cancelado, con saldo pendiente y cuyo
// vencimiento ya pasó. Se calcula al vuelo (no se guarda) para que nunca
// quede desactualizado.
export function estaVencida(venta) {
  if (venta.cancelada || venta.metodoPago !== 'CREDITO' || !venta.fechaVencimiento) return false
  const saldo = Number(venta.total) - Number(venta.montoCobrado || 0)
  if (saldo <= 0) return false
  const hoyUTC = new Date(hoyLocalStr() + 'T00:00:00.000Z')
  return new Date(venta.fechaVencimiento) < hoyUTC
}
