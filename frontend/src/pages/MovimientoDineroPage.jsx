// gastubos/frontend/src/pages/MovimientoDineroPage.jsx
import { useEffect, useState, useMemo } from 'react'
import api from '../services/api.js'
import { PageHeader, Spinner, EmptyState, useToast } from '../components/ui.jsx'

const fmtGs = (v) => `${Number(v || 0).toLocaleString('es-PY')} Gs.`
const fmtFecha = (f) => new Date(f).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })

const TIPOS = [
  ['ENTREGA',        'Entrega'],
  ['ALQUILER',       'Alquiler'],
  ['VENTA_CILINDRO', 'Venta de cilindro'],
  ['RECARGA',        'Recarga (recambio)'],
  ['VENTA_SALON',    'Venta en salón'],
  ['VENTA_CAMION',   'Venta desde camión'],
  ['VENTA_PRODUCTO', 'Venta de producto'],
]

const ESTADO_COLOR = {
  COBRADO:    { bg: 'var(--green-light)', fg: 'var(--green)' },
  CONFIRMADO: { bg: 'var(--green-light)', fg: 'var(--green)' },
  PARCIAL:    { bg: '#fef3c7', fg: '#b45309' },
  PENDIENTE:  { bg: '#fef3c7', fg: '#b45309' },
  CANCELADA:  { bg: 'var(--red-light)', fg: 'var(--red)' },
}

function FormaPagoBadge({ formaPago }) {
  const esEfectivo = formaPago === 'EFECTIVO'
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: esEfectivo ? 'var(--green-light)' : 'var(--blue-light)',
      color: esEfectivo ? 'var(--green)' : 'var(--blue-dark)',
      whiteSpace: 'nowrap',
    }}>
      {esEfectivo ? 'Efectivo' : 'Transferencia'}
    </span>
  )
}

