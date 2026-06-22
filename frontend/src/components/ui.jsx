// gastubos/frontend/src/components/ui.jsx
// Componentes reutilizables usados en todas las páginas

// ── Badge de estado ────────────────────────────────────────────
export function StateBadge({ estado }) {
  if (!estado) return null
  const label = estado.replace('_', ' ')
  return <span className={`badge badge-${estado}`}>{label}</span>
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

// ── Toast notification ─────────────────────────────────────────
import { useState, useEffect } from 'react'

let _showToast = null
export function useToast() {
  return { toast: (msg, type = 'info') => _showToast?.(msg, type) }
}

export function ToastProvider() {
  const [toasts, setToasts] = useState([])
  useEffect(() => {
    _showToast = (msg, type) => {
      const id = Date.now()
      let cleanMsg = ''
      if (!msg) {
        cleanMsg = 'Error desconocido'
      } else if (typeof msg === 'string') {
        cleanMsg = msg
      } else if (Array.isArray(msg)) {
        cleanMsg = msg.map(err => {
          const path = err.path ? `Campo "${err.path.join('.')}"` : ''
          return `${path ? path + ': ' : ''}${err.message}`
        }).join(' | ')
      } else if (typeof msg === 'object') {
        cleanMsg = msg.message || msg.error || JSON.stringify(msg)
      } else {
        cleanMsg = String(msg)
      }
      setToasts(t => [...t, { id, msg: cleanMsg, type }])
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, z: 999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? 'var(--red)' : t.type === 'success' ? 'var(--green)' : 'var(--blue-dark)',
          color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,.2)', maxWidth: 320,
          animation: 'slideUp .2s ease',
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
