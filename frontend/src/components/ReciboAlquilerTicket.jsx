// gastubos/frontend/src/components/ReciboAlquilerTicket.jsx
//
// Contenido del recibo de pago de un contrato de alquiler (un cargo suelto,
// o el par inicial+delivery combinado — ver agruparCargos en AlquileresPage.jsx).
// Un solo componente, renderizado dos veces por AlquileresPage.jsx: como
// vista previa dentro de un Modal (envuelto en .ticket-preview) y como nodo
// oculto que efectivamente imprime window.print() (envuelto en
// .print-ticket-container) — igual patrón que el ticket de Entregas: nunca
// se rearma el HTML del ticket a mano en cada lugar que lo necesita.
//
// props:
//   recibo — { alquiler:{numero,cliente,plan}, cobradoPor, fechaPago,
//              metodoPago, lineas:[{concepto,periodo:{desde,hasta}|null,monto}],
//              totalAbonado, saldoTotal }
//   branding, nombreEmpresa, direccion, telefono — mismos datos de useConfigStore
//   que ya usan los demás tickets.

const gs = (val) => Number(val || 0).toLocaleString('es-PY') + ' Gs'
const fecha = (val) => val ? new Date(val).toLocaleDateString('es-PY') : '—'
const fechaHora = (val) => val ? new Date(val).toLocaleString('es-PY') : '—'

export default function ReciboAlquilerTicket({ recibo, branding, nombreEmpresa, direccion, telefono }) {
  const { alquiler, cobradoPor, fechaPago, metodoPago, lineas, totalAbonado, saldoTotal } = recibo
  return (
    <>
      <div className="ticket-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '10px' }}>
          <img src={branding.isotipoSrc} alt="Isotipo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          <img src={branding.logoSrc} alt="Logo" style={{ width: '108px', height: '40px', objectFit: 'contain' }} />
        </div>
        {direccion ? <p style={{ margin: 0, fontSize: '10px' }}>{direccion}</p> : <p style={{ margin: 0, fontSize: '10px' }}>{nombreEmpresa || 'GasTubos'}</p>}
        {telefono && <p style={{ margin: '2px 0 0', fontSize: '10px' }}>Tel: {telefono}</p>}
        <p style={{ margin: '4px 0 0', fontSize: '11px', fontWeight: 'bold' }}>RECIBO DE PAGO: {alquiler?.numero || '—'}</p>
      </div>

      <div style={{ margin: '8px 0', fontSize: '11px' }}>
        <strong>Cliente:</strong> {alquiler?.cliente?.nombre || '—'}<br />
        <strong>RUC/CI:</strong> {alquiler?.cliente?.ruc || '—'}<br />
        <strong>Dirección:</strong> {alquiler?.cliente?.direccion || '—'}<br />
        <strong>Fecha:</strong> {fechaHora(fechaPago)}<br />
        <strong>Cobrado por:</strong> {cobradoPor || '—'}<br />
        <strong>Plan:</strong> {alquiler?.plan?.nombre || '—'}<br />
        <strong>Forma de pago:</strong> {metodoPago === 'EFECTIVO' ? 'Efectivo' : metodoPago === 'TRANSFERENCIA' ? 'Transferencia' : (metodoPago || '—')}
      </div>

      <table className="ticket-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr style={{ borderBottom: '1px dashed #000' }}>
            <th style={{ textAlign: 'left', paddingBottom: '4px' }}>Concepto</th>
            <th style={{ textAlign: 'right', paddingBottom: '4px' }}>Monto</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, idx) => (
            <tr key={idx}>
              <td style={{ paddingTop: '6px' }}>
                <strong>{l.concepto}</strong>
                {l.periodo?.desde && (
                  <><br /><span style={{ fontSize: '10px', color: '#555' }}>
                    Período {fecha(l.periodo.desde)} → {fecha(l.periodo.hasta)}
                  </span></>
                )}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 500, paddingTop: '6px' }}>{gs(l.monto)}</td>
            </tr>
          ))}
          <tr style={{ borderTop: '1px dashed #000' }}>
            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px', paddingTop: '6px' }}>TOTAL ABONADO:</td>
            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px', paddingTop: '6px', color: 'var(--blue)' }}>{gs(totalAbonado)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ margin: '8px 0', fontSize: '11px' }}>
        {saldoTotal > 0
          ? <><strong>Saldo pendiente:</strong> {gs(saldoTotal)}</>
          : <><strong>Estado:</strong> PAGADO</>}
      </div>

      <div className="ticket-signatures" style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginTop: '24px', paddingTop: '10px' }}>
        <div className="signature-line" style={{ flex: 1, borderTop: '1px solid #000', textAlign: 'center', fontSize: '10px', paddingTop: '4px' }}>Firma Cobrador</div>
        <div className="signature-line" style={{ flex: 1, borderTop: '1px solid #000', textAlign: 'center', fontSize: '10px', paddingTop: '4px' }}>Firma Cliente</div>
      </div>

      <div className="ticket-footer" style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '8px', marginTop: '16px', fontSize: '10px' }}>
        ¡Gracias por su preferencia!
      </div>
    </>
  )
}
