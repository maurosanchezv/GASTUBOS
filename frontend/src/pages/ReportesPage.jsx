// gastubos/frontend/src/pages/ReportesPage.jsx
import { useEffect, useState, useRef } from 'react'
import api from '../services/api.js'
import { PageHeader, Spinner, GasDot, useToast, EmptyState } from '../components/ui.jsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const GAS_COLORS = { CO2: '#1A5FA8', 'CO₂': '#1A5FA8', Oxígeno: '#00695C', Argón: '#5B21B6', Nitrógeno: '#52525B', Acetileno: '#B45309' }

const ESTADO_COLORS = {
  DISPONIBLE: '#2E7D32', CARGADO: '#1A5FA8', VACIO: '#52525B', ENTREGADO: '#00695C',
  ALQUILADO: '#5B21B6', VENDIDO: '#B45309', RESERVADO: '#1A5FA8', PERDIDO: '#B91C1C',
  DEVUELTO: '#9A3412', EN_REVISION: '#B45309'
}

const formatGs = (val) => 'Gs. ' + Number(val || 0).toLocaleString('es-PY')
const formatNum = (val) => {
  const num = Number(val || 0)
  if (isNaN(num)) return '0'
  if (Number.isInteger(num)) {
    return num.toLocaleString('es-PY')
  }
  const rounded = Math.round(num * 100) / 100
  return rounded.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function ReportesPage() {
  const { toast } = useToast()

  // Filtros de Periodo
  const [periodo, setPeriodo] = useState('hoy') // hoy | semana | mes | custom
  const [desde, setDesde] = useState(() => new Date().toISOString().slice(0, 10))
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))

  // Estado de Datos
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)

  // Exportar reportes menu
  const [exportMenuAbierto, setExportMenuAbierto] = useState(false)
  const exportRef = useRef(null)

  const fetchResumen = async () => {
    setLoading(true)
    try {
      let url = `/reportes/resumen?periodo=${periodo}`
      if (periodo === 'custom') {
        url += `&desde=${desde}&hasta=${hasta}`
      }
      const res = await api.get(url)
      setResumen(res.data)
    } catch (err) {
      toast('Error al cargar datos del reporte', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchResumen()
  }, [periodo, desde, hasta])

  // Cerrar menu exportar al hacer clic afuera
  useEffect(() => {
    const handler = e => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportMenuAbierto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const kpis = resumen?.kpis || {}
  const ventasYCobros = resumen?.ventasYCobros || []
  const cargasPorGas = resumen?.cargasPorGas || []
  const inventario = resumen?.inventario || {}
  const estadosArr = Object.entries(inventario.porEstado || {}).sort((a, b) => b[1] - a[1])
  const maxE = Math.max(...estadosArr.map(e => e[1]), 1)

  // Exportar PDF o CSV
  const handleExport = (formato) => {
    setExportMenuAbierto(false)
    if (!resumen) return

    const labelPeriodo = periodo === 'hoy' ? 'HOY' : periodo === 'semana' ? 'ESTA SEMANA' : periodo === 'mes' ? 'ESTE MES' : `DEL ${desde} AL ${hasta}`
    const fechaActual = new Date().toLocaleString('es-PY')
    const filename = `reporte_gastubos_${periodo}_${new Date().toISOString().slice(0, 10)}`

    if (formato === 'pdf') {
      try {
        const doc = new jsPDF()
        doc.setFontSize(16)
        doc.setTextColor(26, 95, 168)
        doc.text('RESUMEN DE OPERACIONES Y VENTAS — GASTUBOS', 14, 18)

        doc.setFontSize(10)
        doc.setTextColor(100)
        doc.text(`Periodo: ${labelPeriodo} | Generado el: ${fechaActual}`, 14, 25)

        // Resumen de KPIs
        doc.setFontSize(12)
        doc.setTextColor(0)
        doc.text('1. INDICADORES CLAVE (KPIS)', 14, 34)

        autoTable(doc, {
          startY: 38,
          head: [['Total Facturado', 'Entregas Concretadas', 'Entregas Canceladas', 'Cargas Realizadas']],
          body: [
            [
              formatGs(kpis.totalFacturado),
              `${kpis.entregasConcretadas || 0}`,
              `${kpis.entregasCanceladas || 0}`,
              `${kpis.cargasRealizadas || 0}`
            ]
          ],
          headStyles: { fillColor: [26, 95, 168] },
          theme: 'grid'
        })

        // Detalle de Ventas y Entregas
        doc.setFontSize(12)
        doc.setTextColor(0)
        doc.text('2. DETALLE DE VENTAS Y ENTREGAS', 14, doc.lastAutoTable.finalY + 12)

        const ventasBody = ventasYCobros.map(v => [
          new Date(v.fechaEntrega).toLocaleDateString('es-PY'),
          v.numero,
          v.clienteNombre,
          v.repartidorNombre,
          v.tipoOperacion,
          formatGs(v.totalOperacion),
          v.cancelada ? 'Cancelada' : v.confirmada ? 'Concretada' : 'Pendiente'
        ])

        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 16,
          head: [['Fecha', 'Remisión', 'Cliente', 'Repartidor', 'Operación', 'Total (Gs.)', 'Estado']],
          body: ventasBody,
          headStyles: { fillColor: [15, 118, 110] },
          theme: 'striped',
          styles: { fontSize: 8 }
        })

        // Cargas por Gas
        if (cargasPorGas.length > 0) {
          doc.setFontSize(12)
          doc.setTextColor(0)
          doc.text('3. RESUMEN DE CARGAS DE GAS', 14, doc.lastAutoTable.finalY + 12)

          const cargasBody = cargasPorGas.map(c => [
            c.tipoGas,
            c.unidad,
            c.conteo,
            `${formatNum(c.cantidadTotal)} ${c.unidad}`,
            formatGs(c.valorTotal),
            `${formatNum(c.promedioCarga)} ${c.unidad}`
          ])

          autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 16,
            head: [['Gas', 'Unidad', 'Cargas', 'Cantidad Total', 'Valor Total (Gs.)', 'Promedio']],
            body: cargasBody,
            headStyles: { fillColor: [180, 83, 9] },
            theme: 'grid',
            styles: { fontSize: 8 }
          })
        }

        doc.save(`${filename}.pdf`)
        toast('Reporte PDF descargado correctamente', 'success')
      } catch (err) {
        toast('Error al generar PDF de reporte', 'error')
      }
    } else {
      // CSV
      try {
        let csv = '\uFEFF'
        csv += `REPORTE DE NEGOCIO GASTUBOS - ${labelPeriodo}\n`
        csv += `Generado el: ${fechaActual}\n\n`

        csv += `1. RESUMEN GENERAL (KPIS)\n`
        csv += `Total Facturado,Entregas Concretadas,Entregas Canceladas,Cargas Realizadas\n`
        csv += `"${kpis.totalFacturado}","${kpis.entregasConcretadas}","${kpis.entregasCanceladas}","${kpis.cargasRealizadas}"\n\n`

        csv += `2. DETALLE DE VENTAS Y ENTREGAS\n`
        csv += `Fecha,Remisión,Cliente,Repartidor,Operación,Total Operación Gs,Estado\n`
        ventasYCobros.forEach(v => {
          const estadoStr = v.cancelada ? 'Cancelada' : v.confirmada ? 'Concretada' : 'Pendiente'
          csv += `"${new Date(v.fechaEntrega).toLocaleDateString('es-PY')}","${v.numero}","${v.clienteNombre}","${v.repartidorNombre}","${v.tipoOperacion}",${v.totalOperacion},"${estadoStr}"\n`
        })

        csv += `\n3. CARGAS DE GAS\n`
        csv += `Gas,Unidad,Cargas Realizadas,Cantidad Total,Valor Total Gs,Promedio por Carga\n`
        cargasPorGas.forEach(c => {
          csv += `"${c.tipoGas}","${c.unidad}",${c.conteo},${c.cantidadTotal},${c.valorTotal},${c.promedioCarga}\n`
        })

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${filename}.csv`
        link.click()
        toast('Planilla Excel/CSV descargada correctamente', 'success')
      } catch (err) {
        toast('Error al exportar CSV', 'error')
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Reportes de Operaciones"
        subtitle="Resumen de ventas, entregas, cargas de gas y stock por periodo"
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button className="btn" onClick={fetchResumen} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className={`ti ti-refresh ${loading ? 'ti-spin' : ''}`} />
              Actualizar
            </button>

            <div ref={exportRef} style={{ position: 'relative' }}>
              <button className="btn btn-primary" onClick={() => setExportMenuAbierto(!exportMenuAbierto)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-download" />
                Exportar
              </button>
              {exportMenuAbierto && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 100, minWidth: 200, overflow: 'hidden'
                }}>
                  <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', fontWeight: 600 }}>EXPORTAR FILTRO ACTUAL</div>
                  <div className="export-item" onClick={() => handleExport('pdf')}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} /> Documento PDF
                  </div>
                  <div className="export-item" onClick={() => handleExport('csv')}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} /> Planilla Excel (CSV)
                  </div>
                </div>
              )}
            </div>
          </div>
        }
      />

      <div className="app-content">

        {/* BARRA DE FILTRO DE PERIODO */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justify: 'space-between',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-calendar" style={{ fontSize: 16 }} /> Periodo:
            </span>

            <div style={{ display: 'inline-flex', background: 'var(--surface-2)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
              {[
                ['hoy', 'Hoy'],
                ['semana', 'Esta semana'],
                ['mes', 'Este mes'],
                ['custom', 'Personalizado']
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPeriodo(key)}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: periodo === key ? 700 : 500,
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: periodo === key ? 'var(--blue)' : 'transparent',
                    color: periodo === key ? '#fff' : 'var(--text-primary)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {periodo === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Desde:</span>
                <input
                  type="date"
                  value={desde}
                  onChange={e => setDesde(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hasta:</span>
                <input
                  type="date"
                  value={hasta}
                  onChange={e => setHasta(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12 }}
                />
              </div>
            </div>
          )}
        </div>

        {loading ? <Spinner /> : !resumen ? (
          <EmptyState
            icon="ti-alert-circle"
            title="No se pudieron cargar los datos"
            subtitle="Ocurrió un inconveniente al consultar el resumen del negocio."
            action={<button className="btn btn-primary" onClick={fetchResumen}>Reintentar</button>}
          />
        ) : (
          <>
            {/* TARJETAS KPI DE RESUMEN PRINCIPAL (4 TARJETAS SIMPLIFICADAS) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
              
              {/* Total Facturado */}
              <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
                <div className="stat-label">
                  <i className="ti ti-cash" style={{ color: '#10b981' }} /> Total Facturado
                </div>
                <div className="stat-value" style={{ color: '#047857', fontSize: 22 }}>
                  {formatGs(kpis.totalFacturado)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Productos + Delivery
                </div>
              </div>

              {/* Entregas Concretadas */}
              <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                <div className="stat-label">
                  <i className="ti ti-truck-delivery" style={{ color: '#3b82f6' }} /> Entregas Concretadas
                </div>
                <div className="stat-value" style={{ color: '#1d4ed8', fontSize: 22 }}>
                  {kpis.entregasConcretadas || 0}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Pedidos entregados con éxito
                </div>
              </div>

              {/* Entregas Canceladas */}
              <div className="stat-card" style={{ borderLeft: `4px solid ${kpis.entregasCanceladas > 0 ? '#ef4444' : '#6b7280'}` }}>
                <div className="stat-label">
                  <i className="ti ti-truck-off" style={{ color: kpis.entregasCanceladas > 0 ? '#ef4444' : '#6b7280' }} /> Entregas Canceladas
                </div>
                <div className="stat-value" style={{ color: kpis.entregasCanceladas > 0 ? '#b91c1c' : 'var(--text-primary)', fontSize: 22 }}>
                  {kpis.entregasCanceladas || 0}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Pedidos no concretados
                </div>
              </div>

              {/* Cargas de Gas */}
              <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                <div className="stat-label">
                  <i className="ti ti-flame" style={{ color: '#f59e0b' }} /> Cargas Realizadas
                </div>
                <div className="stat-value" style={{ color: '#b45309', fontSize: 22 }}>
                  {kpis.cargasRealizadas || 0}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Operaciones de recarga
                </div>
              </div>

            </div>

            {/* SECCIÓN 1: DETALLE DE VENTAS Y ENTREGAS */}
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="ti ti-file-invoice" style={{ color: 'var(--blue)' }} /> Detalle de Ventas y Entregas
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  {ventasYCobros.length} registros
                </span>
              </div>

              <div className="table-wrap hide-mobile">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>N° Remisión</th>
                      <th>Cliente</th>
                      <th>Repartidor</th>
                      <th>Tipo Operación</th>
                      <th style={{ textAlign: 'right' }}>Total Facturado</th>
                      <th style={{ textAlign: 'center' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasYCobros.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No hay entregas ni ventas registradas en el periodo seleccionado.
                        </td>
                      </tr>
                    ) : (
                      ventasYCobros.map(v => (
                        <tr key={v.id}>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {new Date(v.fechaEntrega).toLocaleDateString('es-PY')}
                          </td>
                          <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)' }}>
                            {v.numero}
                          </td>
                          <td style={{ fontWeight: 600 }}>{v.clienteNombre}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v.repartidorNombre}</td>
                          <td>
                            <span className={`badge badge-${v.tipoOperacion}`}>
                              {v.tipoOperacion}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                            {formatGs(v.totalOperacion)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {v.cancelada ? (
                              <span className="badge" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #ef4444' }}>
                                <i className="ti ti-x" /> Cancelada
                              </span>
                            ) : v.confirmada ? (
                              <span className="badge" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #10b981' }}>
                                <i className="ti ti-check" /> Concretada
                              </span>
                            ) : (
                              <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                <i className="ti ti-clock" /> Pendiente
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile version for Ventas y Entregas */}
              <div className="mobile-list">
                {ventasYCobros.map(v => (
                  <div key={v.id} className="list-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{v.numero}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(v.fechaEntrega).toLocaleDateString('es-PY')}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{v.clienteNombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Repartidor: {v.repartidorNombre}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', padding: '8px 10px', borderRadius: 6 }}>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>Total: <strong>{formatGs(v.totalOperacion)}</strong></div>
                      </div>
                      <div>
                        {v.cancelada ? (
                          <span className="badge" style={{ background: '#fef2f2', color: '#b91c1c' }}>Cancelada</span>
                        ) : v.confirmada ? (
                          <span className="badge" style={{ background: '#ecfdf5', color: '#047857' }}>Concretada</span>
                        ) : (
                          <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Pendiente</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SECCIÓN 2: RESUMEN DE CARGAS DE GAS POR UNIDAD */}
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="ti ti-flame" style={{ color: '#f59e0b' }} /> Resumen de Cargas de Gas (Unidades M³ y KG)
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tipo de Gas</th>
                      <th>Unidad</th>
                      <th style={{ textAlign: 'center' }}>Cargas Realizadas</th>
                      <th style={{ textAlign: 'right' }}>Cantidad Total Cargada</th>
                      <th style={{ textAlign: 'right' }}>Valor Total Registrado</th>
                      <th style={{ textAlign: 'right' }}>Promedio por Carga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargasPorGas.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No hay operaciones de carga registradas en este periodo.
                        </td>
                      </tr>
                    ) : (
                      cargasPorGas.map((c, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <GasDot gas={c.tipoGas} /> {c.tipoGas}
                          </td>
                          <td>
                            <span className="badge" style={{
                              background: c.unidad === 'KG' ? '#eff6ff' : '#ecfdf5',
                              color: c.unidad === 'KG' ? '#1d4ed8' : '#047857',
                              border: `1px solid ${c.unidad === 'KG' ? '#93c5fd' : '#6ee7b7'}`
                            }}>
                              {c.unidad}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            {c.conteo}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--blue)' }}>
                            {formatNum(c.cantidadTotal)} {c.unidad}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                            {formatGs(c.valorTotal)}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
                            {formatNum(c.promedioCarga)} {c.unidad} / carga
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECCIÓN 3: INVENTARIO DE CILINDROS (SECUNDARIO) */}
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="ti ti-cylinder" style={{ color: 'var(--blue)' }} /> Estado de Cilindros (Stock en Sistema)
                </div>
                {inventario.alquileresVencidos > 0 && (
                  <span className="badge" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #ef4444' }}>
                    <i className="ti ti-alert-circle" /> {inventario.alquileresVencidos} Alquileres Vencidos
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 8 }}>
                {estadosArr.map(([estado, count]) => (
                  <div key={estado} style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {estado.replace('_', ' ')}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: ESTADO_COLORS[estado] || 'var(--text-primary)' }}>
                      {count}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </>
        )}
      </div>
    </>
  )
}
