// gastubos/frontend/src/components/TicketEntrega.jsx
//
// Ticket/remisión completo de una entrega (cliente, ítems/tubos despachados,
// plan de alquiler si corresponde, recambios recibidos, firmas). Un solo
// componente, renderizado dos veces por quien lo use: como vista previa
// dentro de un Modal (envuelto en .ticket-preview) y como nodo oculto que
// efectivamente imprime window.print() (envuelto en .print-ticket-container).
// Usado tal cual desde EntregasPage.jsx y, en modo de solo lectura, desde
// AlquileresPage.jsx (el botón "Recibo" de un contrato abre la remisión de
// la entrega que lo originó, en vez de tener su propio documento).
//
// props:
//   entrega — objeto completo tal como lo devuelve GET /entregas/numero/:numero
//             (o el listado GET /entregas, mismo include): cliente, detalles,
//             recambios, alquileres, cilindrosTerceros, ventaProducto, etc.
//   branding, nombreEmpresa, direccion, telefono — mismos datos de useConfigStore
//   ticketTab — 'remision' | 'comprobante'
//   onCambiarTab — setter de ticketTab; si no se pasa (o mostrarSelectorTabs es
//             false), no se muestra el selector de pestañas.
//   mostrarSelectorTabs — default true
//   readOnly — default false; en true oculta el botón de eliminar tubo adicional
//   onQuitarTuboAdicional — (entregaId, tuboId) => void; si no se pasa, el botón
//             de eliminar tampoco aparece aunque readOnly sea false.

import { formatCapacidad } from './ui.jsx'
import { precioFilaDetalle, totalTicket, subtotalProductosTicket, formatNumberSpanish, getRecambiosRecibidos } from '../utils/ticketMontos.js'
import PlanAlquilerTicketBlock from './PlanAlquilerTicketBlock.jsx'

