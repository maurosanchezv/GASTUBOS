// gastubos/frontend/src/pages/VentaProductosPage.jsx
import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import api from '../services/api.js'
import { PageHeader, Modal, Confirm, Spinner, EmptyState, useToast, ObservacionCell, FormGroup } from '../components/ui.jsx'
import { useAuthStore } from '../store/authStore.js'
import { useConfigStore } from '../store/configStore.js'
import { getBrandingSources } from '../utils/logosSvg.js'
import { conectarImpresoraWebBluetooth, enviarBufferWebBluetooth, esNavegadorMovilConWebBluetooth } from '../utils/webBluetoothPrinter.js'
import { construirBufferTicketVentaProductos } from '../utils/ticketsImpresion.js'
import ClienteAutocomplete from '../components/ClienteAutocomplete.jsx'
import { METODO_PAGO_INFO, metodoPagoLabel, fmtVencimiento, hoyLocalStr, sumarDiasStr, estaVencida } from '../utils/metodoPago.js'

const fmtGs = (v) => `${Math.round(Number(v) || 0).toLocaleString('es-PY')} Gs.`

const METODOS = [
  { value: 'EFECTIVO',      label: 'Efectivo',      icon: 'ti-cash' },
  { value: 'TRANSFERENCIA', label: 'Transferencia', icon: 'ti-building-bank' },
  { value: 'CREDITO',       label: 'Crédito',       icon: 'ti-credit-card' },
]

// Estado derivado del crédito de una venta — igual criterio que el backend
// (estadoCreditoVenta en utils/ventaProducto.js): no se guarda, se calcula.
function estadoCreditoVenta(venta) {
  const cobrado = Number(venta.montoCobrado || 0)
  const total = Number(venta.total)
  if (cobrado <= 0) return 'PENDIENTE'
  if (cobrado >= total) return 'COBRADO'
  return 'PARCIAL'
}

const CREDITO_ESTADO_INFO = {
  PENDIENTE: { label: 'Pendiente', bg: 'var(--red-light)',    color: 'var(--red)' },
  PARCIAL:   { label: 'Parcial',   bg: 'var(--amber-light)',  color: 'var(--amber)' },
  COBRADO:   { label: 'Cobrado',   bg: 'var(--green-light)',  color: 'var(--green)' },
}

function CreditoEstadoBadge({ venta }) {
  const estado = estadoCreditoVenta(venta)
  const saldo = Number(venta.total) - Number(venta.montoCobrado || 0)
  const vencida = estaVencida(venta)
  const info = vencida ? { label: 'Vencida', bg: 'var(--red-light)', color: 'var(--red)' } : CREDITO_ESTADO_INFO[estado]
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: info.bg, color: info.color, whiteSpace: 'nowrap' }}>
      {estado === 'COBRADO' ? 'Cobrado' : `${info.label} ${fmtGs(saldo)}`}
      {estado !== 'COBRADO' && venta.fechaVencimiento && ` · vence ${fmtVencimiento(venta.fechaVencimiento)}`}
    </span>
  )
}

let cartKeySeq = 0

