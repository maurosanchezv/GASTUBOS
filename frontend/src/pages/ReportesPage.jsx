// gastubos/frontend/src/pages/ReportesPage.jsx
import { useEffect, useState } from 'react'
import api from '../services/api.js'
import { PageHeader, Spinner, GasDot } from '../components/ui.jsx'

const GAS_COLORS = { CO2:'#1A5FA8','CO₂':'#1A5FA8',Oxígeno:'#00695C',Argón:'#5B21B6',Nitrógeno:'#52525B',Acetileno:'#B45309' }
const gasColor = g => { for(const k in GAS_COLORS) if(g?.includes(k)) return GAS_COLORS[k]; return '#9A3412' }

const ESTADO_COLORS = {
  DISPONIBLE:'#2E7D32',CARGADO:'#1A5FA8',VACIO:'#52525B',ENTREGADO:'#00695C',
  ALQUILADO:'#5B21B6',VENDIDO:'#B45309',RESERVADO:'#1A5FA8',PERDIDO:'#B91C1C',
  DEVUELTO:'#9A3412',EN_REVISION:'#B45309'
}

export default function ReportesPage() {
  const [dash,   setDash]   = useState(null)
  const [gases,  setGases]  = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/reportes/dashboard'),
      api.get('/reportes/gases'),
      api.get('/reportes/tubos-por-cliente'),
    ]).then(([d, g, c]) => {
      setDash(d.data); setGases(g.data); setClientes(c.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <><PageHeader title="Reportes" /><div className="app-content"><Spinner /></div></>

  const estados = Object.entries(dash?.porEstado || {}).sort((a,b) => b[1]-a[1])
  const maxE = Math.max(...estados.map(e => e[1]), 1)
  const maxG = Math.max(...gases.map(g => g._count?.gas || 0), 1)
  const maxC = Math.max(...clientes.map(c => c._count?.tubos || 0), 1)

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle="Indicadores y estadísticas del sistema"
        actions={<button className="btn btn-sm"><i className="ti ti-download" /> Exportar</button>}
      />
      <div className="app-content">
        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 20 }}>
          {[
            ['Total tubos', dash?.tubosTotal, 'stat-blue'],
            ['Clientes', dash?.clientesActivos, 'stat-green'],
            ['Alquileres vencidos', dash?.alquileresVencidos, dash?.alquileresVencidos > 0 ? 'stat-red' : 'stat-gray'],
          ].map(([l, v, cls]) => (
            <div key={l} className="stat-card">
              <div className="stat-label">{l}</div>
              <div className={`stat-value ${cls}`}>{v ?? 0}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Tubos por estado */}
          <div className="card">
            <div className="card-header"><div className="card-title">Tubos por estado</div></div>
            {estados.map(([estado, count]) => (
              <div key={estado} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 96, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 }}>
                  {estado.replace('_',' ')}
                </div>
                <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${(count/maxE*100).toFixed(0)}%`, height: '100%', background: ESTADO_COLORS[estado] || '#888', borderRadius: 4, transition: 'width .4s' }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, width: 20, flexShrink: 0 }}>{count}</div>
              </div>
            ))}
          </div>

          {/* Gases */}
          <div className="card">
            <div className="card-header"><div className="card-title">Gases más utilizados</div></div>
            {gases.map(g => (
              <div key={g.gas} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <GasDot gas={g.gas} />
                <div style={{ width: 90, fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.gas}</div>
                <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${((g._count?.gas||0)/maxG*100).toFixed(0)}%`, height: '100%', background: gasColor(g.gas), borderRadius: 4, transition: 'width .4s' }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, width: 20 }}>{g._count?.gas}</div>
              </div>
            ))}
          </div>

          {/* Clientes con más tubos */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header"><div className="card-title">Clientes con más tubos asignados</div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Cliente</th><th>Tipo</th><th>Tubos asignados</th><th>Distribución</th></tr></thead>
                <tbody>
                  {clientes.filter(c => c._count?.tubos > 0).map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                      <td><span className={`badge badge-${c.tipo}`}>{c.tipo}</span></td>
                      <td style={{ fontWeight: 700 }}>{c._count?.tubos}</td>
                      <td style={{ width: 200 }}>
                        <div style={{ background: 'var(--surface-2)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                          <div style={{ width: `${((c._count?.tubos||0)/maxC*100).toFixed(0)}%`, height: '100%', background: 'var(--blue)', borderRadius: 4 }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
