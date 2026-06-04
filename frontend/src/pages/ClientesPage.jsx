// gastubos/frontend/src/pages/ClientesPage.jsx
import { useState, useEffect, useCallback } from 'react'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner, EmptyState, TipoBadge } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

const EMPTY = { nombre: '', ruc: '', telefono: '', direccion: '', contacto: '', tipo: 'EMPRESA' }

export default function ClientesPage() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [q, setQ]               = useState('')
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [detalle, setDetalle]   = useState(null)
  const { toast }               = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/clientes', { params: { q: q || undefined } }); setClientes(r.data) }
    catch { } finally { setLoading(false) }
  }, [q])

  useEffect(() => { load() }, [load])

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (form.id) await api.patch(`/clientes/${form.id}`, form)
      else await api.post('/clientes', form)
      toast(`Cliente ${form.id ? 'actualizado' : 'creado'}`, 'success')
      setModal(false); setForm(EMPTY); load()
    } catch (err) { toast(err.response?.data?.error || 'Error', 'error') }
    finally { setSaving(false) }
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${clientes.length} clientes registrados`}
        actions={<button className="btn btn-sm btn-primary" onClick={() => { setForm(EMPTY); setModal(true) }}><i className="ti ti-plus" /> Nuevo Cliente</button>}
      />
      <div className="app-content">
        <div className="search-bar">
          <i className="ti ti-search" />
          <input placeholder="Buscar por nombre, RUC..." value={q} onChange={e => setQ(e.target.value)} />
          {q && <button className="btn-icon" onClick={() => setQ('')}><i className="ti ti-x" /></button>}
        </div>

        {loading ? <Spinner /> : (
          <>
            {/* VISTA TABLE (Desktop) */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              {clientes.length === 0 ? <EmptyState icon="ti-users" message="Sin clientes registrados" /> : (
                <table>
                  <thead><tr><th>Nombre</th><th>RUC / CI</th><th>Teléfono</th><th>Tipo</th><th>Tubos</th><th></th></tr></thead>
                  <tbody>
                    {clientes.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                        <td className="td-code">{c.ruc}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{c.telefono || '—'}</td>
                        <td><TipoBadge tipo={c.tipo} /></td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{c._count?.tubos ?? 0}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 3 }}>tubos</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" title="Ver detalle" onClick={() => setDetalle(c)}>
                              <i className="ti ti-eye" />
                            </button>
                            <button className="btn-icon" title="Editar" onClick={() => { setForm(c); setModal(true) }}>
                              <i className="ti ti-edit" />
                            </button>
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
              {clientes.length === 0 ? (
                <EmptyState icon="ti-users" message="Sin resultados" />
              ) : (
                clientes.map(c => (
                  <div key={c.id} className="list-card">
                    <div className="list-card-header">
                      <div className="list-card-title" style={{ fontFamily: 'inherit', color: 'inherit' }}>{c.nombre}</div>
                      <TipoBadge tipo={c.tipo} />
                    </div>
                    <div className="list-card-body">
                      <div className="list-card-item">
                        <span className="list-card-label">RUC / CI</span>
                        <span className="list-card-value td-code">{c.ruc}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Teléfono</span>
                        <span className="list-card-value">{c.telefono || '—'}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Tubos asignados</span>
                        <span className="list-card-value">{c._count?.tubos ?? 0} unidades</span>
                      </div>
                    </div>
                    <div className="list-card-actions">
                      <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setDetalle(c)}>
                        <i className="ti ti-eye" /> Detalle
                      </button>
                      <button className="btn btn-sm" onClick={() => { setForm(c); setModal(true) }}>
                        <i className="ti ti-edit" /> Editar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal crear/editar */}
      <Modal
        open={modal}
        title={form.id ? `Editar: ${form.nombre}` : 'Nuevo Cliente'}
        onClose={() => setModal(false)}
        footer={
          <>
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : <><i className="ti ti-device-floppy" /> Guardar</>}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <FormGroup label="Nombre / Razón social" required>
            <input value={form.nombre} onChange={f('nombre')} placeholder="Empresa SA..." required />
          </FormGroup>
          <FormGroup label="RUC o CI" required>
            <input value={form.ruc} onChange={f('ruc')} placeholder="80012345-1" required />
          </FormGroup>
          <FormGroup label="Tipo de cliente">
            <select value={form.tipo} onChange={f('tipo')}>
              <option value="EMPRESA">Empresa</option>
              <option value="PYME">Pyme</option>
              <option value="PARTICULAR">Particular</option>
            </select>
          </FormGroup>
          <FormGroup label="Teléfono">
            <input value={form.telefono || ''} onChange={f('telefono')} placeholder="021-555-0000" />
          </FormGroup>
          <FormGroup label="Contacto principal">
            <input value={form.contacto || ''} onChange={f('contacto')} placeholder="Nombre del contacto" />
          </FormGroup>
          <FormGroup label="Dirección" >
            <textarea value={form.direccion || ''} onChange={f('direccion')} placeholder="Calle, ciudad" style={{ height: 60 }} />
          </FormGroup>
        </div>
      </Modal>

      {/* Detalle rápido */}
      {detalle && (
        <Modal open={true} title={detalle.nombre} onClose={() => setDetalle(null)}>
          <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            {[['RUC/CI', detalle.ruc],['Tipo', detalle.tipo],['Teléfono', detalle.telefono || '—'],['Contacto', detalle.contacto || '—'],['Dirección', detalle.direccion || '—']].map(([k,v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}
