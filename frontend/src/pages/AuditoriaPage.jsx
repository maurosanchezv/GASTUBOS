// gastubos/frontend/src/pages/AuditoriaPage.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api.js'
import { PageHeader, StateBadge, Spinner, EmptyState } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [tuboQ,   setTuboQ]   = useState('')
  const { toast } = useToast()

  // Exportar reportes
  const [exportMenuAbierto, setExportMenuAbierto] = useState(false)
  const exportRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/auditoria', { params: { tuboId: tuboQ.trim().toUpperCase() || undefined, limit: 60 } })
      setRegistros(r.data.registros); setTotal(r.data.total)
    } catch {} finally { setLoading(false) }
  }, [tuboQ])

  useEffect(() => { load() }, [load])

  // Cerrar menus al hacer clic afuera
  useEffect(() => {
    const handler = e => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportMenuAbierto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const generateCSV = (data, filename) => {
    const headers = ['Fecha', 'Usuario', 'Tubo', 'Accion', 'Estado Anterior', 'Estado Nuevo', 'Observaciones']
    const rows = data.map(a => [
      new Date(a.createdAt).toLocaleString('es-PY'),
      a.usuario?.username,
      a.tubo?.id,
      a.accion,
      a.estadoAnterior || '—',
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

  const generatePDF = (data, title, filename) => {
    const doc = new jsPDF()
    doc.text(title, 14, 15)
    doc.setFontSize(10)
    doc.text(`Generado el: ${new Date().toLocaleString('es-PY')}`, 14, 22)
    
    const tableData = data.map(a => [
      new Date(a.createdAt).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }),
      a.usuario?.username,
      a.tubo?.id,
      a.accion,
      a.estadoNuevo || '—'
    ])

    autoTable(doc, {
      startY: 28,
      head: [['Fecha', 'Usuario', 'Tubo', 'Acción', 'Nuevo Estado']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [26, 95, 168] }
    })
    doc.save(`${filename}.pdf`)
  }

  const handleExport = async (tipo, formato, id = null) => {
    setExportMenuAbierto(false)
    let dataToExport = []
    let title = ""
    let filename = `auditoria_${tipo}_${new Date().toISOString().slice(0, 10)}`

    try {
      if (tipo === 'individual' && id) {
        const a = registros.find(x => x.id === id)
        if (!a) return toast('No se encontró el registro', 'error')
        
        if (formato === 'pdf') {
          const doc = new jsPDF()
          doc.setFontSize(18)
          doc.setTextColor(26, 95, 168)
          doc.text(`REGISTRO DE AUDITORÍA`, 14, 20)
          
          doc.setFontSize(11)
          doc.setTextColor(0)
          doc.text(`Tubo: ${a.tubo?.id}`, 14, 30)
          doc.text(`Fecha: ${new Date(a.createdAt).toLocaleString('es-PY')}`, 14, 37)
          doc.text(`Usuario: ${a.usuario?.username} (${a.usuario?.nombre || ''})`, 14, 44)
          doc.text(`Acción: ${a.accion}`, 14, 51)
          doc.text(`Estado Anterior: ${a.estadoAnterior || '—'}`, 14, 58)
          doc.text(`Estado Nuevo: ${a.estadoNuevo || '—'}`, 14, 65)
          doc.text(`Observaciones: ${a.observaciones || '—'}`, 14, 72)

          doc.save(`Auditoria_${a.tubo?.id}_${a.id.slice(0,5)}.pdf`)
        } else {
          generateCSV([a], `Auditoria_${a.tubo?.id}`)
        }
        return toast('Reporte generado', 'success')
      }

      if (tipo === 'mes' || tipo === 'anio') {
        const ahora = new Date()
        const desde = new Date(ahora.getFullYear(), tipo === 'mes' ? ahora.getMonth() : 0, 1)
        const r = await api.get(`/auditoria?desde=${desde.toISOString()}&limit=1000`)
        dataToExport = r.data.registros
        title = tipo === 'mes' ? "REPORTE MENSUAL DE AUDITORÍA" : "REPORTE ANUAL DE AUDITORÍA"
      } else {
        dataToExport = registros
        title = "HISTORIAL DE AUDITORÍA"
      }

      if (dataToExport.length === 0) return toast('No hay datos para exportar', 'info')

      if (formato === 'pdf') {
        generatePDF(dataToExport, title, filename)
      } else {
        generateCSV(dataToExport, filename)
      }
      toast('Reporte generado correctamente', 'success')
    } catch (err) {
      toast('Error al generar reporte', 'error')
    }
  }

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
                    <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} /> Descargar PDF
                  </div>
                  <div className="export-item" onClick={() => handleExport('mes', 'csv')}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} /> Descargar Planilla (Excel)
                  </div>

                  <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', fontWeight: 600, borderTop: '1px solid var(--border)' }}>REPORTE ANUAL</div>
                  <div className="export-item" onClick={() => handleExport('anio', 'pdf')}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} /> Descargar PDF
                  </div>
                  <div className="export-item" onClick={() => handleExport('anio', 'csv')}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} /> Descargar Planilla (Excel)
                  </div>
                </div>
              )}
            </div>
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
                      <th style={{ textAlign: 'right' }}>Acciones</th>
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
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <button className="btn-icon" title="Descargar PDF"
                                onClick={() => handleExport('individual', 'pdf', a.id)}>
                                <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} />
                              </button>
                              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>PDF</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <button className="btn-icon" title="Descargar Planilla"
                                onClick={() => handleExport('individual', 'csv', a.id)}>
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

                    <div className="list-card-actions" style={{ justifyContent: 'flex-end', gap: 16, paddingTop: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <button className="btn-icon" onClick={() => handleExport('individual', 'pdf', a.id)}
                          style={{ width: 44, height: 44, fontSize: 20 }}>
                          <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} />
                        </button>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>PDF</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <button className="btn-icon" onClick={() => handleExport('individual', 'csv', a.id)}
                          style={{ width: 44, height: 44, fontSize: 20 }}>
                          <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} />
                        </button>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Excel</span>
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
