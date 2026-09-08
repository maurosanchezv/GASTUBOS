// gastubos/frontend/src/pages/RecargasAlquilerPage.jsx
// Panel de SEGUIMIENTO de las órdenes de recarga/recambio a domicilio de
// contratos de alquiler. La solicitud y la asignación del chofer se hacen
// siempre desde Alquileres → detalle del contrato → "Solicitar recarga";
// acá solo se monitorea el estado y, si hace falta, se cancela una orden.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../services/api.js'
import { PageHeader, Spinner, EmptyState, Modal, useToast } from '../components/ui.jsx'
import { useConfigStore } from '../store/configStore.js'
import { getBrandingSources } from '../utils/logosSvg.js'

const gs = (val) => Number(val || 0).toLocaleString('es-PY') + ' Gs'
const fecha = (val) => val ? new Date(val).toLocaleString('es-PY') : '—'
// fechaProgramada es una fecha sin hora (viene de un <input type="date">): se
// formatea en UTC para mostrar siempre el día que se eligió, sin corrimiento
// por zona horaria.
const fechaDia = (val) => {
  if (!val) return null
  const d = new Date(val)
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
}

const ESTADO_BADGE = {
  SOLICITADA: 'PENDIENTE', ASIGNADA: 'PENDIENTE', EN_RUTA: 'PARCIAL', EN_SERVICIO: 'PARCIAL',
  COMPLETADA: 'ACTIVO', CANCELADA: 'CANCELADO',
}

const badgeEstado = (estado) => `badge badge-${ESTADO_BADGE[estado] || 'PENDIENTE'}`
const puedeCancelar = (estado) => ['SOLICITADA', 'ASIGNADA'].includes(estado)

function Campo({ label, children, span }) {
  return (
    <div style={span ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 500 }}>{children ?? '—'}</div>
    </div>
  )
}