export default function TicketEntrega({
  entrega, branding, nombreEmpresa, direccion, telefono,
  ticketTab, onCambiarTab, mostrarSelectorTabs = true,
  readOnly = false, onQuitarTuboAdicional,
}) {
  if (!entrega) return null

  const esComprobante = ticketTab === 'comprobante'
  const pendiente = esComprobante && !entrega.confirmada
  const puedeEditar = !readOnly && !!onQuitarTuboAdicional && !entrega.confirmada && !entrega.cancelada

  return (
    <>
      {mostrarSelectorTabs && onCambiarTab && entrega.canal !== 'SALON' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          <button
            type="button"
            className={`btn btn-sm ${ticketTab === 'remision' ? 'btn-primary' : ''}`}
            onClick={() => onCambiarTab('remision')}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11 }}
          >
            <i className="ti ti-file-text" /> 1. Remisión Inicial
          </button>
          <button
            type="button"
            className={`btn btn-sm ${ticketTab === 'comprobante' ? 'btn-primary' : ''}`}
            onClick={() => onCambiarTab('comprobante')}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11 }}
          >
            <i className="ti ti-receipt" /> 2. Comprobante Repartidor
          </button>
        </div>
      )}

      {pendiente ? (
        <div style={{ padding: '20px 16px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center', margin: '12px 0' }}>
          <i className="ti ti-clock" style={{ fontSize: 32, color: '#d97706', marginBottom: 8, display: 'block' }} />
          <strong style={{ fontSize: 14, display: 'block', color: 'var(--text-primary)' }}>Entrega Pendiente en Terreno</strong>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.4 }}>
            El comprobante impreso por el repartidor estará disponible en cuanto el chofer entregue el pedido y registre los recambios recibidos en la app móvil.
          </p>
        </div>
      ) : (
        <>
          <div className="ticket-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '10px' }}>
              <img src={branding.isotipoSrc} alt="Isotipo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
              <img src={branding.logoSrc} alt="Logo" style={{ width: '108px', height: '40px', objectFit: 'contain' }} />
            </div>
            {direccion ? <p style={{ margin: 0, fontSize: '10px', color: '#666' }}>{direccion}</p> : <p style={{ margin: 0, fontSize: '10px', color: '#666' }}>{nombreEmpresa || 'Gestión de Gases Industriales'}</p>}
            {telefono && <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#666' }}>Tel: {telefono}</p>}
            <p style={{ margin: '6px 0 0', fontSize: '11px', fontWeight: 'bold' }}>
              {esComprobante ? `COMPROBANTE DE ENTREGA Y RECEPCIÓN: ${entrega.numero}` : `REMISIÓN DE SALIDA: ${entrega.numero}`}
            </p>
          </div>

          <div style={{ margin: '10px 0', fontSize: '11px', borderBottom: '1px dashed #ddd', paddingBottom: '8px' }}>
            <strong>Cliente:</strong> {entrega.cliente?.nombre}<br />
            <strong>RUC/CI:</strong> {entrega.cliente?.ruc || '—'}<br />
            <strong>Dirección:</strong> {entrega.direccionEntrega}<br />
            <strong>Fecha:</strong> {new Date(entrega.fechaEntrega).toLocaleString('es-PY')}<br />
            <strong>{entrega.canal === 'SALON' ? 'Atendido por:' : 'Chofer/Repartidor:'}</strong> {entrega.repartidor?.nombre || 'Sin asignar'}<br />
            <strong>Forma de pago:</strong> {entrega.metodoPago === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'}<br />
            <strong>Tipo:</strong> {(entrega.tipoOperacion || '').replace('_', ' ')}
          </div>

          <table className="ticket-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Tubo / Gas</th>
                <th style={{ textAlign: 'center' }}>Cant.</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {entrega.detalles?.map(d => {
                const capStr = d.tubo ? ` (${formatCapacidad(d.tubo)})` : ''
                const showSerie = d.tubo?.serie && d.tubo?.serie !== d.tuboId
                return (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.tuboId}</strong>
                      {d.esAdicional && (
                        <span style={{ fontSize: '9px', background: '#fef3c7', color: '#b45309', padding: '1px 4px', borderRadius: '3px', marginLeft: '4px', fontWeight: 'bold' }}>
                          (Agregado por repartidor)
                        </span>
                      )}
                      {puedeEditar && d.esAdicional && (
                        <button
                          type="button"
                          onClick={() => onQuitarTuboAdicional(entrega.id, d.tuboId)}
                          style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', marginLeft: 6, padding: '2px 4px' }}
                          title="Eliminar tubo adicional del pedido"
                        >
                          <i className="ti ti-trash" style={{ fontSize: 13 }} />
                        </button>
                      )}
                      {showSerie && <span style={{ fontSize: '10px', color: '#555', display: 'block' }}>Nro: {d.tubo.serie}</span>}
                      <span style={{ fontSize: '10px', color: '#555', display: 'block' }}>
                        {d.tubo?.gas}{capStr}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {Number(d.cantidadGas) > 0 ? (
                        <>
                          {formatNumberSpanish(d.cantidadGas)} {d.unidadGas}<br />
                          <span style={{ fontSize: '9px', color: '#888' }}>
                            x {Number(d.precioUnitario).toLocaleString('es-PY')}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#555', fontWeight: 500 }}>
                          {entrega.tipoOperacion === 'ALQUILER' ? 'Alquiler' : 'Envase Vacío'}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '500' }}>
                      {precioFilaDetalle(entrega, d).toLocaleString('es-PY')} GS
                    </td>
                  </tr>
                )
              })}
              {subtotalProductosTicket(entrega) > 0 && (
                <tr>
                  <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>PRODUCTOS:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>
                    {subtotalProductosTicket(entrega).toLocaleString('es-PY')} GS
                  </td>
                </tr>
              )}
              <tr style={{ borderTop: '1px dashed #000' }}>
                <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>DELIVERY:</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>
                  {Number(entrega.costoDelivery || 0).toLocaleString('es-PY')} GS
                </td>
              </tr>
              <tr>
                <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>{esComprobante ? 'TOTAL COBRADO:' : 'TOTAL:'}</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px', color: 'var(--blue)' }}>
                  {totalTicket(entrega).toLocaleString('es-PY')} GS
                </td>
              </tr>
            </tbody>
          </table>

          <PlanAlquilerTicketBlock entrega={entrega} incluirEstado={esComprobante} />

          {esComprobante && (() => {
            const recs = getRecambiosRecibidos(entrega)
            return (
              <div style={{ margin: '8px 0', fontSize: '10px', borderTop: '1px dashed #000', paddingTop: '4px' }}>
                <strong>Recambios / Tubos Recibidos:</strong>
                {recs.length > 0 ? (
                  <ul style={{ paddingLeft: 14, margin: 0 }}>
                    {recs.map((desc, idx) => <li key={idx}>{desc}</li>)}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontStyle: 'italic' }}>Sin recambios devueltos.</p>
                )}
              </div>
            )
          })()}

          {entrega.observaciones && (
            <div style={{ margin: '8px 0', fontSize: '10px', fontStyle: 'italic', borderTop: '1px dashed #000', paddingTop: '4px' }}>
              <strong>Obs:</strong> {entrega.observaciones}
            </div>
          )}

          <div className="ticket-signatures">
            <div className="signature-line">{esComprobante ? (entrega.canal === 'SALON' ? 'Firma Operador' : 'Firma Repartidor') : 'Firma Despacho'}</div>
            <div className="signature-line">{esComprobante ? 'Firma Cliente (Acuse)' : 'Firma Chofer'}</div>
          </div>

          <div className="ticket-footer">
            ¡Gracias por su preferencia!
          </div>
        </>
      )}
    </>
  )
}
