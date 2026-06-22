// gastubos/frontend/src/pages/TarifasPage.jsx
import { useState, useEffect } from 'react'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

const GASES = [
  { value: 'CO2', label: 'Dióxido de Carbono (CO₂)' },
  { value: 'OXIGENO', label: 'Oxígeno (O₂)' },
  { value: 'ARGON', label: 'Argón (Ar)' },
  { value: 'NITROGENO', label: 'Nitrógeno (N₂)' },
  { value: 'AIRE_COMPRIMIDO', label: 'Aire Comprimido' },
  { value: 'MEZCLA_CO2_ARGON', label: 'Mezcla CO₂ / Argón' },
  { value: 'ACETILENO', label: 'Acetileno (C₂H₂)' },
]

export default function TarifasPage() {
  const [precios, setPrecios] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ gas: '', unidad: 'KG', precioUnitario: 0 })
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const loadPrecios = async () => {
    try {
      const r = await api.get('/precios')
      setPrecios(r.data)
    } catch (err) {
      toast('Error al cargar tarifas', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPrecios()
  }, [])

  const handleEdit = (gasInfo) => {
    // Buscar si ya tiene precio configurado
    const existing = precios.find(p => p.gas === gasInfo.value)
    setForm({
      gas: gasInfo.value,
      unidad: existing ? existing.unidad : 'KG',
      precioUnitario: existing ? Number(existing.precioUnitario) : 0,
    })
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (form.precioUnitario < 0) {
      return toast('El precio no puede ser negativo', 'error')
    }
    setSaving(true)
    try {
      await api.put('/precios', form)
      toast('Tarifa actualizada correctamente', 'success')
      setModal(false)
      loadPrecios()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al guardar tarifa', 'error')
    } finally {
      setSaving(false)
    }
  }

  const formatPrice = (val) => {
    if (val === undefined || val === null) return '—'
    return Number(val).toLocaleString('es-PY') + ' GS'
  }

  return (
    <>
      <PageHeader
        title="Configuración de Tarifas"
        subtitle="Administración de precios unitarios de gases"
      />
      <div className="app-content">
        {loading ? (
          <Spinner />
        ) : (
          <>
            {/* Vista Desktop (Tabla) */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Gas</th>
                    <th>Unidad de Medida</th>
                    <th>Precio Unitario</th>
                    <th>Última Actualización</th>
                    <th>Actualizado Por</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {GASES.map((gasInfo) => {
                    const p = precios.find(x => x.gas === gasInfo.value)
                    return (
                      <tr key={gasInfo.value}>
                        <td style={{ fontWeight: 600 }}>
                          {gasInfo.label} <span className="td-code" style={{ marginLeft: 6 }}>{gasInfo.value}</span>
                        </td>
                        <td>
                          {p ? (
                            <span className={`badge badge-${p.unidad === 'KG' ? 'ACTIVO' : 'DISPONIBLE'}`}>
                              {p.unidad}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                          {p ? formatPrice(p.precioUnitario) : <span style={{ color: 'var(--text-muted)' }}>No configurado</span>}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                          {p ? new Date(p.updatedAt).toLocaleString('es-PY') : '—'}
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {p?.actualizadoPor || '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleEdit(gasInfo)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <i className="ti ti-edit" /> Editar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Vista Mobile (Tarjetas) */}
            <div className="mobile-list">
              {GASES.map((gasInfo) => {
                const p = precios.find(x => x.gas === gasInfo.value)
                return (
                  <div key={gasInfo.value} className="list-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="list-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>
                        {gasInfo.label}
                      </div>
                      {p && (
                        <span className={`badge badge-${p.unidad === 'KG' ? 'ACTIVO' : 'DISPONIBLE'}`} style={{ fontSize: '10px' }}>
                          {p.unidad}
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Precio</span>
                        <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--blue)' }}>
                          {p ? formatPrice(p.precioUnitario) : 'No configurado'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)', paddingTop: '6px' }}>
                      <span>Act: {p ? new Date(p.updatedAt).toLocaleDateString('es-PY') : '—'}</span>
                      <span>Por: {p?.actualizadoPor || '—'}</span>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleEdit(gasInfo)}
                        style={{ width: '100%', justifyContent: 'center', display: 'flex', gap: 4 }}
                      >
                        <i className="ti ti-edit" /> Editar Tarifa
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <Modal
        open={modal}
        title={`Editar Tarifa: ${GASES.find(g => g.value === form.gas)?.label || form.gas}`}
        onClose={() => setModal(false)}
        footer={
          <>
            <button className="btn" onClick={() => setModal(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormGroup label="Unidad de Medida" required>
            <select
              value={form.unidad}
              onChange={e => setForm(p => ({ ...p, unidad: e.target.value }))}
              required
            >
              <option value="KG">Kilogramo (KG)</option>
              <option value="M3">Metro Cúbico (M³)</option>
            </select>
          </FormGroup>

          <FormGroup label="Precio Unitario (GS)" required>
            <input
              type="number"
              min="0"
              value={form.precioUnitario}
              onChange={e => setForm(p => ({ ...p, precioUnitario: e.target.value }))}
              placeholder="Ej: 15000"
              required
            />
          </FormGroup>
        </form>
      </Modal>
    </>
  )
}