export default function RecargasAlquilerPage() {
  const { toast } = useToast()
  const { nombre_empresa, direccion, telefono, isotipo_empresa, logo_empresa } = useConfigStore()
  const branding = getBrandingSources(isotipo_empresa, logo_empresa)
  const [ordenes, setOrdenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todas')
  const [detalle, setDetalle] = useState(null) // orden seleccionada para el modal

  const load = async () => {
    try {
      const rOrdenes = await api.get('/recargas-alquiler')
      setOrdenes(rOrdenes.data)
    } catch (err) {
      toast('Error al cargar recargas de alquiler', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const lista = ordenes.filter(o => {
    if (filtro === 'todas') return true
    if (filtro === 'pendientes') return ['SOLICITADA', 'ASIGNADA'].includes(o.estado)
    if (filtro === 'en_ruta') return ['EN_RUTA', 'EN_SERVICIO'].includes(o.estado)
    if (filtro === 'completadas') return o.estado === 'COMPLETADA'
    if (filtro === 'canceladas') return o.estado === 'CANCELADA'
    return true
  })

  async function cancelarOrden(orden) {
    const motivo = window.prompt(`Cancelar orden ${orden.numero}. Motivo:`)
    if (motivo === null) return
    try {
      await api.post(`/recargas-alquiler/${orden.id}/cancelar`, { motivo })
      toast('Orden cancelada', 'success')
      setDetalle(null)
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al cancelar', 'error')
    }
  }

  const tabs = [
    ['todas', 'Todas'], ['pendientes', 'Pendientes'],
    ['en_ruta', 'En ruta'], ['completadas', 'Completadas'], ['canceladas', 'Canceladas'],
  ]

  const cobro = (o) => {
    const c = o?.cargoAlquiler
    const pagado = Number(c?.montoPagado || 0)
    const total = Number(c?.monto ?? o?.precioAplicado ?? 0)
    return { pagado, total, saldo: Math.max(0, total - pagado), metodo: c?.metodoPago }
  }

  return (
    <>
      <PageHeader title="Recargas de Alquiler" subtitle="Seguimiento de servicios de recarga y recambio a domicilio" />
      <div className="app-content">
        <div className="tabs">
          {tabs.map(([v, l]) => (
            <div key={v} className={`tab ${filtro === v ? 'active' : ''}`} onClick={() => setFiltro(v)}>{l}</div>
          ))}
        </div>

        {loading ? <Spinner /> : lista.length === 0 ? (
          <div className="card" style={{ padding: 0 }}>
            <EmptyState icon="ti-truck-delivery" message="Sin recargas en este filtro" />
          </div>
        ) : (
          <>
            {/* VISTA TABLE (Desktop) */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Nro</th><th>Cliente</th><th>Contrato</th><th>Plan</th><th>Tipo</th><th>Tubo</th>
                    <th>Solicitada</th><th>Repartidor</th><th>Camión</th><th>Monto</th><th>Estado</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(o => (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setDetalle(o)}>
                      <td className="td-code" style={{ color: 'var(--blue)' }}>{o.numero}</td>
                      <td style={{ fontWeight: 500 }}>{o.cliente?.nombre}</td>
                      <td className="td-code">{o.alquiler?.numero}</td>
                      <td>{o.alquiler?.plan?.nombre || '—'}</td>
                      <td style={{ fontSize: 11 }}>{o.tipoServicio.replace(/_/g, ' ')}</td>
                      <td className="td-code">{o.tubo?.id}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {fecha(o.fechaSolicitud)}
                        {o.fechaProgramada && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Prog: {fechaDia(o.fechaProgramada)}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 11 }}>{o.repartidor?.nombre || o.repartidor?.username || '—'}</td>
                      <td style={{ fontSize: 11 }}>{o.camion?.placa || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{gs(o.precioAplicado)}</td>
                      <td><span className={badgeEstado(o.estado)}>{o.estado.replace(/_/g, ' ')}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {puedeCancelar(o.estado) && (
                          <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); cancelarOrden(o) }}>Cancelar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* VISTA CARDS (Mobile) */}
            <div className="mobile-list">
              {lista.map(o => (
                <div key={o.id} className="list-card" onClick={() => setDetalle(o)} style={{ cursor: 'pointer' }}>
                  <div className="list-card-header">
                    <div className="list-card-title">{o.numero}</div>
                    <span className={badgeEstado(o.estado)}>{o.estado.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="list-card-body">
                    <div className="list-card-item">
                      <span className="list-card-label">Cliente</span>
                      <span className="list-card-value">{o.cliente?.nombre || '—'}</span>
                    </div>
                    <div className="list-card-item">
                      <span className="list-card-label">Contrato</span>
                      <span className="list-card-value">{o.alquiler?.numero || '—'}</span>
                    </div>
                    <div className="list-card-item">
                      <span className="list-card-label">Tipo</span>
                      <span className="list-card-value">{o.tipoServicio.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="list-card-item">
                      <span className="list-card-label">Tubo</span>
                      <span className="list-card-value">{o.tubo?.id || '—'}</span>
                    </div>
                    <div className="list-card-item">
                      <span className="list-card-label">Repartidor</span>
                      <span className="list-card-value">{o.repartidor?.nombre || o.repartidor?.username || '—'}</span>
                    </div>
                    <div className="list-card-item">
                      <span className="list-card-label">Monto</span>
                      <span className="list-card-value">{gs(o.precioAplicado)}</span>
                    </div>
                    <div className="list-card-item" style={{ gridColumn: 'span 2' }}>
                      <span className="list-card-label">Solicitada</span>
                      <span className="list-card-value">
                        {fecha(o.fechaSolicitud)}{o.fechaProgramada ? ` · Prog: ${fechaDia(o.fechaProgramada)}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="list-card-actions">
                    <button className="btn btn-sm" style={{ flex: 1 }} onClick={(e) => { e.stopPropagation(); setDetalle(o) }}>
                      <i className="ti ti-eye" /> Ver detalle
                    </button>
                    {puedeCancelar(o.estado) && (
                      <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); cancelarOrden(o) }}>Cancelar</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal de detalle de la orden */}
      <Modal
        open={!!detalle}
        title={detalle ? `Orden ${detalle.numero}` : ''}
        onClose={() => setDetalle(null)}
        width={620}
        footer={detalle && (
          <>
            <button className="btn" onClick={() => setDetalle(null)}>Cerrar</button>
            {puedeCancelar(detalle.estado) && (
              <button className="btn btn-danger" onClick={() => cancelarOrden(detalle)}>Cancelar orden</button>
            )}
            <button className="btn btn-primary" onClick={() => window.print()}>
              <i className="ti ti-printer" /> Imprimir remisión
            </button>
          </>
        )}
      >
        {detalle && (() => {
          const c = cobro(detalle)
          const esRecambio = detalle.tipoServicio === 'RECAMBIO_TUBO'
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, fontSize: 12 }}>
                <Campo label="Estado"><span className={badgeEstado(detalle.estado)}>{detalle.estado.replace(/_/g, ' ')}</span></Campo>
                <Campo label="Tipo de servicio">{detalle.tipoServicio.replace(/_/g, ' ')}</Campo>
                <Campo label="Cliente">{detalle.cliente?.nombre}</Campo>
                <Campo label="Teléfono">{detalle.cliente?.telefono}</Campo>
                <Campo label="Contrato">{detalle.alquiler?.numero}</Campo>
                <Campo label="Plan">{detalle.alquiler?.plan?.nombre}</Campo>
                <Campo label="Repartidor">{detalle.repartidor?.nombre || detalle.repartidor?.username}</Campo>
                <Campo label="Camión">{detalle.camion?.placa}</Campo>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Tubos</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, fontSize: 12 }}>
                  <Campo label={esRecambio ? 'Tubo retirado' : 'Tubo'}>{detalle.tubo?.id}</Campo>
                  {esRecambio && <Campo label="Tubo entregado">{detalle.tuboNuevo?.id}</Campo>}
                  {detalle.cantidadGasRecargada != null && (
                    <>
                      <Campo label="Gas recargado">{Number(detalle.cantidadGasRecargada).toLocaleString('es-PY')}</Campo>
                      <Campo label="Tubo del camión">{detalle.tuboOrigen?.id}</Campo>
                    </>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Cobro</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, fontSize: 12 }}>
                  <Campo label="Monto">{gs(c.total)}</Campo>
                  <Campo label="Cobrado">{gs(c.pagado)}</Campo>
                  <Campo label="Saldo">
                    <span style={{ color: c.saldo > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{gs(c.saldo)}</span>
                  </Campo>
                  <Campo label="Forma de pago">{c.metodo}</Campo>
                  {detalle.cargoAlquiler?.estado && <Campo label="Estado del cargo">{detalle.cargoAlquiler.estado}</Campo>}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Fechas</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, fontSize: 12 }}>
                  <Campo label="Solicitada">{fecha(detalle.fechaSolicitud)}</Campo>
                  <Campo label="Programada">{fechaDia(detalle.fechaProgramada)}</Campo>
                  <Campo label="Asignada">{fecha(detalle.fechaAsignacion)}</Campo>
                  <Campo label="Inicio de servicio">{fecha(detalle.fechaInicioServicio)}</Campo>
                  <Campo label="Finalizada">{fecha(detalle.fechaFinalizacion)}</Campo>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Ubicación</div>
                <div style={{ fontSize: 12 }}>{detalle.direccion || '—'}</div>
              </div>

              {(detalle.observaciones || detalle.motivoCancelacion) && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Notas</div>
                  {detalle.observaciones && <div style={{ fontSize: 12 }}>{detalle.observaciones}</div>}
                  {detalle.motivoCancelacion && (
                    <div style={{ fontSize: 12, color: 'var(--red)' }}>Cancelación: {detalle.motivoCancelacion}</div>
                  )}
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* Remisión imprimible (solo visible al imprimir; se dispara desde el modal) */}
      {detalle && createPortal(
        (() => {
          const o = detalle
          const c = cobro(o)
          const esRecambio = o.tipoServicio === 'RECAMBIO_TUBO'
          return (
            <div className="print-ticket-container">
              <div className="ticket-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '10px' }}>
                  <img src={branding.isotipoSrc} alt="Isotipo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                  <img src={branding.logoSrc} alt="Logo" style={{ width: '108px', height: '40px', objectFit: 'contain' }} />
                </div>
                {direccion ? <p style={{ margin: 0, fontSize: '10px' }}>{direccion}</p> : <p style={{ margin: 0, fontSize: '10px' }}>{nombre_empresa || 'GasTubos'}</p>}
                {telefono && <p style={{ margin: '2px 0 0', fontSize: '10px' }}>Tel: {telefono}</p>}
                <p style={{ margin: '4px 0 0', fontSize: '11px', fontWeight: 'bold' }}>RECARGA ALQUILER: {o.numero}</p>
              </div>

              <div style={{ margin: '8px 0', fontSize: '11px' }}>
                <strong>Cliente:</strong> {o.cliente?.nombre}<br />
                <strong>RUC/CI:</strong> {o.cliente?.ruc || '—'}<br />
                <strong>Dirección:</strong> {o.direccion || '—'}<br />
                <strong>Fecha:</strong> {fecha(o.fechaFinalizacion || o.fechaSolicitud)}<br />
                <strong>Chofer:</strong> {o.repartidor?.nombre || o.repartidor?.username || '—'}<br />
                <strong>Contrato:</strong> {o.alquiler?.numero || '—'}{o.alquiler?.plan?.nombre ? ` · ${o.alquiler.plan.nombre}` : ''}
              </div>

              <table className="ticket-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px dashed #000' }}>
                    <th style={{ textAlign: 'left', paddingBottom: '4px' }}>Servicio</th>
                    <th style={{ textAlign: 'right', paddingBottom: '4px' }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ paddingTop: '6px' }}>
                      <strong>{esRecambio ? 'Recambio de tubo' : 'Recarga del mismo tubo'}</strong><br />
                      <span style={{ fontSize: '10px', color: '#555' }}>
                        {esRecambio
                          ? `Retira ${o.tubo?.id || '?'} / entrega ${o.tuboNuevo?.id || '?'}`
                          : `Tubo ${o.tubo?.id || '?'}`}
                      </span>
                      {o.cantidadGasRecargada != null && (
                        <><br /><span style={{ fontSize: '10px', color: '#555' }}>Gas recargado: {Number(o.cantidadGasRecargada).toLocaleString('es-PY')}</span></>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500, paddingTop: '6px' }}>{gs(c.total)}</td>
                  </tr>
                  <tr style={{ borderTop: '1px dashed #000' }}>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px', paddingTop: '6px' }}>TOTAL:</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px', paddingTop: '6px' }}>{gs(c.total)}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ margin: '8px 0', fontSize: '11px' }}>
                <strong>Forma de pago:</strong> {c.metodo || (c.pagado > 0 ? '-' : 'No cobrado')}<br />
                <strong>Cobrado:</strong> {gs(c.pagado)}
                {c.saldo > 0 && <><br /><strong>Saldo pendiente:</strong> {gs(c.saldo)}</>}
              </div>

              <div className="ticket-signatures" style={{ display: 'flex', justifyContent: 'center', marginTop: '24px', paddingTop: '10px' }}>
                <div className="signature-line" style={{ width: '60%', borderTop: '1px solid #000', textAlign: 'center', fontSize: '10px', paddingTop: '4px' }}>Firma Cliente</div>
              </div>

              <div className="ticket-footer" style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '8px', marginTop: '16px', fontSize: '10px' }}>
                ¡Gracias por su preferencia!
              </div>
            </div>
          )
        })(),
        document.body
      )}
    </>
  )
}