function EstadoBadge({ estado, label }) {
  const c = ESTADO_COLOR[estado] || { bg: 'var(--surface-2)', fg: 'var(--text-secondary)' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function TipoBadge({ label }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10,
      background: 'var(--surface-2)', color: 'var(--text-secondary)', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

const selectStyle = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12 }

export default function MovimientoDineroPage() {
  const { toast } = useToast()

  const [periodo, setPeriodo] = useState('hoy')
  const [desde, setDesde] = useState(() => new Date().toISOString().slice(0, 10))
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))

  const [movimientos, setMovimientos] = useState([])
  const [resumen, setResumen] = useState({ efectivo: 0, transferencia: 0, total: 0, cantidad: 0 })
  const [loading, setLoading] = useState(true)

  const [formaPagoFiltro, setFormaPagoFiltro] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params = { periodo }
      if (periodo === 'custom') { params.desde = desde; params.hasta = hasta }
      const r = await api.get('/movimientos-dinero', { params })
      setMovimientos(r.data.movimientos || [])
      setResumen(r.data.resumen || { efectivo: 0, transferencia: 0, total: 0, cantidad: 0 })
    } catch {
      toast('Error al cargar los movimientos de dinero', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [periodo, desde, hasta])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return movimientos.filter(m => {
      if (formaPagoFiltro && m.formaPago !== formaPagoFiltro) return false
      if (tipoFiltro && m.tipo !== tipoFiltro) return false
      if (q && !`${m.usuario} ${m.cliente} ${m.referencia}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [movimientos, formaPagoFiltro, tipoFiltro, busqueda])

  return (
    <>
      <PageHeader
        title="Movimiento de Dinero"
        subtitle={`${filtrados.length} de ${movimientos.length} movimientos`}
        actions={
          <button className="btn" onClick={load} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`ti ti-refresh ${loading ? 'ti-spin' : ''}`} />
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        }
      />

      <div className="app-content">

        {/* BARRA DE FILTRO DE PERIODO */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-calendar" style={{ fontSize: 16 }} /> Periodo:
            </span>
            <div style={{ display: 'inline-flex', background: 'var(--surface-2)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
              {[['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['custom', 'Personalizado']].map(([key, label]) => (
                <button key={key} onClick={() => setPeriodo(key)} style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: periodo === key ? 700 : 500,
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  background: periodo === key ? 'var(--blue)' : 'transparent',
                  color: periodo === key ? '#fff' : 'var(--text-primary)', transition: 'all 0.2s ease',
                }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {periodo === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Desde:</span>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={selectStyle} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hasta:</span>
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={selectStyle} />
              </div>
            </div>
          )}
        </div>

        {/* TARJETAS DE RESUMEN */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--green)' }}>
            <div className="stat-label"><i className="ti ti-cash" style={{ color: 'var(--green)' }} /> Total Efectivo</div>
            <div className="stat-value" style={{ color: 'var(--green)', fontSize: 22 }}>{fmtGs(resumen.efectivo)}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--blue)' }}>
            <div className="stat-label"><i className="ti ti-building-bank" style={{ color: 'var(--blue)' }} /> Total Transferencia</div>
            <div className="stat-value" style={{ color: 'var(--blue)', fontSize: 22 }}>{fmtGs(resumen.transferencia)}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--text-secondary)' }}>
            <div className="stat-label"><i className="ti ti-report-money" style={{ color: 'var(--text-secondary)' }} /> Total General</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{fmtGs(resumen.total)}</div>
          </div>
        </div>

        {/* FILTROS SECUNDARIOS */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-bar" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <i className="ti ti-search" />
            <input placeholder="Buscar por usuario, cliente o referencia..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            {busqueda && <button className="btn-icon" onClick={() => setBusqueda('')}><i className="ti ti-x" /></button>}
          </div>
          <select value={formaPagoFiltro} onChange={e => setFormaPagoFiltro(e.target.value)} style={selectStyle}>
            <option value="">Todas las formas de pago</option>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
          </select>
          <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} style={selectStyle}>
            <option value="">Todos los tipos</option>
            {TIPOS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>

        {loading ? <Spinner /> : (
          <>
            {/* VISTA TABLE (Desktop) */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              {filtrados.length === 0 ? <EmptyState icon="ti-report-money" message="Sin movimientos de dinero para estos filtros" /> : (
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Usuario</th>
                      <th>Tipo</th>
                      <th>Cliente</th>
                      <th>Forma de pago</th>
                      <th>Monto</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(m => (
                      <tr key={m.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap' }}>{fmtFecha(m.fecha)}</td>
                        <td style={{ fontWeight: 500 }}>{m.usuario}</td>
                        <td><TipoBadge label={m.tipoLabel} /></td>
                        <td>{m.cliente}</td>
                        <td><FormaPagoBadge formaPago={m.formaPago} /></td>
                        <td style={{ fontWeight: 600 }}>{fmtGs(m.monto)}</td>
                        <td><EstadoBadge estado={m.estado} label={m.estadoLabel} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* VISTA CARDS (Mobile) */}
            <div className="mobile-list">
              {filtrados.length === 0 ? (
                <EmptyState icon="ti-report-money" message="Sin movimientos" />
              ) : (
                filtrados.map(m => (
                  <div key={m.id} className="list-card">
                    <div className="list-card-header">
                      <div className="list-card-title">{m.tipoLabel}</div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtFecha(m.fecha)}</span>
                    </div>
                    <div className="list-card-body">
                      <div className="list-card-item">
                        <span className="list-card-label">Usuario</span>
                        <span className="list-card-value">{m.usuario}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Cliente</span>
                        <span className="list-card-value">{m.cliente}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Forma de pago</span>
                        <FormaPagoBadge formaPago={m.formaPago} />
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Monto</span>
                        <span className="list-card-value" style={{ fontWeight: 600 }}>{fmtGs(m.monto)}</span>
                      </div>
                      <div className="list-card-item col-span-2">
                        <span className="list-card-label">Estado</span>
                        <EstadoBadge estado={m.estado} label={m.estadoLabel} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
