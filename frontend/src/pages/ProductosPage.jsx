// gastubos/frontend/src/pages/ProductosPage.jsx
import { useState, useEffect, useCallback } from 'react'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner, EmptyState, useToast } from '../components/ui.jsx'

const EMPTY = {
  codigo: '', nombre: '', descripcion: '', categoria: '', categoriaNombre: '',
  precio: '', unidad: 'unidades', stock: '', stockMinimo: '', activo: true,
}

const fmtGs = (v) => `${Number(v).toLocaleString('es-PY')} Gs.`

export default function ProductosPage() {
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [mostrarInactivos, setMostrarInactivos] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/productos', {
        params: {
          search: q || undefined,
          categoria: categoriaFiltro || undefined,
          activo: mostrarInactivos ? 'all' : 'true',
        },
      })
      setProductos(r.data)
    } catch { }
    finally { setLoading(false) }
  }, [q, categoriaFiltro, mostrarInactivos])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get('/productos/categorias').then(r => setCategorias(r.data)).catch(() => {})
  }, [])

  const abrirModal = (p = EMPTY) => {
    setForm(p === EMPTY ? EMPTY : {
      ...p,
      precio: p.precio ?? '',
      stock: p.stock ?? '',
      stockMinimo: p.stockMinimo ?? '',
    })
    setModal(true)
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.codigo || !form.nombre || !form.categoria || form.precio === '') {
      toast('Completá código, nombre, categoría y precio', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        codigo: form.codigo,
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        categoria: form.categoria,
        categoriaNombre: form.categoriaNombre || null,
        precio: Number(form.precio),
        unidad: form.unidad || 'unidades',
        stock: form.stock === '' ? null : Number(form.stock),
        stockMinimo: form.stockMinimo === '' ? null : Number(form.stockMinimo),
        activo: form.activo,
      }
      if (form.id) await api.patch(`/productos/${form.id}`, payload)
      else await api.post('/productos', payload)
      toast(`Producto ${form.id ? 'actualizado' : 'creado'}`, 'success')
      setModal(false)
      setForm(EMPTY)
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al guardar producto', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActivo = async (p) => {
    try {
      await api.patch(`/productos/${p.id}`, { activo: !p.activo })
      toast(p.activo ? 'Producto desactivado' : 'Producto reactivado', 'success')
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al actualizar producto', 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle={`${productos.length} productos ${mostrarInactivos ? '' : 'activos'}`}
        actions={<button className="btn btn-sm btn-primary" onClick={() => abrirModal(EMPTY)}><i className="ti ti-plus" /> Nuevo Producto</button>}
      />
      <div className="app-content">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="search-bar" style={{ flex: 1, minWidth: 220 }}>
            <i className="ti ti-search" />
            <input placeholder="Buscar por nombre o código..." value={q} onChange={e => setQ(e.target.value)} />
            {q && <button className="btn-icon" onClick={() => setQ('')}><i className="ti ti-x" /></button>}
          </div>
          <select value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">Todas las categorías</option>
            {categorias.map(c => (
              <option key={c.categoria} value={c.categoria}>{c.categoriaNombre || c.categoria}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={mostrarInactivos} onChange={e => setMostrarInactivos(e.target.checked)} />
            Mostrar inactivos
          </label>
        </div>

        {loading ? <Spinner /> : (
          <>
            {/* VISTA TABLE (Desktop) */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              {productos.length === 0 ? <EmptyState icon="ti-package" message="Sin productos" /> : (
                <table>
                  <thead>
                    <tr>
                      <th>Código</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Unidad</th><th>Stock</th><th>Estado</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map(p => (
                      <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.55 }}>
                        <td className="td-code">{p.codigo}</td>
                        <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{p.categoriaNombre || p.categoria}</td>
                        <td style={{ fontWeight: 600 }}>{fmtGs(p.precio)}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{p.unidad}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {p.stock !== null && p.stock !== undefined ? p.stock : '—'}
                        </td>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                            background: p.activo ? 'var(--green-light)' : 'var(--red-light)',
                            color: p.activo ? 'var(--green)' : 'var(--red)',
                          }}>
                            {p.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" title="Editar" onClick={() => abrirModal(p)}>
                              <i className="ti ti-edit" />
                            </button>
                            <button
                              className="btn-icon"
                              title={p.activo ? 'Desactivar' : 'Reactivar'}
                              onClick={() => toggleActivo(p)}
                            >
                              <i className={`ti ${p.activo ? 'ti-eye-off' : 'ti-eye'}`} style={{ color: p.activo ? 'var(--red)' : 'var(--green)' }} />
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
              {productos.length === 0 ? (
                <EmptyState icon="ti-package" message="Sin productos" />
              ) : (
                productos.map(p => (
                  <div key={p.id} className="list-card" style={{ opacity: p.activo ? 1 : 0.55 }}>
                    <div className="list-card-header">
                      <div className="list-card-title" style={{ fontFamily: 'inherit', color: 'inherit' }}>{p.nombre}</div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                        background: p.activo ? 'var(--green-light)' : 'var(--red-light)',
                        color: p.activo ? 'var(--green)' : 'var(--red)',
                      }}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="list-card-body">
                      <div className="list-card-item">
                        <span className="list-card-label">Código</span>
                        <span className="list-card-value td-code">{p.codigo}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Categoría</span>
                        <span className="list-card-value">{p.categoriaNombre || p.categoria}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Precio</span>
                        <span className="list-card-value" style={{ fontWeight: 600 }}>{fmtGs(p.precio)}</span>
                      </div>
                    </div>
                    <div className="list-card-actions">
                      <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => abrirModal(p)}>
                        <i className="ti ti-edit" /> Editar
                      </button>
                      <button className="btn btn-sm" onClick={() => toggleActivo(p)}>
                        <i className={`ti ${p.activo ? 'ti-eye-off' : 'ti-eye'}`} /> {p.activo ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <Modal
        open={modal}
        title={form.id ? `Editar Producto: ${form.nombre}` : 'Nuevo Producto'}
        onClose={() => setModal(false)}
        width={600}
        footer={
          <>
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : <><i className="ti ti-device-floppy" /> Guardar Producto</>}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <FormGroup label="Código" required>
            <input value={form.codigo} onChange={f('codigo')} placeholder="Ej: 026" required />
          </FormGroup>
          <FormGroup label="Nombre" required>
            <input value={form.nombre} onChange={f('nombre')} placeholder="Nombre del producto" required />
          </FormGroup>
          <FormGroup label="Categoría" required hint="Podés escribir una nueva o elegir una existente">
            <input value={form.categoria} onChange={f('categoria')} list="categorias-list" placeholder="ej: soldadura-tig" required />
            <datalist id="categorias-list">
              {categorias.map(c => <option key={c.categoria} value={c.categoria}>{c.categoriaNombre}</option>)}
            </datalist>
          </FormGroup>
          <FormGroup label="Nombre de categoría (visible)">
            <input value={form.categoriaNombre || ''} onChange={f('categoriaNombre')} placeholder="ej: Soldadura TIG" />
          </FormGroup>
          <FormGroup label="Precio (Gs.)" required>
            <input type="number" min="0" step="1" value={form.precio} onChange={f('precio')} required />
          </FormGroup>
          <FormGroup label="Unidad">
            <input value={form.unidad} onChange={f('unidad')} placeholder="unidades" />
          </FormGroup>
          <div className="form-group col-span-2">
            <label className="form-label" style={{ margin: 0 }}>Descripción</label>
            <textarea value={form.descripcion || ''} onChange={f('descripcion')} rows={2} />
          </div>

          <div className="form-group col-span-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
            <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>Stock (opcional, aún no se aplica)</label>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              No se descuenta automáticamente al vender — es solo referencia para más adelante.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Stock actual</label>
                <input type="number" step="1" value={form.stock} onChange={f('stock')} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Stock mínimo</label>
                <input type="number" step="1" value={form.stockMinimo} onChange={f('stockMinimo')} />
              </div>
            </div>
          </div>

          {form.id && (
            <div className="form-group col-span-2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input type="checkbox" checked={form.activo} onChange={e => setForm(p => ({ ...p, activo: e.target.checked }))} />
                <strong>Producto activo</strong>
              </label>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
