// gastubos/frontend/src/pages/RemisionPage.jsx
// Detalle de una remisión, accesible al escanear el QR del ticket (requiere login).
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api.js'
import { PageHeader, Spinner, GasDot, EmptyState, formatCapacidad } from '../components/ui.jsx'

const gs = (v) => `${Number(v || 0).toLocaleString('es-PY')} Gs`
const cap = (t) => formatCapacidad(t)

const TIPO_LABEL = {
  ENTREGA_SIMPLE: 'Entrega simple',
  ALQUILER: 'Alquiler',
  VENTA: 'Venta',
}

function EstadoRemision({ entrega }) {
  const { bg, color, label } = entrega.cancelada
    ? { bg: 'var(--red-light)', color: 'var(--red)', label: 'No concretada' }
    : entrega.confirmada
      ? { bg: 'var(--green-light)', color: 'var(--green)', label: 'Confirmada' }
      : { bg: 'var(--amber-light)', color: 'var(--amber)', label: 'Pendiente' }
  return (
    <span className="badge" style={{ background: bg, color }}>{label}</span>
  )
}

// Item etiqueta/valor para el form-grid (mismo estilo que la ficha de tubo)
function Campo({ label, value, mono, span }) {
  return (
    <div className={span ? 'col-span-2' : ''} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}>{value}</div>
    </div>
  )
}

function Linea({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: bold ? 15 : 12, fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: bold ? 'inherit' : 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}

export default function RemisionPage() {
  const { numero } = useParams()
  const navigate = useNavigate()
  const [entrega, setEntrega] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setLoading(true)
    api.get(`/entregas/numero/${encodeURIComponent(numero)}`)
      .then(res => { if (vivo) { setEntrega(res.data); setError('') } })
      .catch(err => { if (vivo) setError(err.response?.data?.error || 'No se pudo cargar la remisión') })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [numero])

  const volver = (
    <button className="btn btn-sm" onClick={() => navigate(-1)}>
      <i className="ti ti-arrow-left" /> Volver
    </button>
  )

  if (loading) {
    return <div className="app-content" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={32} /></div>
  }

  if (error || !entrega) {
    return (
      <>
        <PageHeader title="Remisión" subtitle={numero} actions={volver} />
        <div className="app-content">
          <div className="card"><EmptyState icon="ti-file-off" message={error || 'Remisión no encontrada'} /></div>
        </div>
      </>
    )
  }

  const detalles = entrega.detalles || []
  const recambios = entrega.recambios || []
  const subtotalTubos = detalles.reduce((acc, d) => acc + Number(d.subtotal || 0), 0)
  const total = subtotalTubos + Number(entrega.costoDelivery || 0)

  return (
    <>
      <PageHeader
        title={`Remisión ${entrega.numero}`}
        subtitle={new Date(entrega.fechaEntrega).toLocaleString('es-PY')}
        actions={<><EstadoRemision entrega={entrega} />{volver}</>}
      />

      <div className="app-content">
        <div className="responsive-grid">

          {/* ── Columna principal ── */}
          <div>
            {/* Datos del cliente */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><div className="card-title">Datos del cliente</div></div>
              <div className="form-grid">
                <Campo label="Cliente" value={entrega.cliente?.nombre || '—'} />
                <Campo label="RUC / CI" value={entrega.cliente?.ruc || '—'} mono />
                <Campo label="Teléfono" value={entrega.cliente?.telefono || '—'} mono />
                <Campo label="Tipo de operación" value={TIPO_LABEL[entrega.tipoOperacion] || entrega.tipoOperacion} />
                <Campo label="Dirección" value={entrega.direccionEntrega || '—'} span />
                {entrega.observaciones && <Campo label="Observaciones" value={entrega.observaciones} span />}
              </div>
            </div>

            {/* Cilindros entregados */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">Cilindros entregados</div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{detalles.length} registro{detalles.length !== 1 ? 's' : ''}</span>
              </div>

              {detalles.length === 0 ? (
                <EmptyState message="Sin cilindros en esta remisión" />
              ) : (
                <>
                  {/* Desktop: tabla */}
                  <div className="desktop-only table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Código</th><th>Gas</th><th>Capacidad</th>
                          <th style={{ textAlign: 'right' }}>Carga</th>
                          <th style={{ textAlign: 'right' }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalles.map(d => (
                          <tr key={d.id}>
                            <td className="td-code">{d.tuboId}</td>
                            <td><GasDot gas={d.tubo?.gas} /> {d.tubo?.gas}</td>
                            <td>{cap(d.tubo)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{Number(d.cantidadGas || 0)} {d.unidadGas}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{gs(d.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Móvil: tarjetas */}
                  <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
                    {detalles.map(d => (
                      <div key={d.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: 'var(--blue)' }}>{d.tuboId}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>{gs(d.subtotal)}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                          <span><GasDot gas={d.tubo?.gas} /> {d.tubo?.gas}</span>
                          <span>{cap(d.tubo)}</span>
                          <span>Carga: <strong style={{ color: 'var(--text-primary)' }}>{Number(d.cantidadGas || 0)} {d.unidadGas}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Recambios recibidos */}
            {recambios.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title">Recambios recibidos</div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{recambios.length} tubo{recambios.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                  {recambios.map(r => {
                    const t = r.tuboEntregado || {}
                    const desc = (t.observaciones && (t.observaciones.includes(' ') || t.observaciones.length > 15))
                      ? t.observaciones
                      : `${t.id}${t.gas ? ` · ${t.gas}` : ''}`
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--coral-light, var(--surface-2))', border: '1px solid var(--border)', padding: '9px 12px', borderRadius: 8, fontSize: 13 }}>
                        <i className="ti ti-arrow-back-up" style={{ color: 'var(--coral, var(--amber))' }} />
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{desc}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Panel lateral: resumen ── */}
          <div>
            <div className="card">
              <div className="card-header"><div className="card-title">Resumen</div></div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                <Linea label="Chofer" value={entrega.repartidor?.nombre || 'Sin asignar'} />
                <Linea label="Cilindros" value={String(detalles.length)} />
                <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
                <Linea label="Subtotal" value={gs(subtotalTubos)} />
                <Linea label="Delivery" value={gs(entrega.costoDelivery)} />
                <div style={{ borderTop: '1px solid var(--border-mid)', paddingTop: 10 }}>
                  <Linea label="TOTAL" value={gs(total)} bold />
                </div>
                {(entrega.metodoPago || entrega.montoRecibido != null) && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {entrega.metodoPago && <Linea label="Método de pago" value={entrega.metodoPago} />}
                    {entrega.montoRecibido != null && <Linea label="Monto recibido" value={gs(entrega.montoRecibido)} />}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
