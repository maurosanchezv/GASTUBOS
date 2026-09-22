// gastubos/frontend/src/utils/ticketMontos.js
//
// Cálculo del monto que se muestra en las remisiones/tickets.
//
// En las entregas tipo ALQUILER, DetalleEntrega.subtotal se guarda en 0 a
// propósito (el cobro real lo lleva CargoAlquiler, y Movimiento de Dinero
// excluye estas entregas para no duplicar). Pero el ticket sí tiene que
// mostrarle al cliente/chofer el pago inicial del plan — que vive como
// snapshot en Alquiler.precioInicialAplicado. Estas funciones centralizan
// esa lógica para que todos los renderers de ticket (térmico y HTML) usen
// el mismo criterio.

// Contratos vigentes de la entrega (excluye los cancelados).
function contratosVigentes(entrega) {
  return (entrega?.alquileres || []).filter(a => a.estado !== 'CANCELADO')
}

// Pago inicial de plan de una entrega ALQUILER: suma de precioInicialAplicado
// de cada contrato (1 tubo = 1 contrato = 1 equipo).
export function montoInicialAlquiler(entrega) {
  if (!entrega || entrega.tipoOperacion !== 'ALQUILER') return 0
  return contratosVigentes(entrega).reduce((s, a) => s + Number(a.precioInicialAplicado || 0), 0)
}

// Precio que corresponde mostrar en la fila de un DetalleEntrega puntual.
// ALQUILER → precioInicialAplicado del contrato de ese tubo; resto → subtotal.
export function precioFilaDetalle(entrega, detalle) {
  if (entrega?.tipoOperacion === 'ALQUILER') {
    const alq = contratosVigentes(entrega).find(a => a.tuboId === detalle.tuboId)
    return Number(alq?.precioInicialAplicado || 0)
  }
  return Number(detalle?.subtotal || 0)
}

// Subtotal de ítems/productos de la entrega (sin delivery).
export function subtotalItemsTicket(entrega) {
  if (entrega?.tipoOperacion === 'ALQUILER') return montoInicialAlquiler(entrega)
  return (entrega?.detalles || []).reduce((s, d) => s + Number(d.subtotal || 0), 0)
}

// Subtotal de productos de catálogo agregados a la entrega ("Agregar
// productos"), independiente del tipoOperacion.
export function subtotalProductosTicket(entrega) {
  return Number(entrega?.ventaProducto?.total || 0)
}

// Total del ticket = subtotal de ítems + productos de catálogo + delivery.
export function totalTicket(entrega) {
  return subtotalItemsTicket(entrega) + subtotalProductosTicket(entrega) + Number(entrega?.costoDelivery || 0)
}
