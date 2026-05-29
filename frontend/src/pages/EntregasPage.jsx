// gastubos/frontend/src/pages/EntregasPage.jsx
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api.js'
import { PageHeader, StateBadge, Spinner, GasDot, EmptyState } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

const EMPTY = {
  clienteId: '', direccionEntrega: '', tipoOperacion: 'ENTREGA_SIMPLE',
  repartidorId: '', observaciones: '', tubosIds: [],
  fechaVencimiento: '', referencia: '',
}

export default function EntregasPage() {
  const [tab, setTab]         = useState('nueva')   // 'nueva' | 'historial'
  const [form, setForm]       = useState(EMPTY)
  const [clientes, setClientes] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [tuboBusq, setTuboBusq] = useState('')
  const [tuboSug,  setTuboSug]  = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [entregas, setEntregas] = useState([])
  const [loadingH, setLoadingH] = useState(false)
  const [params]  = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    api.get('/clientes').then(r => setClientes(r.data)).catch(() => {})
    api.get('/usuarios').then(r => setUsuarios(r.data)).catch(() => {})
    if (params.get('tubo')) agregarTubo(params.get('tubo'))
  }, [])

  useEffect(() => {
    if (tab === 'historial') loadEntregas()
  }, [tab])

  async function loadEntregas() {
    setLoadingH(true)
    try {
      const r = await api.get('/entregas')
      setEntregas(r.data.entregas)
    } catch { } finally { setLoadingH(false) }
  }

  async function buscarTubo() {
    if (!tuboBusq.trim()) return
    try {
      const r = await api.get(`/tubos/${tuboBusq.trim().toUpperCase()}`)
      setTuboSug(r.data)
    } catch { toast('Tubo no encontrado', 'error'); setTuboSug(null) }
  }

  async function agregarTubo(id) {
    if (form.tubosIds.includes(id)) return toast('El tubo ya está en la lista')
    try {
      const r = await api.get(`/tubos/${id}`)
      if (!['DISPONIBLE','CARGADO','RESERVADO'].includes(r.data.estado)) {
        return toast(`Tubo en estado ${r.data.estado}, no disponible para entrega`, 'error')
      }
      setForm(f => ({ ...f, tubosIds: [...f.tubosIds, id] }))
      setTuboSug(null); setTuboBusq('')
    } catch { toast('Tubo no encontrado', 'error') }
  }

  function quitarTubo(id) {
    setForm(f => ({ ...f, tubosIds: f.tubosIds.filter(x => x !== id) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.clienteId) return toast('Seleccioná un cliente', 'error')
    if (form.tubosIds.length === 0) return toast('Agregá al menos un tubo', 'error')
    if (form.tipoOperacion === 'ALQUILER' && !form.fechaVencimiento) {
      return toast('Ingresá la fecha de vencimiento del alquiler', 'error')
    }
    setSaving(true)
    try {
      await api.post('/entregas', {
        ...form,
        repartidorId:     form.repartidorId || undefined,
        fechaVencimiento: form.fechaVencimiento ? new Date(form.fechaVencimiento).toISOString() : undefined,
        referencia:       form.referencia || undefined,
      })
      toast('Entrega registrada correctamente', 'success')
      setForm(EMPTY)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al registrar entrega', 'error')
    } finally { setSaving(false) }
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
  const clienteSeleccionado = clientes.find(c => c.id === form.clienteId)

  return (
    <>
      <PageHeader title="Entregas" subtitle="Registrar y consultar entregas de tubos" />
      <div className="app-content">
        <div className="tabs">
          <div className={`tab ${tab==='nueva'?'active':''}`}     onClick={() => setTab('nueva')}>Nueva Entrega</div>
          <div className={`tab ${tab==='historial'?'active':''}`} onClick={() => setTab('historial')}>Historial</div>
        </div>

        {tab === 'nueva' && (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
              {/* Formulario */}
              <div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-title" style={{ marginBottom: 14 }}>Datos de la entrega</div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Cliente <span className="form-required">*</span></label>
                      <select value={form.clienteId} onChange={f('clienteId')} required>
                        <option value="">Seleccionar cliente...</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tipo de operación <span className="form-required">*</span></label>
                      <select value={form.tipoOperacion} onChange={f('tipoOperacion')}>
                        <option value="ENTREGA_SIMPLE">Entrega simple</option>
                        <option value="ALQUILER">Alquiler</option>
                        <option value="VENTA">Venta</option>
                      </select>
                    </div>
                    <div className="form-group col-span-2">
                      <label className="form-label">Dirección de entrega <span className="form-required">*</span></label>
                      <input value={form.direccionEntrega} onChange={f('direccionEntrega')} placeholder={clienteSeleccionado?.direccion || 'Calle, ciudad...'} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Repartidor</label>
                      <select value={form.repartidorId} onChange={f('repartidorId')}>
                        <option value="">Sin asignar</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                      </select>
                    </div>
                    {form.tipoOperacion === 'ALQUILER' && (
                      <div className="form-group">
                        <label className="form-label">Fecha vencimiento alquiler <span className="form-required">*</span></label>
                        <input type="date" value={form.fechaVencimiento} onChange={f('fechaVencimiento')} required />
                      </div>
                    )}
                    {form.tipoOperacion === 'VENTA' && (
                      <div className="form-group">
                        <label className="form-label">Referencia (factura, orden)</label>
                        <input value={form.referencia} onChange={f('referencia')} placeholder="FAC-001" />
                      </div>
                    )}
                    <div className="form-group col-span-2">
                      <label className="form-label">Observaciones</label>
                      <textarea value={form.observaciones} onChange={f('observaciones')} style={{ height: 56 }} />
                    </div>
                  </div>
                </div>

                {/* Agregar tubos */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Tubos a entregar</div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{form.tubosIds.length} seleccionados</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                      style={{ flex: 1 }}
                      placeholder="Código del tubo (ej: TUBO-000001)"
                      value={tuboBusq}
                      onChange={e => setTuboBusq(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscarTubo())}
                    />
                    <button type="button" className="btn" onClick={buscarTubo}>
                      <i className="ti ti-search" /> Buscar
                    </button>
                  </div>

                  {tuboSug && (
                    <div style={{
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: 12, marginBottom: 10,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <GasDot gas={tuboSug.gas} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{tuboSug.id}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{tuboSug.gas} · {tuboSug.capacidadLitros}L</div>
                      </div>
                      <StateBadge estado={tuboSug.estado} />
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => agregarTubo(tuboSug.id)}>
                        <i className="ti ti-plus" /> Agregar
                      </button>
                    </div>
                  )}

                  {form.tubosIds.length === 0 ? (
                    <div style={{ border: '1px dashed var(--border-mid)', borderRadius: 8, padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      <i className="ti ti-cylinder" style={{ fontSize: 24, display: 'block', marginBottom: 6 }} />
                      Buscá tubos por código y agregálos aquí
                    </div>
                  ) : (
                    form.tubosIds.map(tuboId => (
                      <TuboChip key={tuboId} tuboId={tuboId} onRemove={quitarTubo} />
                    ))
                  )}
                </div>
              </div>

              {/* Resumen */}
              <div>
                <div className="card" style={{ position: 'sticky', top: 'calc(var(--header-h) + 20px)' }}>
                  <div className="card-title" style={{ marginBottom: 14 }}>Resumen</div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>CLIENTE</div>
                    <div style={{ fontWeight: 600 }}>{clienteSeleccionado?.nombre || '—'}</div>
                    {clienteSeleccionado && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{clienteSeleccionado.telefono}</div>}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>TIPO</div>
                    <div style={{ fontWeight: 600 }}>{form.tipoOperacion.replace('_',' ')}</div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>TUBOS</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--blue)' }}>{form.tubosIds.length}</div>
                  </div>
                  <div className="alert alert-info" style={{ fontSize: 11 }}>
                    <i className="ti ti-info-circle" />
                    Al confirmar, los tubos cambiarán de estado automáticamente.
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={saving || form.tubosIds.length === 0}>
                    {saving ? 'Registrando...' : <><i className="ti ti-check" /> Confirmar entrega</>}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {tab === 'historial' && (
          loadingH ? <Spinner /> : (
            <div className="card" style={{ padding: 0 }}>
              {entregas.length === 0 ? <EmptyState icon="ti-truck-delivery" message="Sin entregas registradas" /> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Nro</th><th>Cliente</th><th>Tipo</th><th>Tubos</th><th>Repartidor</th><th>Fecha</th></tr></thead>
                    <tbody>
                      {entregas.map(e => (
                        <tr key={e.id}>
                          <td className="td-code">{e.numero}</td>
                          <td style={{ fontWeight: 500 }}>{e.cliente?.nombre}</td>
                          <td>
                            <span className={`badge badge-${e.tipoOperacion === 'ALQUILER' ? 'ALQUILADO' : e.tipoOperacion === 'VENTA' ? 'VENDIDO' : 'ENTREGADO'}`}>
                              {e.tipoOperacion.replace('_',' ')}
                            </span>
                          </td>
                          <td>{e.detalles?.length ?? 0}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{e.repartidor?.nombre || '—'}</td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{new Date(e.fechaEntrega).toLocaleDateString('es-PY')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </>
  )
}

function TuboChip({ tuboId, onRemove }) {
  const [tubo, setTubo] = useState(null)
  useEffect(() => {
    api.get(`/tubos/${tuboId}`).then(r => setTubo(r.data)).catch(() => {})
  }, [tuboId])
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', background: 'var(--surface-2)',
      borderRadius: 8, marginBottom: 6, fontSize: 12,
    }}>
      {tubo && <GasDot gas={tubo.gas} />}
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--blue)' }}>{tuboId}</span>
      {tubo && <><span style={{ color: 'var(--text-secondary)' }}>{tubo.gas}</span><StateBadge estado={tubo.estado} /></>}
      <button type="button" className="btn-icon" style={{ marginLeft: 'auto' }} onClick={() => onRemove(tuboId)}>
        <i className="ti ti-x" />
      </button>
    </div>
  )
}
