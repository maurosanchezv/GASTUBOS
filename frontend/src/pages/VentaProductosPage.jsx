// gastubos/frontend/src/pages/VentaProductosPage.jsx
import { useState, useEffect, useMemo } from 'react'
import api from '../services/api.js'
import { PageHeader, Modal, Spinner, EmptyState, useToast, ObservacionCell } from '../components/ui.jsx'
import { useAuthStore } from '../store/authStore.js'

const fmtGs = (v) => `${Number(v).toLocaleString('es-PY')} Gs.`

const METODOS = [
  { value: 'EFECTIVO',     label: 'Efectivo',     icon: 'ti-cash' },
  { value: 'TRANSFERENCIA', label: 'Transferencia', icon: 'ti-building-bank' },
]

let cartKeySeq = 0

export default function VentaProductosPage() {
  const { user } = useAuthStore()
  const { toast } = useToast()
  const [tab, setTab] = useState('nueva')

  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])
  const [ventas, setVentas] = useState([])
  const [loadingVentas, setLoadingVentas] = useState(false)

  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState([])
  const [libreDescripcion, setLibreDescripcion] = useState('')
  const [librePrecio, setLibrePrecio] = useState('')
  const [libreCantidad, setLibreCantidad] = useState('1')
  const [metodoPago, setMetodoPago] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [detalleVenta, setDetalleVenta] = useState(null)

  useEffect(() => {
    api.get('/productos', { params: { activo: true } }).then(r => setProductos(r.data)).catch(() => {})
    api.get('/clientes').then(r => setClientes(r.data)).catch(() => {})
  }, [])

  const loadVentas = async () => {
    setLoadingVentas(true)
    try {
      const r = await api.get('/venta-productos')
      setVentas(r.data)
    } catch { }
    finally { setLoadingVentas(false) }
  }

  useEffect(() => { if (tab === 'historial') loadVentas() }, [tab])

  const resultadosBusqueda = useMemo(() => {
    if (!busqueda.trim()) return []
    const q = busqueda.trim().toLowerCase()
    return productos
      .filter(p => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
      .slice(0, 15)
  }, [busqueda, productos])

  const total = useMemo(
    () => carrito.reduce((acc, l) => acc + (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0), 0),
    [carrito]
  )

  const agregarProducto = (p) => {
    setCarrito(prev => {
      const existente = prev.find(l => l.productoId === p.id)
      if (existente) {
        return prev.map(l => l.productoId === p.id ? { ...l, cantidad: Number(l.cantidad) + 1 } : l)
      }
      return [...prev, {
        key: ++cartKeySeq,
        productoId: p.id,
        descripcion: p.nombre,
        cantidad: 1,
        precioUnitario: Number(p.precio),
        libre: false,
      }]
    })
    setBusqueda('')
  }

  const agregarItemLibre = () => {
    if (!libreDescripcion.trim() || librePrecio === '') {
      toast('Completá la descripción y el precio del ítem libre', 'error')
      return
    }
    setCarrito(prev => [...prev, {
      key: ++cartKeySeq,
      productoId: null,
      descripcion: libreDescripcion.trim(),
      cantidad: Number(libreCantidad) || 1,
      precioUnitario: Number(librePrecio),
      libre: true,
    }])
    setLibreDescripcion('')
    setLibrePrecio('')
    setLibreCantidad('1')
  }

  const actualizarCantidad = (key, cantidad) => {
    setCarrito(prev => prev.map(l => l.key === key ? { ...l, cantidad: cantidad === '' ? '' : Number(cantidad) } : l))
  }

  const actualizarPrecioLibre = (key, precio) => {
    setCarrito(prev => prev.map(l => (l.key === key && l.libre) ? { ...l, precioUnitario: precio === '' ? '' : Number(precio) } : l))
  }

  const quitarLinea = (key) => setCarrito(prev => prev.filter(l => l.key !== key))

  const resetVenta = () => {
    setCarrito([])
    setMetodoPago('')
    setClienteId('')
    setObservaciones('')
    setBusqueda('')
  }

  const confirmarVenta = async () => {
    if (carrito.length === 0) return toast('Agregá al menos un producto o ítem a la venta', 'error')
    if (!metodoPago) return toast('Seleccioná una forma de pago', 'error')
    if (carrito.some(l => !l.cantidad || l.cantidad <= 0)) return toast('Revisá las cantidades cargadas', 'error')

    setSubmitting(true)
    try {
      const payload = {
        clienteId: clienteId || null,
        metodoPago,
        observaciones: observaciones || null,
        detalles: carrito.map(l => ({
          productoId: l.productoId,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
        })),
      }
      const r = await api.post('/venta-productos', payload)
      toast(`Venta ${r.data.numero} registrada`, 'success')
      setVentas(prev => [r.data, ...prev])
      resetVenta()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al registrar la venta', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const cancelarVenta = async (venta) => {
    if (!window.confirm(`¿Cancelar la venta ${venta.numero}?`)) return
    try {
      const r = await api.patch(`/venta-productos/${venta.id}/cancelar`)
      setVentas(prev => prev.map(v => v.id === venta.id ? r.data : v))
      toast('Venta cancelada', 'success')
    } catch (err) {
      toast(err.response?.data?.error || 'Error al cancelar la venta', 'error')
    }
  }

  const puedeCancelar = user?.rol === 'ADMIN' || user?.rol === 'SUPERVISOR'

  return (
    <>
      <PageHeader title="Venta de Productos" subtitle="Registro de ventas del maestro de productos o ítems libres" />
      <div className="app-content">
        <div className="tabs">
          <div className={`tab ${tab === 'nueva' ? 'active' : ''}`} onClick={() => setTab('nueva')}>Nueva Venta</div>
          <div className={`tab ${tab === 'historial' ? 'active' : ''}`} onClick={() => setTab('historial')}>Historial</div>
        </div>

        {tab === 'nueva' && (
          <div className="venta-grid">
            {/* Columna izquierda: búsqueda + carrito */}
            <div className="card" style={{ padding: 16 }}>
              <div className="search-bar" style={{ marginBottom: 8 }}>
                <i className="ti ti-search" />
                <input
                  placeholder="Buscar producto por nombre o código..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
                {busqueda && <button className="btn-icon" onClick={() => setBusqueda('')}><i className="ti ti-x" /></button>}
              </div>

              {resultadosBusqueda.length > 0 && (
                <div className="search-results">
                  {resultadosBusqueda.map(p => (
                    <div key={p.id} className="search-result-item" onClick={() => agregarProducto(p)}>
                      <span className="search-result-name">
                        <span className="td-code" style={{ marginRight: 8 }}>{p.codigo}</span>
                        {p.nombre}
                      </span>
                      <span className="search-result-price">{fmtGs(p.precio)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Ítem libre */}
              <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 10, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Agregar ítem libre (no está en el maestro)
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    placeholder="Descripción"
                    value={libreDescripcion}
                    onChange={e => setLibreDescripcion(e.target.value)}
                    style={{ flex: 2, minWidth: 140 }}
                  />
                  <input
                    type="number" min="0" step="1" placeholder="Precio"
                    value={librePrecio}
                    onChange={e => setLibrePrecio(e.target.value)}
                    style={{ flex: 1, minWidth: 90 }}
                  />
                  <input
                    type="number" min="1" step="1" placeholder="Cant."
                    value={libreCantidad}
                    onChange={e => setLibreCantidad(e.target.value)}
                    style={{ width: 70 }}
                  />
                  <button className="btn btn-sm" onClick={agregarItemLibre}>
                    <i className="ti ti-plus" /> Agregar
                  </button>
                </div>
              </div>

              {/* Carrito */}
              {carrito.length === 0 ? (
                <EmptyState icon="ti-shopping-cart" message="Todavía no agregaste ítems" />
              ) : (
                <>
                  {/* VISTA TABLE (Desktop) */}
                  <div className="table-wrap hide-mobile">
                    <table>
                      <thead>
                        <tr><th>Ítem</th><th style={{ width: 90 }}>Cant.</th><th style={{ width: 110 }}>P. Unit.</th><th style={{ width: 100 }}>Subtotal</th><th></th></tr>
                      </thead>
                      <tbody>
                        {carrito.map(l => (
                          <tr key={l.key}>
                            <td>
                              {l.descripcion}
                              {l.libre && (
                                <span style={{
                                  marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                                  background: 'var(--amber-light)', color: 'var(--amber)',
                                }}>
                                  ítem libre
                                </span>
                              )}
                            </td>
                            <td>
                              <input
                                type="number" min="0" step="1" value={l.cantidad}
                                onChange={e => actualizarCantidad(l.key, e.target.value)}
                                style={{ width: 70, height: 30 }}
                              />
                            </td>
                            <td>
                              {l.libre ? (
                                <input
                                  type="number" min="0" step="1" value={l.precioUnitario}
                                  onChange={e => actualizarPrecioLibre(l.key, e.target.value)}
                                  style={{ width: 90, height: 30 }}
                                />
                              ) : fmtGs(l.precioUnitario)}
                            </td>
                            <td style={{ fontWeight: 600 }}>{fmtGs((Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0))}</td>
                            <td>
                              <button className="btn-icon" onClick={() => quitarLinea(l.key)}>
                                <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* VISTA CARDS (Mobile) */}
                  <div className="mobile-list">
                    {carrito.map(l => (
                      <div key={l.key} className="list-card">
                        <div className="list-card-header">
                          <div className="list-card-title" style={{ fontFamily: 'inherit', color: 'inherit' }}>
                            {l.descripcion}
                            {l.libre && (
                              <span style={{
                                marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                                background: 'var(--amber-light)', color: 'var(--amber)',
                              }}>
                                ítem libre
                              </span>
                            )}
                          </div>
                          <button className="btn-icon" onClick={() => quitarLinea(l.key)}>
                            <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                          </button>
                        </div>
                        <div className="list-card-body" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                          <div className="list-card-item">
                            <span className="list-card-label">Cantidad</span>
                            <input
                              type="number" min="0" step="1" value={l.cantidad}
                              onChange={e => actualizarCantidad(l.key, e.target.value)}
                            />
                          </div>
                          <div className="list-card-item">
                            <span className="list-card-label">P. Unit.</span>
                            {l.libre ? (
                              <input
                                type="number" min="0" step="1" value={l.precioUnitario}
                                onChange={e => actualizarPrecioLibre(l.key, e.target.value)}
                              />
                            ) : <span className="list-card-value">{fmtGs(l.precioUnitario)}</span>}
                          </div>
                          <div className="list-card-item">
                            <span className="list-card-label">Subtotal</span>
                            <span className="list-card-value" style={{ fontWeight: 600 }}>
                              {fmtGs((Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0))}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Columna derecha: forma de pago, cliente, total */}
            <div className="card" style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div>
                <label className="form-label">Forma de pago</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {METODOS.map(m => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMetodoPago(m.value)}
                      className="btn"
                      style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 8px',
                        border: metodoPago === m.value ? '2px solid var(--blue)' : '1px solid var(--border)',
                        background: metodoPago === m.value ? 'var(--blue-light)' : 'var(--surface-2)',
                        color: metodoPago === m.value ? 'var(--blue-dark)' : 'var(--text-secondary)',
                        fontWeight: metodoPago === m.value ? 700 : 500,
                      }}
                    >
                      <i className={`ti ${m.icon}`} style={{ fontSize: 20 }} />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label">Cliente (opcional)</label>
                <select value={clienteId} onChange={e => setClienteId(e.target.value)}>
                  <option value="">Sin cliente / Venta anónima</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Observaciones</label>
                <textarea rows={2} value={observaciones} onChange={e => setObservaciones(e.target.value)} />
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total</span>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{fmtGs(total)}</span>
              </div>

              <button className="btn btn-primary" disabled={submitting} onClick={confirmarVenta}>
                {submitting ? 'Registrando...' : <><i className="ti ti-check" /> Registrar Venta</>}
              </button>
            </div>
          </div>
        )}

        {tab === 'historial' && (
          loadingVentas ? <Spinner /> : (
            <>
              {/* VISTA TABLE (Desktop) */}
              <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
                {ventas.length === 0 ? <EmptyState icon="ti-receipt" message="Sin ventas registradas" /> : (
                  <table>
                    <thead>
                      <tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th>Ítems</th><th>Total</th><th>Estado</th><th></th></tr>
                    </thead>
                    <tbody>
                      {ventas.map(v => (
                        <tr key={v.id} style={{ opacity: v.cancelada ? 0.55 : 1 }}>
                          <td className="td-code">{v.numero}</td>
                          <td>{new Date(v.fechaVenta).toLocaleString('es-PY')}</td>
                          <td>{v.cliente?.nombre || 'Sin cliente'}</td>
                          <td>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                              background: v.metodoPago === 'EFECTIVO' ? 'var(--green-light)' : 'var(--blue-light)',
                              color: v.metodoPago === 'EFECTIVO' ? 'var(--green)' : 'var(--blue-dark)',
                            }}>
                              {v.metodoPago === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'}
                            </span>
                          </td>
                          <td>{v.detalles?.length ?? 0}</td>
                          <td style={{ fontWeight: 600 }}>{fmtGs(v.total)}</td>
                          <td>
                            {v.cancelada && (
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'var(--red-light)', color: 'var(--red)' }}>
                                Cancelada
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn-icon" title="Ver detalle" onClick={() => setDetalleVenta(v)}>
                                <i className="ti ti-eye" />
                              </button>
                              {puedeCancelar && !v.cancelada && (
                                <button className="btn-icon" title="Cancelar venta" onClick={() => cancelarVenta(v)}>
                                  <i className="ti ti-x" style={{ color: 'var(--red)' }} />
                                </button>
                              )}
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
                {ventas.length === 0 ? (
                  <EmptyState icon="ti-receipt" message="Sin ventas registradas" />
                ) : (
                  ventas.map(v => (
                    <div key={v.id} className="list-card" style={{ opacity: v.cancelada ? 0.55 : 1 }}>
                      <div className="list-card-header">
                        <div className="list-card-title">{v.numero}</div>
                        {v.cancelada && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'var(--red-light)', color: 'var(--red)' }}>
                            Cancelada
                          </span>
                        )}
                      </div>
                      <div className="list-card-body">
                        <div className="list-card-item">
                          <span className="list-card-label">Fecha</span>
                          <span className="list-card-value">{new Date(v.fechaVenta).toLocaleString('es-PY')}</span>
                        </div>
                        <div className="list-card-item">
                          <span className="list-card-label">Cliente</span>
                          <span className="list-card-value">{v.cliente?.nombre || 'Sin cliente'}</span>
                        </div>
                        <div className="list-card-item">
                          <span className="list-card-label">Pago</span>
                          <span className="list-card-value">{v.metodoPago === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'}</span>
                        </div>
                        <div className="list-card-item">
                          <span className="list-card-label">Total</span>
                          <span className="list-card-value" style={{ fontWeight: 600 }}>{fmtGs(v.total)}</span>
                        </div>
                      </div>
                      <div className="list-card-actions">
                        <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setDetalleVenta(v)}>
                          <i className="ti ti-eye" /> Ver detalle
                        </button>
                        {puedeCancelar && !v.cancelada && (
                          <button className="btn btn-sm" onClick={() => cancelarVenta(v)}>
                            <i className="ti ti-x" style={{ color: 'var(--red)' }} /> Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )
        )}
      </div>

      {detalleVenta && (
        <Modal open={true} title={`Venta ${detalleVenta.numero}`} onClose={() => setDetalleVenta(null)} width={560}>
          <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Cliente</span>
              <span style={{ fontWeight: 500 }}>{detalleVenta.cliente?.nombre || 'Sin cliente'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Forma de pago</span>
              <span style={{ fontWeight: 500 }}>{detalleVenta.metodoPago === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Registrada por</span>
              <span style={{ fontWeight: 500 }}>{detalleVenta.usuario?.nombre || '—'}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ítem</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th></tr></thead>
                <tbody>
                  {detalleVenta.detalles?.map(d => (
                    <tr key={d.id}>
                      <td>{d.descripcion}{!d.productoId && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--amber)' }}>(libre)</span>}</td>
                      <td>{Number(d.cantidad)}</td>
                      <td>{fmtGs(d.precioUnitario)}</td>
                      <td>{fmtGs(d.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <strong>Total</strong>
              <strong>{fmtGs(detalleVenta.total)}</strong>
            </div>
            {detalleVenta.observaciones && (
              <div style={{ fontSize: 12 }}>
                <strong>Observaciones:</strong> <ObservacionCell texto={detalleVenta.observaciones} titulo="Observaciones de la venta" maxWidth={320} />
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
