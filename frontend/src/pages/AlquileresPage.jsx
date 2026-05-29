// gastubos/frontend/src/pages/AlquileresPage.jsx
import { useEffect, useState } from 'react'
import api from '../services/api.js'
import { PageHeader, Spinner, EmptyState } from '../components/ui.jsx'

export default function AlquileresPage() {
  const [alquileres, setAlquileres] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => {
    api.get('/alquileres').then(r => setAlquileres(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const lista = alquileres.filter(a => {
    if (filtro === 'activos')  return a.estadoCalculado === 'ACTIVO'
    if (filtro === 'vencidos') return a.estadoCalculado === 'VENCIDO'
    return true
  })
  const vencidos = alquileres.filter(a => a.estadoCalculado === 'VENCIDO').length

  return (
    <>
      <PageHeader title="Alquileres" subtitle={`${vencidos > 0 ? `⚠ ${vencidos} vencidos · ` : ''}${alquileres.length} total`} />
      <div className="app-content">
        {vencidos > 0 && (
          <div className="alert alert-warn">
            <i className="ti ti-clock-exclamation" />
            <strong>{vencidos} alquiler{vencidos > 1 ? 'es' : ''} vencido{vencidos > 1 ? 's' : ''}.</strong>{' '}
            Contactar con los clientes para gestionar la devolución o renovación.
          </div>
        )}
        <div className="tabs">
          {[['todos','Todos'],['activos','Activos'],['vencidos','Vencidos']].map(([v,l]) => (
            <div key={v} className={`tab ${filtro===v?'active':''}`} onClick={() => setFiltro(v)}>{l}</div>
          ))}
        </div>
        {loading ? <Spinner /> : (
          <div className="card" style={{ padding: 0 }}>
            {lista.length === 0 ? <EmptyState icon="ti-calendar-time" message="Sin alquileres" /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Nro</th><th>Cliente</th><th>Tubo</th><th>Inicio</th><th>Vencimiento</th><th>Estado</th></tr></thead>
                  <tbody>
                    {lista.map(a => {
                      const vencido = a.estadoCalculado === 'VENCIDO'
                      return (
                        <tr key={a.id}>
                          <td className="td-code">{a.numero}</td>
                          <td style={{ fontWeight: 500 }}>{a.cliente?.nombre}</td>
                          <td className="td-code">{a.tubo?.id}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(a.fechaInicio).toLocaleDateString('es-PY')}</td>
                          <td style={{ fontSize: 11, color: vencido ? 'var(--red)' : 'inherit', fontWeight: vencido ? 600 : 400 }}>
                            {new Date(a.fechaVencimiento).toLocaleDateString('es-PY')}
                          </td>
                          <td>
                            <span className={`badge badge-${a.estadoCalculado}`}>{a.estadoCalculado}</span>
                          </td>
                        </tr>
                      )
                    })}
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
