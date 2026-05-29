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
        actions={<button className="btn btn-sm"><i className="ti ti-download" /> Exportar</button>}
      />
      <div className="app-content">
        <div className="search-bar">
          <i className="ti ti-search" />
          <input placeholder="Filtrar por código de tubo (TUBO-000001)..." value={tuboQ} onChange={e => setTuboQ(e.target.value)} />
          {tuboQ && <button className="btn-icon" onClick={() => setTuboQ('')}><i className="ti ti-x" /></button>}
        </div>
        {loading ? <Spinner /> : (
          <div className="card" style={{ padding: 0 }}>
            {registros.length === 0 ? <EmptyState icon="ti-list-details" message="Sin registros de auditoría" /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Fecha</th><th>Usuario</th><th>Tubo</th><th>Acción</th><th>Anterior</th><th>Nuevo</th><th>Observación</th></tr></thead>
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
                        <td style={{ color: 'var(--text-secondary)', fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.observaciones || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