export default function VentaProductosPage() {
  const { user } = useAuthStore()
  const { toast } = useToast()
  const { nombre_empresa, direccion, telefono, isotipo_empresa, logo_empresa } = useConfigStore()
  const branding = getBrandingSources(isotipo_empresa, logo_empresa)
  const [tab, setTab] = useState('nueva')

  const [productos, setProductos] = useState([])
  const [ventas, setVentas] = useState([])
  const [loadingVentas, setLoadingVentas] = useState(false)

  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState([])
  const [libreDescripcion, setLibreDescripcion] = useState('')
  const [librePrecio, setLibrePrecio] = useState('')
  const [libreCantidad, setLibreCantidad] = useState('1')
  const [metodoPago, setMetodoPago] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [clienteVenta, setClienteVenta] = useState(null)
  const [observaciones, setObservaciones] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [detalleVenta, setDetalleVenta] = useState(null)
  const [ventaRegistrada, setVentaRegistrada] = useState(null)
  const [ventaParaImprimir, setVentaParaImprimir] = useState(null)
  const [confirmVentaOpen, setConfirmVentaOpen] = useState(false)

  const [modalPago, setModalPago] = useState(null) // venta seleccionada para cobrar
  const [formPago, setFormPago] = useState({ monto: '', metodoPago: 'EFECTIVO', observacion: '' })
  const [guardandoPago, setGuardandoPago] = useState(false)

  const [modalVencimiento, setModalVencimiento] = useState(null) // venta seleccionada para editar vencimiento
  const [formVencimiento, setFormVencimiento] = useState('')
  const [guardandoVencimiento, setGuardandoVencimiento] = useState(false)

  useEffect(() => {
    api.get('/productos', { params: { activo: true } }).then(r => setProductos(r.data)).catch(() => {})
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
    setVentaRegistrada(null)
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
    setVentaRegistrada(null)
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
    setFechaVencimiento('')
    setClienteVenta(null)
    setObservaciones('')
    setBusqueda('')
  }

  const intentarRegistrarVenta = () => {
    if (carrito.length === 0) return toast('Agregá al menos un producto o ítem a la venta', 'error')
    if (!metodoPago) return toast('Seleccioná una forma de pago', 'error')
    if (metodoPago === 'CREDITO' && !clienteVenta) return toast('Seleccioná un cliente para vender a crédito', 'error')
    if (carrito.some(l => !l.cantidad || l.cantidad <= 0)) return toast('Revisá las cantidades cargadas', 'error')
    setConfirmVentaOpen(true)
  }

  const confirmarVenta = async () => {
    setConfirmVentaOpen(false)
    setSubmitting(true)
    try {
      const payload = {
        clienteId: clienteVenta?.id || null,
        metodoPago,
        fechaVencimiento: metodoPago === 'CREDITO' ? (fechaVencimiento || null) : null,
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
      setVentaRegistrada(r.data)
      resetVenta()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al registrar la venta', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Punto único de despacho de impresión del ticket de venta, mismo patrón de
  // dos vías que CargasPage.jsx/EntregasPage.jsx: Web Bluetooth en navegador
  // móvil → diálogo de impresión del sistema (@media print) en escritorio.
  const dispararImpresionVenta = (venta) => {
    setVentaParaImprimir(venta)
    setTimeout(() => {
      if (esNavegadorMovilConWebBluetooth()) {
        imprimirVentaWebBluetooth(venta)
      } else {
        window.print()
      }
    }, 150)
  }

  const imprimirVentaWebBluetooth = async (venta) => {
    try {
      const buffer = await construirBufferTicketVentaProductos(venta, {
        branding, nombreEmpresa: nombre_empresa, direccion, telefono, paperWidth: 32,
      })
      const conexion = await conectarImpresoraWebBluetooth()
      await enviarBufferWebBluetooth(conexion, buffer)
      toast('Impresión enviada correctamente', 'success')
    } catch (err) {
      if (err?.name !== 'NotFoundError') { // el usuario cerró el picker sin elegir nada
        toast('Error al imprimir: ' + (err?.message || String(err)), 'error')
      }
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
  const puedeCobrar = (venta) => !venta.cancelada && venta.metodoPago === 'CREDITO'
    && Number(venta.total) - Number(venta.montoCobrado || 0) > 0

  const abrirModalPago = (venta) => {
    const saldo = Number(venta.total) - Number(venta.montoCobrado || 0)
    setFormPago({ monto: saldo, metodoPago: 'EFECTIVO', observacion: '' })
    setModalPago(venta)
  }

  const confirmarPago = async (e) => {
    e?.preventDefault?.()
    setGuardandoPago(true)
    try {
      const r = await api.post(`/venta-productos/${modalPago.id}/pagar`, {
        monto: Number(formPago.monto),
        metodoPago: formPago.metodoPago,
        observacion: formPago.observacion || null,
      })
      setVentas(prev => prev.map(v => v.id === r.data.venta.id ? r.data.venta : v))
      if (detalleVenta?.id === r.data.venta.id) setDetalleVenta(r.data.venta)
      toast('Cobro registrado correctamente', 'success')
      setModalPago(null)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al registrar el cobro', 'error')
    } finally {
      setGuardandoPago(false)
    }
  }

  const abrirModalVencimiento = (venta) => {
    setFormVencimiento(venta.fechaVencimiento ? venta.fechaVencimiento.slice(0, 10) : '')
    setModalVencimiento(venta)
  }

  const confirmarVencimiento = async (e) => {
    e?.preventDefault?.()
    setGuardandoVencimiento(true)
    try {
      const r = await api.patch(`/venta-productos/${modalVencimiento.id}/vencimiento`, {
        fechaVencimiento: formVencimiento || null,
      })
      setVentas(prev => prev.map(v => v.id === r.data.id ? r.data : v))
      if (detalleVenta?.id === r.data.id) setDetalleVenta(r.data)
      toast('Vencimiento actualizado', 'success')
      setModalVencimiento(null)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al actualizar el vencimiento', 'error')
    } finally {
      setGuardandoVencimiento(false)
    }
  }

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
                      onClick={() => { setMetodoPago(m.value); if (m.value !== 'CREDITO') setFechaVencimiento('') }}
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

              {metodoPago === 'CREDITO' && (
                <div>
                  <label className="form-label">Fecha de vencimiento (opcional)</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="date"
                      min={hoyLocalStr()}
                      value={fechaVencimiento}
                      onChange={e => setFechaVencimiento(e.target.value)}
                      style={{ flex: 1, minWidth: 140 }}
                    />
                    {[[7, '7 días'], [15, '15 días'], [30, '30 días']].map(([dias, label]) => (
                      <button key={dias} type="button" className="btn btn-sm" onClick={() => setFechaVencimiento(sumarDiasStr(dias))}>
                        {label}
                      </button>
                    ))}
                    {fechaVencimiento && (
                      <button type="button" className="btn btn-sm" onClick={() => setFechaVencimiento('')}>
                        Sin fecha
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">Cliente (opcional)</label>
                <ClienteAutocomplete value={clienteVenta} onChange={setClienteVenta} placeholder="Sin cliente / Venta anónima — buscar por nombre o RUC/CI..." />
              </div>

              <div>
                <label className="form-label">Observaciones</label>
                <textarea rows={2} value={observaciones} onChange={e => setObservaciones(e.target.value)} />
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total</span>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{fmtGs(total)}</span>
              </div>

              <button className="btn btn-primary" disabled={submitting} onClick={intentarRegistrarVenta}>
                {submitting ? 'Registrando...' : <><i className="ti ti-check" /> Registrar Venta</>}
              </button>

              {ventaRegistrada && (
                <button className="btn" onClick={() => dispararImpresionVenta(ventaRegistrada)} style={{ justifyContent: 'center' }}>
                  <i className="ti ti-printer" /> Imprimir Ticket (Venta {ventaRegistrada.numero})
                </button>
              )}
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
                              background: METODO_PAGO_INFO[v.metodoPago].bg,
                              color: METODO_PAGO_INFO[v.metodoPago].color,
                            }}>
                              {metodoPagoLabel(v.metodoPago)}
                            </span>
                          </td>
                          <td>{v.detalles?.length ?? 0}</td>
                          <td style={{ fontWeight: 600 }}>{fmtGs(v.total)}</td>
                          <td>
                            {v.cancelada ? (
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'var(--red-light)', color: 'var(--red)' }}>
                                Cancelada
                              </span>
                            ) : v.metodoPago === 'CREDITO' && <CreditoEstadoBadge venta={v} />}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn-icon" title="Ver detalle" onClick={() => setDetalleVenta(v)}>
                                <i className="ti ti-eye" />
                              </button>
                              {puedeCobrar(v) && (
                                <button className="btn-icon" title="Registrar cobro" onClick={() => abrirModalPago(v)}>
                                  <i className="ti ti-cash" style={{ color: 'var(--green)' }} />
                                </button>
                              )}
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
                        {v.cancelada ? (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'var(--red-light)', color: 'var(--red)' }}>
                            Cancelada
                          </span>
                        ) : v.metodoPago === 'CREDITO' && <CreditoEstadoBadge venta={v} />}
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
                          <span className="list-card-value">{metodoPagoLabel(v.metodoPago)}</span>
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
                        {puedeCobrar(v) && (
                          <button className="btn btn-sm" onClick={() => abrirModalPago(v)}>
                            <i className="ti ti-cash" style={{ color: 'var(--green)' }} /> Cobrar
                          </button>
                        )}
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

      <Confirm
        open={confirmVentaOpen}
        title="¿Confirmar registro de venta?"
        message={`Se va a registrar la venta por un total de ${fmtGs(total)}. Revisá el carrito antes de confirmar.`}
        onConfirm={confirmarVenta}
        onCancel={() => setConfirmVentaOpen(false)}
      />

      {/* Modal de registrar cobro de una venta a crédito */}
      <Modal
        open={!!modalPago}
        title={`Registrar cobro — Venta ${modalPago?.numero || ''}`}
        onClose={() => setModalPago(null)}
        footer={
          <>
            <button className="btn" onClick={() => setModalPago(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmarPago} disabled={guardandoPago}>
              {guardandoPago ? 'Guardando...' : 'Confirmar cobro'}
            </button>
          </>
        }
      >
        {modalPago && (
          <form onSubmit={confirmarPago} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Total de la venta: <strong>{fmtGs(modalPago.total)}</strong> — ya cobrado: <strong>{fmtGs(modalPago.montoCobrado)}</strong>
            </div>
            <FormGroup label="Monto a cobrar (Gs)" required>
              <input
                type="number" min="1" max={Number(modalPago.total) - Number(modalPago.montoCobrado)}
                value={formPago.monto}
                onChange={e => setFormPago(f => ({ ...f, monto: e.target.value }))}
                required
              />
            </FormGroup>
            <FormGroup label="Forma de pago" required>
              <select value={formPago.metodoPago} onChange={e => setFormPago(f => ({ ...f, metodoPago: e.target.value }))} required>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
            </FormGroup>
            <FormGroup label="Observación (opcional)">
              <textarea rows={2} value={formPago.observacion} onChange={e => setFormPago(f => ({ ...f, observacion: e.target.value }))} />
            </FormGroup>
          </form>
        )}
      </Modal>

      {/* Modal de editar fecha de vencimiento de una venta a crédito */}
      <Modal
        open={!!modalVencimiento}
        title={`Editar vencimiento — Venta ${modalVencimiento?.numero || ''}`}
        onClose={() => setModalVencimiento(null)}
        footer={
          <>
            <button className="btn" onClick={() => setModalVencimiento(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmarVencimiento} disabled={guardandoVencimiento}>
              {guardandoVencimiento ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        {modalVencimiento && (
          <form onSubmit={confirmarVencimiento} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FormGroup label="Fecha de vencimiento">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="date"
                  min={hoyLocalStr()}
                  value={formVencimiento}
                  onChange={e => setFormVencimiento(e.target.value)}
                  style={{ flex: 1, minWidth: 140 }}
                />
                {formVencimiento && (
                  <button type="button" className="btn btn-sm" onClick={() => setFormVencimiento('')}>
                    Quitar vencimiento
                  </button>
                )}
              </div>
            </FormGroup>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              El cambio queda registrado en la auditoría.
            </div>
          </form>
        )}
      </Modal>

      {detalleVenta && (
        <Modal
          open={true}
          title={`Venta ${detalleVenta.numero}`}
          onClose={() => setDetalleVenta(null)}
          width={560}
          footer={
            <>
              {puedeCobrar(detalleVenta) && (
                <button className="btn btn-primary" onClick={() => abrirModalPago(detalleVenta)}>
                  <i className="ti ti-cash" /> Registrar cobro
                </button>
              )}
              <button className="btn" onClick={() => dispararImpresionVenta(detalleVenta)}>
                <i className="ti ti-printer" /> Imprimir Ticket
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Cliente</span>
              <span style={{ fontWeight: 500 }}>{detalleVenta.cliente?.nombre || 'Sin cliente'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Forma de pago</span>
              <span style={{ fontWeight: 500 }}>{metodoPagoLabel(detalleVenta.metodoPago)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Registrada por</span>
              <span style={{ fontWeight: 500 }}>{detalleVenta.usuario?.nombre || '—'}</span>
            </div>

            {detalleVenta.metodoPago === 'CREDITO' && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 10, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Cobrado</span>
                  <span style={{ fontWeight: 600 }}>{fmtGs(detalleVenta.montoCobrado)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Saldo pendiente</span>
                  <span style={{ fontWeight: 700, color: Number(detalleVenta.total) - Number(detalleVenta.montoCobrado) > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {fmtGs(Number(detalleVenta.total) - Number(detalleVenta.montoCobrado))}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Vencimiento</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, color: estaVencida(detalleVenta) ? 'var(--red)' : 'inherit' }}>
                      {detalleVenta.fechaVencimiento ? fmtVencimiento(detalleVenta.fechaVencimiento) : 'Sin fecha'}
                      {estaVencida(detalleVenta) && ' (vencida)'}
                    </span>
                    {puedeCobrar(detalleVenta) && (
                      <button className="btn-icon" title="Editar vencimiento" onClick={() => abrirModalVencimiento(detalleVenta)}>
                        <i className="ti ti-pencil" />
                      </button>
                    )}
                  </span>
                </div>
                {detalleVenta.pagos?.length > 0 && (
                  <div className="table-wrap" style={{ marginTop: 4 }}>
                    <table>
                      <thead><tr><th>Fecha</th><th>Forma</th><th>Monto</th></tr></thead>
                      <tbody>
                        {detalleVenta.pagos.map(p => (
                          <tr key={p.id}>
                            <td>{new Date(p.fechaPago).toLocaleString('es-PY')}</td>
                            <td>{metodoPagoLabel(p.metodoPago)}</td>
                            <td>{fmtGs(p.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

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

      {/* Ticket de venta: solo visible al imprimir (window.print) */}
      {ventaParaImprimir && createPortal(
        <div className="print-ticket-container">
          <div className="ticket-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 15, marginBottom: 10 }}>
              <img src={branding.isotipoSrc} alt="Isotipo" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              <img src={branding.logoSrc} alt="Logo" style={{ width: 108, height: 40, objectFit: 'contain' }} />
            </div>
            {direccion && <p style={{ margin: 0, fontSize: 10 }}>{direccion}</p>}
            {telefono && <p style={{ margin: '2px 0 0', fontSize: 10 }}>Tel: {telefono}</p>}
            <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 'bold' }}>VENTA: {ventaParaImprimir.numero}</p>
          </div>

          <div style={{ margin: '8px 0', fontSize: 11 }}>
            <strong>Cliente:</strong> {ventaParaImprimir.cliente?.nombre || 'Sin cliente'}<br />
            {ventaParaImprimir.cliente && <>
              <strong>RUC/CI:</strong> {ventaParaImprimir.cliente?.ruc || '—'}<br />
            </>}
            <strong>Fecha:</strong> {new Date(ventaParaImprimir.fechaVenta).toLocaleString('es-PY')}<br />
            <strong>Vendedor:</strong> {ventaParaImprimir.usuario?.nombre || '—'}<br />
            <strong>Forma de pago:</strong> {metodoPagoLabel(ventaParaImprimir.metodoPago)}
            {ventaParaImprimir.metodoPago === 'CREDITO' && ventaParaImprimir.fechaVencimiento && (
              <><br /><strong>Vence:</strong> {fmtVencimiento(ventaParaImprimir.fechaVencimiento)}</>
            )}
          </div>

          <table className="ticket-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Producto</th>
                <th style={{ textAlign: 'center' }}>Cant.</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {ventaParaImprimir.detalles?.map(d => (
                <tr key={d.id}>
                  <td>
                    {d.descripcion}
                    {!d.productoId && <span style={{ fontSize: 9, color: '#555', display: 'block' }}>(ítem libre)</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {Number(d.cantidad)}<br />
                    <span style={{ fontSize: 9, color: '#888' }}>x {Number(d.precioUnitario).toLocaleString('es-PY')}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>
                    {Number(d.subtotal).toLocaleString('es-PY')} GS
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 12 }}>TOTAL:</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 12, color: 'var(--blue)' }}>
                  {Number(ventaParaImprimir.total).toLocaleString('es-PY')} GS
                </td>
              </tr>
            </tbody>
          </table>

          {ventaParaImprimir.observaciones && (
            <div style={{ margin: '8px 0', fontSize: 10, fontStyle: 'italic', borderTop: '1px dashed #000', paddingTop: 4 }}>
              <strong>Obs:</strong> {ventaParaImprimir.observaciones}
            </div>
          )}

          <div className="ticket-footer">
            ¡Gracias por su preferencia!
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
