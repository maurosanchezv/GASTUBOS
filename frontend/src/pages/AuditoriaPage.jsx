// gastubos/frontend/src/pages/AuditoriaPage.jsx
import { useState, useEffect, useCallback } from 'react'
import api from '../services/api.js'
import { PageHeader, StateBadge, Spinner, EmptyState } from '../components/ui.jsx'

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [tuboQ,   setTuboQ]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/auditoria', { params: { tuboId: tuboQ.trim().toUpperCase() || undefined, limit: 60 } })
      setRegistros(r.data.registros); setTotal(r.data.total)
    } catch {} finally { setLoading(false) }
  }, [tuboQ])

  useEffect(() => { load() }, [load])

  return (
    <>
      <PageHeader
        title="Auditoría"
        subtitle={`${total} registros`}
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={load} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 auto', justifyContent: 'center', maxWidth: '200px' }}>
              <i className={`ti ti-refresh ${loading ? 'ti-spin' : ''}`} />
              {loading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        }
      />
      <div className="app-content">
        <div className="search-bar">
          <i className="ti ti-search" />
          <input placeholder="Filtrar por código de tubo (TUBO-000001)..." value={tuboQ} onChange={e => setTuboQ(e.target.value)} />
          {tuboQ && <button className="btn-icon" onClick={() => setTuboQ('')}><i className="ti ti-x" /></button>}
        </div>
        
        {loading ? <Spinner /> : (
          <>
            {/* VISTA TABLE (Desktop) */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              {registros.length === 0 ? <EmptyState icon="ti-list-details" message="Sin registros de auditoría" /> : (
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Usuario</th>
                      <th>Tubo</th>
                      <th>Acción</th>
                      <th>Anterior</th>
                      <th>Nuevo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap' }}>
                          {new Date(a.createdAt).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td style={{ fontWeight: 500, color: 'var(--blue)' }}>{a.usuario?.username}</td>
                        <td className="td-code">{a.tubo?.id}</td>
                        <td style={{ fontSize: 12 }}>{a.accion}</td>
                        <td>{a.estadoAnterior ? <StateBadge estado={a.estadoAnterior} /> : '—'}</td>
                        <td>{a.estadoNuevo    ? <StateBadge estado={a.estadoNuevo}    /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* VISTA CARDS (Mobile) */}
            <div className="mobile-list">
              {registros.length === 0 ? (
                <EmptyState icon="ti-list-details" message="Sin registros" />
              ) : (
                registros.map(a => (
                  <div key={a.id} className="list-card">
                    <div className="list-card-header">
                      <div className="list-card-title">{a.tubo?.id || 'SISTEMA'}</div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {new Date(a.createdAt).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    
                    <div className="list-card-body">
                      <div className="list-card-item col-span-2">
                        <span className="list-card-label">Acción</span>
                        <span className="list-card-value" style={{ whiteSpace: 'normal' }}>{a.accion}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Usuario</span>
                        <span className="list-card-value">{a.usuario?.username}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Estado Nuevo</span>
                        {a.estadoNuevo ? <StateBadge estado={a.estadoNuevo} /> : <span className="list-card-value">—</span>}
                      </div>
                      {a.observaciones && (
                        <div className="list-card-item col-span-2">
                          <span className="list-card-label">Obs.</span>
                          <span className="list-card-value" style={{ whiteSpace: 'normal', fontSize: 11 }}>{a.observaciones}</span>
                        </div>
                      )}
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
