// gastubos/frontend/src/components/ProductoSelectorModal.jsx
//
// Modal reutilizable para agregar productos de catálogo (accesorios, no
// cilindros) a una Entrega. Reusado igual en EntregasPage.jsx (Nueva Entrega)
// y EntregaSalonTab.jsx (Entrega en Salón). Solo devuelve la selección al
// padre vía onConfirm — no llama ninguna API de venta, la VentaProducto real
// se crea server-side dentro de POST /entregas.
import { useState, useEffect, useMemo } from 'react'
import api from '../services/api.js'
import { Modal } from './ui.jsx'

let keySeq = 0

export default function ProductoSelectorModal({ open, onClose, itemsIniciales = [], onConfirm }) {
  const [productos, setProductos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState([])

  // Precarga el catálogo una vez (es chico, no hace falta debounce contra la
  // API) y el carrito con lo ya elegido, cada vez que se reabre el modal.
  useEffect(() => {
    if (!open) return
    api.get('/productos', { params: { activo: true } }).then(r => setProductos(r.data)).catch(() => {})
    setCarrito(itemsIniciales.map(i => ({ ...i, key: ++keySeq })))
    setBusqueda('')
  }, [open])

  const resultadosBusqueda = useMemo(() => {
    if (!busqueda.trim()) return []
    const q = busqueda.trim().toLowerCase()
    return productos.filter(p => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)).slice(0, 15)
  }, [busqueda, productos])

  const total = useMemo(
    () => carrito.reduce((acc, l) => acc + (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0), 0),
    [carrito]
  )

  function agregarProducto(p) {
    setCarrito(prev => {
      const existente = prev.find(l => l.productoId === p.id)
      if (existente) {
        return prev.map(l => l.productoId === p.id ? { ...l, cantidad: Number(l.cantidad) + 1 } : l)
      }
      return [...prev, {
        key: ++keySeq,
        productoId: p.id,
        descripcion: p.nombre,
        cantidad: 1,
        precioUnitario: Number(p.precio),
      }]
    })
    setBusqueda('')
  }

  function actualizarCantidad(key, cantidad) {
    setCarrito(prev => prev.map(l => l.key === key ? { ...l, cantidad: cantidad === '' ? '' : Number(cantidad) } : l))
  }

  function quitarLinea(key) {
    setCarrito(prev => prev.filter(l => l.key !== key))
  }

  function confirmar() {
    const items = carrito
      .filter(l => Number(l.cantidad) > 0)
      .map(({ productoId, descripcion, cantidad, precioUnitario }) => ({ productoId, descripcion, cantidad: Number(cantidad), precioUnitario: Number(precioUnitario) }))
    onConfirm(items)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agregar productos"
      width={480}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar}>
            Agregar ({carrito.filter(l => Number(l.cantidad) > 0).length}) · Gs {Math.round(total).toLocaleString('es-PY')}
          </button>
        </>
      }
    >
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <div className="search-bar" style={{ marginBottom: 0 }}>
          <i className="ti ti-search" />
          <input
            placeholder="Buscar producto por nombre o código…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setBusqueda('') }}
          />
        </div>

        {busqueda.trim() && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.10)',
            zIndex: 200, maxHeight: 260, overflowY: 'auto',
          }}>
            {resultadosBusqueda.length === 0 ? (
              <div style={{ padding: '14px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                Sin resultados para «{busqueda}»
              </div>
            ) : resultadosBusqueda.map((p, i) => (
              <div key={p.id}
                onClick={() => agregarProducto(p)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 12px', cursor: 'pointer',
                  borderBottom: i < resultadosBusqueda.length - 1 ? '1px solid var(--border)' : 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {p.codigo} {p.stock !== null && `· stock: ${p.stock}`}
                  </div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {Number(p.precio).toLocaleString('es-PY')} Gs
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {carrito.length === 0 ? (
        <div style={{ border: '1px dashed var(--border-mid)', borderRadius: 8,
          padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          Buscá un producto arriba para agregarlo
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {carrito.map(l => (
            <div key={l.key} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8,
              border: '1px solid var(--border)', fontSize: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.descripcion}</div>
              <input
                type="number" min="0" step="1"
                value={l.cantidad}
                onChange={e => actualizarCantidad(l.key, e.target.value)}
                style={{ width: 55, minHeight: 30, padding: '2px 6px', fontSize: 12, textAlign: 'center' }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, width: 90, textAlign: 'right' }}>
                {Math.round((Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0)).toLocaleString('es-PY')} Gs
              </span>
              <button type="button" className="btn-icon" onClick={() => quitarLinea(l.key)} title="Quitar">
                <i className="ti ti-x" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
