// gastubos/frontend/src/pages/PlanesAlquilerPage.jsx
// Maestro configurable de planes de alquiler (CHICO/MEDIANO/GRANDE). Los
// contratos ya firmados guardan su propio snapshot de precios — cambiar acá
// no afecta alquileres existentes, solo los que se creen de ahora en más.
import { useState, useEffect } from 'react'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

const EMPTY = {
  id: null, codigo: '', nombre: '', precioInicial: '', diasIncluidos: 30,
  precioMensual: '', precioRecargaDomicilio: '', descripcion: '', activo: true,
  items: [],
}

const ITEM_VACIO = { descripcion: '', cantidad: 1, serializado: false }

export default function PlanesAlquilerPage() {
  const [planes, setPlanes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const loadPlanes = async () => {
    try {
      const r = await api.get('/planes-alquiler')
      setPlanes(r.data)
    } catch (err) {
      toast('Error al cargar planes de alquiler', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPlanes() }, [])

  const handleNuevo = () => { setForm(EMPTY); setModal(true) }
  const handleEdit = (plan) => {
    setForm({
      id: plan.id, codigo: plan.codigo, nombre: plan.nombre,
      precioInicial: Number(plan.precioInicial), diasIncluidos: plan.diasIncluidos,
      precioMensual: Number(plan.precioMensual), precioRecargaDomicilio: Number(plan.precioRecargaDomicilio),
      descripcion: plan.descripcion || '', activo: plan.activo,
      items: (plan.items || []).map(i => ({
        descripcion: i.descripcion, cantidad: Number(i.cantidad) || 1, serializado: !!i.serializado,
      })),
    })
    setModal(true)
  }

  // Helpers de la lista de ítems del plan
  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, { ...ITEM_VACIO }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const updItem    = (idx, patch) => setForm(f => ({
    ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it),
  }))
  const moveItem   = (idx, dir) => setForm(f => {
    const j = idx + dir
    if (j < 0 || j >= f.items.length) return f
    const items = [...f.items]
    ;[items[idx], items[j]] = [items[j], items[idx]]
    return { ...f, items }
  })

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.codigo || !form.nombre) return toast('Completá código y nombre', 'error')
    setSaving(true)
    try {
      const payload = {
        codigo: form.codigo, nombre: form.nombre,
        precioInicial: Number(form.precioInicial), diasIncluidos: Number(form.diasIncluidos),
        precioMensual: Number(form.precioMensual), precioRecargaDomicilio: Number(form.precioRecargaDomicilio),
        descripcion: form.descripcion || undefined, activo: form.activo,
        items: form.items
          .filter(i => i.descripcion.trim())
          .map((i, idx) => ({
            descripcion: i.descripcion.trim(),
            cantidad: Number(i.cantidad) > 0 ? Math.trunc(Number(i.cantidad)) : 1,
            serializado: !!i.serializado,
            orden: idx,
          })),
      }
      if (form.id) await api.put(`/planes-alquiler/${form.id}`, payload)
      else await api.post('/planes-alquiler', payload)
      toast(`Plan ${form.id ? 'actualizado' : 'creado'} correctamente`, 'success')
      setModal(false)
      loadPlanes()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al guardar el plan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const gs = (val) => Number(val).toLocaleString('es-PY') + ' Gs'

  return (
    <>
      <PageHeader
        title="Planes de Alquiler"
        subtitle="Maestro de precios de los equipos de oxígeno en alquiler"
        actions={<button className="btn btn-sm btn-primary" onClick={handleNuevo}><i className="ti ti-plus" /> Nuevo Plan</button>}
      />
      <div className="app-content">
        {loading ? <Spinner /> : (
          <>
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Código</th><th>Nombre</th><th>Pago inicial</th><th>Días incluidos</th>
                    <th>Mensualidad</th><th>Recarga a domicilio</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {planes.map(p => (
                    <tr key={p.id}>
                      <td className="td-code">{p.codigo}</td>
                      <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{gs(p.precioInicial)}</td>
                      <td>{p.diasIncluidos} días</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{gs(p.precioMensual)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{gs(p.precioRecargaDomicilio)}</td>
                      <td><span className={`badge badge-${p.activo ? 'ACTIVO' : 'DE_BAJA'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(p)}>
                          <i className="ti ti-edit" /> Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-list">
              {planes.map(p => (
                <div key={p.id} className="list-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="list-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</div>
                    <span className={`badge badge-${p.activo ? 'ACTIVO' : 'DE_BAJA'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Inicial:</span> <strong>{gs(p.precioInicial)}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Días:</span> <strong>{p.diasIncluidos}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Mensual:</span> <strong>{gs(p.precioMensual)}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Recarga:</span> <strong>{gs(p.precioRecargaDomicilio)}</strong></div>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(p)} style={{ width: '100%', justifyContent: 'center', display: 'flex', gap: 4 }}>
                      <i className="ti ti-edit" /> Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Modal
        open={modal}
        title={form.id ? `Editar Plan: ${form.nombre}` : 'Nuevo Plan de Alquiler'}
        onClose={() => setModal(false)}
        footer={
          <>
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <FormGroup label="Código" required hint="Ej: CHICO, MEDIANO, GRANDE">
              <input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))} disabled={!!form.id} required />
            </FormGroup>
            <FormGroup label="Nombre" required>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
            </FormGroup>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <FormGroup label="Pago inicial (Gs)" required hint="Tubo cargado + regulador + accesorios + días incluidos">
              <input type="number" min="0" value={form.precioInicial} onChange={e => setForm(f => ({ ...f, precioInicial: e.target.value }))} required />
            </FormGroup>
            <FormGroup label="Días incluidos" required>
              <input type="number" min="1" value={form.diasIncluidos} onChange={e => setForm(f => ({ ...f, diasIncluidos: e.target.value }))} required />
            </FormGroup>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <FormGroup label="Mensualidad (Gs)" required hint="Se cobra si el equipo sigue con el cliente al vencer el período">
              <input type="number" min="0" value={form.precioMensual} onChange={e => setForm(f => ({ ...f, precioMensual: e.target.value }))} required />
            </FormGroup>
            <FormGroup label="Recarga a domicilio (Gs)" required>
              <input type="number" min="0" value={form.precioRecargaDomicilio} onChange={e => setForm(f => ({ ...f, precioRecargaDomicilio: e.target.value }))} required />
            </FormGroup>
          </div>

          <FormGroup label="Descripción">
            <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} style={{ height: 56 }} />
          </FormGroup>

          {/* ── Ítems incluidos en el plan ── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Ítems incluidos</div>
              <button type="button" className="btn btn-sm btn-secondary" onClick={addItem}>
                <i className="ti ti-plus" /> Agregar ítem
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Se precargan en la remisión de alquiler. Marcá “Serie” en los que el repartidor debe registrar un nº de serie/código al entregar (ej: el cilindro).
            </div>

            {form.items.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Sin ítems cargados.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {form.items.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <button type="button" className="btn btn-xs" style={{ padding: '0 4px', lineHeight: 1 }} onClick={() => moveItem(idx, -1)} disabled={idx === 0} title="Subir">
                        <i className="ti ti-chevron-up" />
                      </button>
                      <button type="button" className="btn btn-xs" style={{ padding: '0 4px', lineHeight: 1 }} onClick={() => moveItem(idx, 1)} disabled={idx === form.items.length - 1} title="Bajar">
                        <i className="ti ti-chevron-down" />
                      </button>
                    </div>
                    <input
                      style={{ flex: 1 }}
                      placeholder="Descripción del equipo/accesorio"
                      value={it.descripcion}
                      onChange={e => updItem(idx, { descripcion: e.target.value })}
                    />
                    <input
                      type="number" min="1" style={{ width: 56 }} title="Cantidad"
                      value={it.cantidad}
                      onChange={e => updItem(idx, { cantidad: e.target.value })}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }} title="¿Lleva nº de serie?">
                      <input type="checkbox" checked={it.serializado} onChange={e => updItem(idx, { serializado: e.target.checked })} />
                      Serie
                    </label>
                    <button type="button" className="btn btn-sm btn-danger" style={{ padding: '0 8px' }} onClick={() => removeItem(idx)} title="Quitar">
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {form.id && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
              Plan activo (visible al crear nuevos alquileres)
            </label>
          )}
        </form>
      </Modal>
    </>
  )
}
