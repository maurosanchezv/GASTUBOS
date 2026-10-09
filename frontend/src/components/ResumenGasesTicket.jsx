// gastubos/frontend/src/components/ResumenGasesTicket.jsx
//
// Bloque "Resumen de gas" debajo del TOTAL en los tickets HTML de ~80mm.
// El equivalente térmico ESC/POS es imprimirResumenGases en
// utils/ticketsImpresion.js. Mantener ambos en sincronía.
//
// props:
//   resumen — salida de resumenGases() / resumenGasesEntrega() / resumenGasesVentaCamion()
import { formatNumberSpanish } from '../utils/ticketMontos.js'
import { textoTubos } from '../utils/resumenGases.js'

export default function ResumenGasesTicket({ resumen }) {
  if (!resumen || resumen.length === 0) return null

  return (
    <div style={{ margin: '8px 0', fontSize: '10px', borderTop: '1px dashed #000', paddingTop: '4px' }}>
      <strong>RESUMEN DE GAS:</strong>
      {resumen.map(g => (
        <div key={`${g.gas}|${g.unidad}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{g.gas}</span>
          <span style={{ fontWeight: 'bold' }}>
            {formatNumberSpanish(g.cantidad)} {g.unidad} <span style={{ fontWeight: 'normal', color: '#555' }}>({textoTubos(g.tubos)})</span>
          </span>
        </div>
      ))}
    </div>
  )
}
