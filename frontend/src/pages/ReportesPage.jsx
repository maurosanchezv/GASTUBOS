// gastubos/frontend/src/pages/ReportesPage.jsx
import { useEffect, useState, useRef } from 'react'
import api from '../services/api.js'
import { PageHeader, Spinner, GasDot, useToast } from '../components/ui.jsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
  const { toast } = useToast()

  // Exportar reportes
  const [exportMenuAbierto, setExportMenuAbierto] = useState(false)
  const exportRef = useRef(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [d, g, c] = await Promise.all([
        api.get('/reportes/dashboard'),
        api.get('/reportes/gases'),
        api.get('/reportes/tubos-por-cliente'),
      ])
      setDash(d.data); setGases(g.data); setClientes(c.data)
    } catch (err) {
      toast('Error al cargar datos de reportes', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Cerrar menus al hacer clic afuera
  useEffect(() => {
    const handler = e => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportMenuAbierto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleExport = async (tipo, formato, dataItem = null) => {
    setExportMenuAbierto(false)
    let dataToExport = []
    let title = ""
    let filename = `reporte_${tipo}_${new Date().toISOString().slice(0, 10)}`

    try {
      if (tipo === 'mes' || tipo === 'anio') {
        const ahora = new Date()
        const desde = new Date(ahora.getFullYear(), tipo === 'mes' ? ahora.getMonth() : 0, 1)
        const r = await api.get(`/auditoria?desde=${desde.toISOString()}&limit=2000`)
        dataToExport = r.data.registros
        title = tipo === 'mes' ? "REPORTE MENSUAL DE ACTIVIDAD" : "REPORTE ANUAL DE ACTIVIDAD"
        
        if (dataToExport.length === 0) return toast('No hay movimientos en este periodo', 'info')

        if (formato === 'pdf') {
          const doc = new jsPDF()
          doc.setFontSize(18)
          doc.setTextColor(26, 95, 168)
          doc.text(title, 14, 20)
          doc.setFontSize(10)
          doc.setTextColor(100)
          doc.text(`Generado el: ${new Date().toLocaleString('es-PY')}`, 14, 28)

          const tableData = dataToExport.map(a => [
            new Date(a.createdAt).toLocaleDateString('es-PY'),
            a.usuario?.username,
            a.tubo?.id,
            a.accion,
            a.estadoNuevo || '—'
          ])

          autoTable(doc, {
            startY: 35,
            head: [['Fecha', 'Usuario', 'Tubo', 'Acción', 'Estado']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [26, 95, 168] }
          })
          doc.save(`${filename}.pdf`)
        } else {
          const headers = ['Fecha', 'Usuario', 'Tubo', 'Accion', 'Estado Nuevo', 'Observaciones']
          const rows = dataToExport.map(a => [
            new Date(a.createdAt).toLocaleString('es-PY'),
            a.usuario?.username,
            a.tubo?.id,
            a.accion,
            a.estadoNuevo || '—',
            a.observaciones || '—'
          ])
          const csvContent = "\uFEFF" + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `${filename}.csv`
          link.click()
        }
        return toast('Reporte generado correctamente', 'success')
      }

      if (formato === 'pdf') {
      const doc = new jsPDF()
      doc.setFontSize(18)
      doc.setTextColor(26, 95, 168)
      doc.text("INFORME GASTUBOS", 14, 20)
      
      doc.setFontSize(10)
      doc.setTextColor(100)
      doc.text(`Generado el: ${new Date().toLocaleString('es-PY')}`, 14, 28)

      if (tipo === 'cliente' && dataItem) {
        doc.setFontSize(14)
        doc.setTextColor(0)
        doc.text(`Reporte de Cliente: ${dataItem.nombre}`, 14, 40)
        autoTable(doc, {
          startY: 45,
          head: [['Detalle', 'Valor']],
          body: [
            ['Cliente', dataItem.nombre],
            ['Tipo', dataItem.tipo],
            ['Tubos Asignados', dataItem._count?.tubos || 0]
          ],
          headStyles: { fillColor: [26, 95, 168] }
        })
      } else {
        // Reporte General
        doc.setFontSize(14)
        doc.setTextColor(0)
        doc.text("Inventario por Estado", 14, 40)
        const estadosData = Object.entries(dash?.porEstado || {}).map(([k, v]) => [k.replace('_', ' '), v])
        autoTable(doc, {
          startY: 45,
          head: [['Estado', 'Cantidad']],
          body: estadosData,
          theme: 'striped',
          headStyles: { fillColor: [26, 95, 168] }
        })

        doc.text("Uso por Tipo de Gas", 14, doc.lastAutoTable.finalY + 15)
        const gasesData = gases.map(g => [g.gas, g._count?.gas || 0])
        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 20,
          head: [['Tipo de Gas', 'Cantidad de Tubos']],
          body: gasesData,
          theme: 'striped',
          headStyles: { fillColor: [0, 105, 92] }
        })
      }

      doc.save(`${filename}.pdf`)
      toast('PDF generado correctamente', 'success')
    } else {
      // CSV
      let csvContent = "\uFEFF"
      if (tipo === 'cliente' && dataItem) {
        csvContent += "REPORTE DE CLIENTE\nNombre,Tipo,Tubos\n"
        csvContent += `"${dataItem.nombre}","${dataItem.tipo}",${dataItem._count?.tubos}\n`
      } else {
        csvContent += "REPORTE ESTADÍSTICO GENERAL\n\n"
        csvContent += "ESTADOS\nEstado,Cantidad\n"
        Object.entries(dash?.porEstado || {}).forEach(([k, v]) => { csvContent += `"${k}",${v}\n` })
        csvContent += "\nGASES\nGas,Cantidad\n"
        gases.forEach(g => { csvContent += `"${g.gas}",${g._count?.gas || 0}\n` })
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename}.csv`
      link.click()
      toast('Planilla generada correctamente', 'success')
    }
  } catch (err) {
    toast('Error al generar reporte', 'error')
  }
}

const estadosArr = Object.entries(dash?.porEstado || {}).sort((a,b) => b[1]-a[1])
  const maxE = Math.max(...estadosArr.map(e => e[1]), 1)
  const maxG = Math.max(...gases.map(g => g._count?.gas || 0), 1)
  const maxC = Math.max(...clientes.map(c => c._count?.tubos || 0), 1)

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle="Indicadores y estadísticas del sistema"
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={fetchData} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 auto', justifyContent: 'center', maxWidth: '200px' }}>
              <i className={`ti ti-refresh ${loading ? 'ti-spin' : ''}`} />
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>
            
            <div ref={exportRef} style={{ position: 'relative', flex: '1 1 auto', maxWidth: '200px' }}>
              <button className="btn btn-primary" onClick={() => setExportMenuAbierto(!exportMenuAbierto)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}>
                <i className="ti ti-download" />
                Exportar
              </button>
              {exportMenuAbierto && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 100, minWidth: 220, overflow: 'hidden'
                }}>
                  <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', fontWeight: 600 }}>REPORTE MENSUAL</div>
                  <div className="export-item" onClick={() => handleExport('mes', 'pdf')}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} /> Actividad del mes (PDF)
                  </div>
                  <div className="export-item" onClick={() => handleExport('mes', 'csv')}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} /> Actividad del mes (Excel)
                  </div>

                  <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', fontWeight: 600, borderTop: '1px solid var(--border)' }}>REPORTE ANUAL</div>
                  <div className="export-item" onClick={() => handleExport('anio', 'pdf')}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} /> Actividad del año (PDF)
                  </div>
                  <div className="export-item" onClick={() => handleExport('anio', 'csv')}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} /> Actividad del año (Excel)
                  </div>

                  <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', fontWeight: 600, borderTop: '1px solid var(--border)' }}>ESTADÍSTICAS ACTUALES</div>
                  <div className="export-item" onClick={() => handleExport('general', 'pdf')}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-chart-bar" style={{ color: 'var(--blue)' }} /> Informe Estadístico (PDF)
                  </div>
                  <div className="export-item" onClick={() => handleExport('general', 'csv')}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} /> Datos Dashboard (Excel)
                  </div>
                </div>
              )}
            </div>
          </div>
        }
      />
      <div className="app-content">
        {loading && !dash ? <Spinner /> : (
          <>
            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
              {[
                ['Total tubos', dash?.tubosTotal, 'stat-blue', 'ti-cylinder'],
                ['Clientes', dash?.clientesActivos, 'stat-green', 'ti-users'],
                ['Alquileres vencidos', dash?.alquileresVencidos, dash?.alquileresVencidos > 0 ? 'stat-red' : 'stat-gray', 'ti-alert-circle'],
              ].map(([l, v, cls, icon]) => (
                <div key={l} className="stat-card">
                  <div className="stat-label"><i className={`ti ${icon}`} /> {l}</div>
                  <div className={`stat-value ${cls}`}>{v ?? 0}</div>
                </div>
              ))}
            </div>

            <div className="responsive-grid">
              {/* Tubos por estado */}
              <div className="card">
                <div className="card-header"><div className="card-title">Tubos por estado</div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {estadosArr.map(([estado, count]) => (
                    <div key={estado} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 90, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0, fontWeight: 500 }}>
                        {estado.replace('_',' ')}
                      </div>
                      <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 10, height: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <div style={{ width: `${(count/maxE*100).toFixed(0)}%`, height: '100%', background: ESTADO_COLORS[estado] || '#888', borderRadius: 10, transition: 'width .6s ease' }} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, width: 25, flexShrink: 0, color: 'var(--text-primary)' }}>{count}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gases */}
              <div className="card">
                <div className="card-header"><div className="card-title">Gases más utilizados</div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {gases.map(g => (
                    <div key={g.gas} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <GasDot gas={g.gas} />
                      <div style={{ width: 85, fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{g.gas}</div>
                      <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 10, height: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <div style={{ width: `${((g._count?.gas||0)/maxG*100).toFixed(0)}%`, height: '100%', background: gasColor(g.gas), borderRadius: 10, transition: 'width .6s ease' }} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, width: 25, color: 'var(--text-primary)' }}>{g._count?.gas}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Clientes con más tubos asignados */}
              <div className="card col-span-2">
                <div className="card-header"><div className="card-title">Clientes con más tubos asignados</div></div>
                
                {/* Desktop Table */}
                <div className="table-wrap hide-mobile">
                  <table>
                    <thead><tr><th>Cliente</th><th>Tipo</th><th>Cant. Tubos</th><th>Distribución</th><th style={{ textAlign: 'right' }}>Acciones</th></tr></thead>
                    <tbody>
                      {clientes.filter(c => c._count?.tubos > 0).map(c => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{c.nombre}</td>
                          <td><span className={`badge badge-${c.tipo}`}>{c.tipo}</span></td>
                          <td style={{ fontWeight: 700, fontSize: 13 }}>{c._count?.tubos}</td>
                          <td style={{ width: '30%' }}>
                            <div style={{ background: 'var(--surface-2)', borderRadius: 10, height: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                              <div style={{ width: `${((c._count?.tubos||0)/maxC*100).toFixed(0)}%`, height: '100%', background: 'var(--blue)', borderRadius: 10 }} />
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'flex-start' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <button className="btn-icon" onClick={() => handleExport('cliente', 'pdf', c)}>
                                  <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} />
                                </button>
                                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>PDF</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <button className="btn-icon" onClick={() => handleExport('cliente', 'csv', c)}>
                                  <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} />
                                </button>
                                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>Excel</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="mobile-list">
                  {clientes.filter(c => c._count?.tubos > 0).map(c => (
                    <div key={c.id} className="list-card" style={{ background: 'var(--surface-2)', border: 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.nombre}</span>
                        <span className={`badge badge-${c.tipo}`}>{c.tipo}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{ flex: 1, background: 'rgba(0,0,0,0.05)', borderRadius: 10, height: 8 }}>
                          <div style={{ width: `${((c._count?.tubos||0)/maxC*100).toFixed(0)}%`, height: '100%', background: 'var(--blue)', borderRadius: 10 }} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 12 }}>{c._count?.tubos} tubos</span>
                      </div>

                      <div className="list-card-actions" style={{ justifyContent: 'flex-end', gap: 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <button className="btn-icon" onClick={() => handleExport('cliente', 'pdf', c)}
                            style={{ width: 44, height: 44, fontSize: 20 }}>
                            <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} />
                          </button>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>PDF</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <button className="btn-icon" onClick={() => handleExport('cliente', 'csv', c)}
                            style={{ width: 44, height: 44, fontSize: 20 }}>
                            <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} />
                          </button>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Excel</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
