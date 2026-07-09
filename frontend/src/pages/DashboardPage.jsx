// gastubos/frontend/src/pages/DashboardPage.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api.js'
import { PageHeader, Spinner } from '../components/ui.jsx'

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

        {/* Accesos Rápidos */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-rocket" style={{ fontSize: 13, color: 'var(--blue)' }} /> Accesos Rápidos
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div 
              className="card" 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12, 
                padding: '12px 16px', 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)'
              }}
              onClick={() => navigate('/entregas?tab=nueva')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.04)';
                e.currentTarget.style.borderColor = 'var(--blue)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <div style={{ 
                width: 36, 
                height: 36, 
                borderRadius: 'var(--radius-md)', 
                backgroundColor: 'var(--blue-light)', 
                color: 'var(--blue)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0
              }}>
                <i className="ti ti-truck-delivery" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>Nueva Entrega</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Registrar salida de tubos</div>
              </div>
            </div>

            <div 
              className="card" 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12, 
                padding: '12px 16px', 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)'
              }}
              onClick={() => navigate('/entregas?tab=historial')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.04)';
                e.currentTarget.style.borderColor = 'var(--blue)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <div style={{ 
                width: 36, 
                height: 36, 
                borderRadius: 'var(--radius-md)', 
                backgroundColor: 'var(--green-light)', 
                color: 'var(--green)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0
              }}>
                <i className="ti ti-history" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>Historial de Entregas</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Consultar y reimprimir</div>
              </div>
            </div>

            <div 
              className="card" 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12, 
                padding: '12px 16px', 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)'
              }}
              onClick={() => navigate('/tubos')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.04)';
                e.currentTarget.style.borderColor = 'var(--blue)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <div style={{ 
                width: 36, 
                height: 36, 
                borderRadius: 'var(--radius-md)', 
                backgroundColor: 'var(--purple-light)', 
                color: 'var(--purple)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0
              }}>
                <i className="ti ti-cylinder" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>Control de Tubos</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Ver stock y estados</div>
              </div>
            </div>

            <div 
              className="card" 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12, 
                padding: '12px 16px', 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)'
              }}
              onClick={() => navigate('/cargas')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.04)';
                e.currentTarget.style.borderColor = 'var(--blue)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <div style={{ 
                width: 36, 
                height: 36, 
                borderRadius: 'var(--radius-md)', 
                backgroundColor: 'var(--coral-light)', 
                color: 'var(--coral)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0
              }}>
                <i className="ti ti-gas-station" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>Registrar Carga</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Carga de gas y stock</div>
              </div>
            </div>
          </div>
        </div>

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
            <button className="btn btn-sm" onClick={() => navigate('/entregas?tab=historial')}>
              Ver todas <i className="ti ti-arrow-right" />
            </button>
          </div>

          {entregasRecientes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Sin entregas registradas
            </div>
          ) : (
            <>
              {/* Vista Desktop: Tabla Completa */}
              <div className="desktop-only table-wrap">
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
                      <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/entregas?tab=historial')}>
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

              {/* Vista Móvil: Lista de Tarjetas Claras */}
              <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
                {entregasRecientes.map(e => {
                  const tipoCls = e.tipoOperacion === 'ALQUILER' ? 'ALQUILADO' : e.tipoOperacion === 'VENTA' ? 'VENDIDO' : 'ENTREGADO'
                  return (
                    <div
                      key={e.id}
                      onClick={() => navigate('/entregas?tab=historial')}
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--blue)', fontSize: 12 }}>{e.numero}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {new Date(e.fechaEntrega).toLocaleDateString('es-PY')}
                        </span>
                      </div>
                      
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                        {e.cliente?.nombre}
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                        <span className={`badge badge-${tipoCls}`} style={{ margin: 0, fontSize: 10 }}>
                          {e.tipoOperacion.replace('_', ' ')}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          <i className="ti ti-cylinder" style={{ marginRight: 3, verticalAlign: 'middle' }} />
                          {e.detalles?.length ?? 0} tubo{e.detalles?.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
