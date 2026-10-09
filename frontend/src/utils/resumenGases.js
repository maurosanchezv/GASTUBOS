// gastubos/frontend/src/utils/resumenGases.js
//
// Resumen "cuánto gas salió" que se muestra debajo del TOTAL en los tickets
// (remisión, comprobante de entrega, venta en camión y carga en salón).
// Agrupa por gas + unidad (KG / M3) y cuenta los tubos de cada grupo. Las
// líneas sin cantidad (envase vacío, alquiler sin carga) no suman.
//
// Lo usan tanto los tickets HTML (components/ResumenGasesTicket.jsx) como los
// térmicos ESC/POS (utils/ticketsImpresion.js).

// lineas: [{ gas, cantidad, unidad }]
// → [{ gas, unidad, cantidad, tubos }] en el orden en que aparece cada gas.
export function resumenGases(lineas) {
  const grupos = new Map()
  for (const l of lineas || []) {
    const cantidad = Number(l?.cantidad)
    if (!(cantidad > 0)) continue
    const gas = String(l.gas || 'Sin gas').trim()
    const unidad = l.unidad || 'KG'
    const key = `${gas.toUpperCase()}|${unidad}`
    const g = grupos.get(key)
    if (g) {
      g.cantidad += cantidad
      g.tubos += 1
    } else {
      grupos.set(key, { gas, unidad, cantidad, tubos: 1 })
    }
  }
  return [...grupos.values()].map(g => ({ ...g, cantidad: Math.round(g.cantidad * 1000) / 1000 }))
}

export const resumenGasesEntrega = (entrega) => resumenGases(
  (entrega?.detalles || []).map(d => ({ gas: d.tubo?.gas, cantidad: d.cantidadGas, unidad: d.unidadGas })),
)

// lineas: el resultado de lineasVentaCamion(venta)
export const resumenGasesVentaCamion = (lineas) => resumenGases(
  (lineas || []).map(l => ({ gas: l.tubo?.gas, cantidad: l.cantidad, unidad: l.unidad })),
)

export const textoTubos = (n) => `${n} tubo${n === 1 ? '' : 's'}`
