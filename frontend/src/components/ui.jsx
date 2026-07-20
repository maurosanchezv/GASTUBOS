// gastubos/frontend/src/components/ui.jsx
// Componentes reutilizables usados en todas las páginas

const ESTADO_DESCRIPCIONES = {
  DISPONIBLE:  'Envase metálico vacío en depósito, listo para ser recargado, alquilado o vendido.',
  CARGADO:     'Cilindro lleno de gas en depósito, listo para su distribución o entrega.',
  VACIO:       'Cilindro consumido en depósito, esperando ser enviado a recargar en planta.',
  ENTREGADO:   'Cilindro entregado al cliente (bajo flujo de canje/intercambio).',
  ALQUILADO:   'Cilindro prestado al cliente bajo contrato de alquiler activo.',
  VENDIDO:     'El envase metálico fue comprado físicamente por el cliente.',
  RESERVADO:   'Cilindro cargado en el camión de reparto, en tránsito hacia el cliente.',
  PERDIDO:     'Cilindro reportado como extraviado. Debe pasar a revisión si se recupera.',
  DEVUELTO:    'Cilindro retornado por el cliente, en espera de ser verificado.',
  EN_REVISION: 'Cilindro en taller bajo pruebas hidráulicas o inspección de seguridad.',
  DE_BAJA:     'Cilindro fuera de servicio por baja, descarte o retiro definitivo.',
}

// ── Badge de estado ────────────────────────────────────────────
export function StateBadge({ estado }) {
  if (!estado) return null
  const label = estado.replace('_', ' ')
  const desc = ESTADO_DESCRIPCIONES[estado] || ''
  return (
    <span 
      className={`badge badge-${estado}`} 
      title={desc}
      style={{ cursor: desc ? 'help' : 'default' }}
    >
      {label}
    </span>
  )
}

// ── Badge de rol ───────────────────────────────────────────────
export function RolBadge({ rol }) {
  return <span className={`badge badge-${rol}`}>{rol}</span>
}

// ── Badge tipo cliente ─────────────────────────────────────────
export function TipoBadge({ tipo }) {
  return <span className={`badge badge-${tipo}`}>{tipo}</span>
}

// ── Spinner centrado ───────────────────────────────────────────
export function Spinner({ size = 20 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
      <div className="spinner" style={{ width: size, height: size }} />
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────
export function EmptyState({ icon = 'ti-inbox', message = 'Sin resultados' }) {
  return (
    <div className="empty-state">
      <i className={`ti ${icon}`} />
      <p>{message}</p>
    </div>
  )
}

// ── Modal genérico ─────────────────────────────────────────────
export function Modal({ open, title, onClose, children, footer, width = 540 }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: '100%', maxWidth: width }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn-icon" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// ── Confirm dialog ─────────────────────────────────────────────
export function Confirm({ open, title, message, onConfirm, onCancel, danger = false }) {
  if (!open) return null
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 380 }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn-icon" onClick={onCancel}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>Cancelar</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page header ────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="app-topbar">
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  )
}

// ── Form group helper ──────────────────────────────────────────
export function FormGroup({ label, required, hint, error, children }) {
  return (
    <div className="form-group">
      {label && (
        <label className="form-label">
          {label}{required && <span className="form-required"> *</span>}
        </label>
      )}
      {children}
      {hint  && <span className="form-hint">{hint}</span>}
      {error && <span className="form-error">{error}</span>}
    </div>
  )
}

// ── Gas color dot ──────────────────────────────────────────────
const GAS_COLORS = {
  CO2: '#1A5FA8', 'CO₂': '#1A5FA8',
  Oxígeno: '#00695C', Argón: '#5B21B6',
  Nitrógeno: '#52525B', Acetileno: '#B45309',
}
export function GasDot({ gas }) {
  let color = '#9A3412'
  for (const k in GAS_COLORS) if (gas?.includes(k)) { color = GAS_COLORS[k]; break }
  return <span className="gas-dot" style={{ background: color }} />
}

// ── Format capacity helper ─────────────────────────────────────
export function formatCapacidad(tubo) {
  if (!tubo) return '—'
  const gas = (tubo.gas || '').toLowerCase()
  if (gas.includes('co2') || gas.includes('acetileno')) {
    const val = tubo.capacidadKg !== undefined && tubo.capacidadKg !== null ? tubo.capacidadKg : (tubo.capacidadLitros || 0)
    return `${Number(val)} kg`
  }
  const val = tubo.capacidadLitros !== undefined && tubo.capacidadLitros !== null ? tubo.capacidadLitros : (tubo.capacidadKg || 0)
  return `${Number(val)} m³`
}

// ── Toast notification ─────────────────────────────────────────
import { useState, useEffect } from 'react'

let _showToast = null
export function useToast() {
  return { toast: (msg, type = 'info') => _showToast?.(msg, type) }
}

export function ToastProvider() {
  const [toasts, setToasts] = useState([])
  const [errorModalMsg, setErrorModalMsg] = useState(null)

  useEffect(() => {
    _showToast = (msg, type) => {
      let cleanMsg = ''
      if (!msg) {
        cleanMsg = 'Error desconocido'
      } else if (typeof msg === 'string') {
        cleanMsg = msg
      } else if (Array.isArray(msg)) {
        cleanMsg = msg.map(err => {
          const path = err.path ? `Campo "${err.path.join('.')}"` : ''
          return `${path ? path + ': ' : ''}${err.message}`
        }).join('\n')
      } else if (typeof msg === 'object') {
        cleanMsg = msg.message || msg.error || JSON.stringify(msg)
      } else {
        cleanMsg = String(msg)
      }

      if (type === 'error') {
        // Para errores: abrir modal Pop-Up persistente en el centro
        setErrorModalMsg(cleanMsg)
      } else {
        // Para éxito o información: mostrar toast flotante por 3.5 segundos
        const id = Date.now()
        setToasts(t => [...t, { id, msg: cleanMsg, type }])
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
      }
    }
  }, [])

  return (
    <>
      {/* Pop-Up Modal de Error */}
      {errorModalMsg && (
        <div 
          className="modal-overlay" 
          style={{ zIndex: 10000, background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(2px)' }}
          onClick={() => setErrorModalMsg(null)}
        >
          <div 
            className="modal" 
            style={{ width: '100%', maxWidth: 440, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header" style={{ background: 'var(--red)', color: '#fff', padding: '14px 20px' }}>
              <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: 15, fontWeight: 700 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 20 }} /> Ocurrió un Error
              </span>
              <button className="btn-icon" onClick={() => setErrorModalMsg(null)} style={{ color: '#fff', opacity: 0.9 }}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px 24px', fontSize: 14, lineHeight: '1.5', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
              {errorModalMsg}
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px', background: 'var(--surface-1)', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => setErrorModalMsg(null)}
                style={{ minWidth: 100, fontWeight: 600 }}
                autoFocus
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts flotantes para información / éxito */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === 'success' ? 'var(--green)' : 'var(--blue-dark)',
            color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,.2)', maxWidth: 360,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            animation: 'slideUp .2s ease',
          }}>
            <span>{t.msg}</span>
            <button 
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.8, padding: 0 }}
            >
              <i className="ti ti-x" />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
