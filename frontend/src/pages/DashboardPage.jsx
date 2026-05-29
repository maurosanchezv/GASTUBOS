// gastubos/frontend/src/pages/DashboardPage.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api.js'
import { PageHeader, StateBadge, Spinner } from '../components/ui.jsx'

const ESTADO_META = {
  DISPONIBLE:  { label: 'Disponibles',   icon: 'ti-circle-check', cls: 'stat-green' },
  CARGADO:     { label: 'Cargados',       icon: 'ti-bolt',         cls: 'stat-blue' },
  ALQUILADO:   { label: 'Alquilados',     icon: 'ti-calendar-time',cls: 'stat-purple' },
  ENTREGADO:   { label: 'En clientes',    icon: 'ti-truck-delivery',cls: 'stat-teal' },
  VENDIDO:     { label: 'Vendidos',        icon: 'ti-shopping-cart',cls: 'stat-amber' },
  EN_REVISION: { label: 'En revisión',    icon: 'ti-tools',        cls: 'stat-amber' },
  PERDIDO:     { label: 'Perdidos',        icon: 'ti-map-pin-off',  cls: 'stat-red' },
  VACIO:       { label: 'Vacíos',          icon: 'ti-cylinder',     cls: 'stat-gray' },
}

export default function DashboardPage() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate            = useNavigate()

  useEffect(() => {
    api.get('/reportes/dashboard')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <>
      <PageHeader title="Dashboard" />
      <div className="app-content"><Spinner /></div>
    </>
  )

  const { tubosTotal = 0, clientesActivos = 0, alquileresVencidos = 0, porEstado = {}, entregasRecientes = [] } = data || {}

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${tubosTotal} tubos · ${clientesActivos} clientes activos`}
        actions={
          <button className="btn btn-sm" onClick={() => navigate('/reportes')}>
            <i className="ti ti-chart-bar" /> Reportes
          </button>
        }
      />

      <div className="app-content">
        {/* Alertas */}
        {alquileresVencidos > 0 && (
          <div className="alert alert-warn" style={{ cursor: 'pointer' }} onClick={() => navigate('/alquileres')}>
            <i className="ti ti-clock-exclamation" />
            <div>
              <strong>{alquileresVencidos} alquiler{alquileresVencidos > 1 ? 'es' : ''} vencido{alquileresVencidos > 1 ? 's' : ''}</strong>
              {' '}— Hacer click para revisar
            </div>
          </div>
        )}
        {(porEstado.PERDIDO || 0) > 0 && (
          <div className="alert alert-danger">
            <i className="ti ti-map-pin-off" />
            <div><strong>{porEstado.PERDIDO} tubo{porEstado.PERDIDO > 1 ? 's' : ''} perdido{porEstado.PERDIDO > 1 ? 's' : ''}</strong> sin ubicación registrada</div>
          </div>
        )}

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
          {Object.entries(ESTADO_META).map(([estado, meta]) => (
            <div
              key={estado}
              className="stat-card"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/tubos?estado=${estado}`)}
            >
              <div className="stat-label">
                <i className={`ti ${meta.icon}`} aria-hidden />
                {meta.label}
              </div>
              <div className={`stat-value ${meta.cls}`}>{porEstado[estado] || 0}</div>
            </div>
          ))}
          <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/clientes')}>
            <div className="stat-label"><i className="ti ti-users" aria-hidden /> Clientes</div>
            <div className="stat-value">{clientesActivos}</div>
          </div>
        </div>

        {/* Entregas recientes */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Entregas recientes</div>
              <div className="card-subtitle">Últimas operaciones registradas</div>
            </div>
            <button className="btn btn-sm" onClick={() => navigate('/entregas')}>
              Ver todas <i className="ti ti-arrow-right" />
            </button>
          </div>

          {entregasRecientes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Sin entregas registradas
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nro</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Tubos</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {entregasRecientes.map(e => (
                    <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/entregas')}>
                      <td className="td-code">{e.numero}</td>
                      <td style={{ fontWeight: 500 }}>{e.cliente?.nombre}</td>
                      <td>
                        <span className={`badge badge-${e.tipoOperacion === 'ALQUILER' ? 'ALQUILADO' : e.tipoOperacion === 'VENTA' ? 'VENDIDO' : 'ENTREGADO'}`}>
                          {e.tipoOperacion.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{e.detalles?.length ?? 0}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                        {new Date(e.fechaEntrega).toLocaleDateString('es-PY')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
