// gastubos/frontend/src/components/TuboChip.jsx
//
// Tarjeta de tubo con cantidad/precio/subtotal, usada al armar la lista de
// tubos de una entrega. Compartida entre EntregasPage.jsx (Nueva Entrega) y
// EntregaSalonTab.jsx (Entrega en Salón).
import { useState, useEffect } from 'react'
import api from '../services/api.js'
import { GasDot, StateBadge } from './ui.jsx'

export default function TuboChip({ tuboId, detail, onChange, onRemove }) {
  const [tubo, setTubo] = useState(null)
  useEffect(() => {
    api.get(`/tubos/${tuboId}`).then(r => setTubo(r.data)).catch(() => {})
  }, [tuboId])

  const esPrecioEditable = tubo?.estado === 'DISPONIBLE'
  const cant = Number(detail?.cantidadGas || 0)
  const prec = Number(detail?.precioUnitario || 0)
  const subtotal = cant > 0 ? (cant * prec) : prec

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '12px 14px',
      background: 'var(--surface-2)',
      borderRadius: 8,
      marginBottom: 8,
      fontSize: 12,
      border: '1px solid var(--border)',
      boxSizing: 'border-box',
      width: '100%',
      overflow: 'hidden'
    }}>
      {/* Encabezado: ID + Gas + Estado + Botón Quitar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
          {tubo && <GasDot gas={tubo.gas} />}
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--blue)', fontSize: 13 }}>{tuboId}</span>
          {tubo && (
            <>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{tubo.gas}</span>
              <StateBadge estado={tubo.estado} />
              {tubo.camion && (
                <span className="badge badge-orange" style={{ fontWeight: 500 }} title={`En camión ${tubo.camion.placa}`}>
                  🚚 {tubo.camion.placa}
                </span>
              )}
            </>
          )}
        </div>
        <button type="button" className="btn-icon" onClick={() => onRemove(tuboId)} title="Quitar tubo" style={{ flexShrink: 0 }}>
          <i className="ti ti-x" />
        </button>
      </div>

      {/* Fila Inferior: Cantidad, Unidad, Precio y Subtotal en Flex Responsive */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        paddingTop: 8,
        borderTop: '1px dashed var(--border)',
      }}>
        {/* Cantidad + Unidad */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>CANT:</label>
          <input
            type="number"
            value={detail?.cantidadGas ?? ''}
            disabled
            title="Cantidad fija según la carga o capacidad del tubo"
            style={{
              width: 65,
              minHeight: 30,
              padding: '2px 6px',
              fontSize: 12,
              cursor: 'not-allowed',
              opacity: 0.75,
              background: 'var(--surface-3, #f5f5f5)',
              textAlign: 'center'
            }}
          />
          <select
            value={detail?.unidadGas ?? 'KG'}
            disabled
            title="Unidad predeterminada según el tipo de gas"
            style={{
              width: 58,
              minHeight: 30,
              padding: '2px 4px',
              fontSize: 12,
              cursor: 'not-allowed',
              opacity: 0.75,
              background: 'var(--surface-3, #f5f5f5)'
            }}
          >
            <option value="KG">KG</option>
            <option value="M3">M³</option>
          </select>
        </div>

        {/* Precio Unitario */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>PRECIO (Gs):</label>
          <input
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={detail?.precioUnitario ?? ''}
            onChange={e => onChange(tuboId, 'precioUnitario', e.target.value)}
            disabled={!esPrecioEditable}
            title={!esPrecioEditable ? `Precio fijo precalculado para tubo ${tubo?.estado}` : 'Precio unitario editable'}
            style={{
              width: 90,
              minHeight: 30,
              padding: '2px 6px',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              cursor: !esPrecioEditable ? 'not-allowed' : 'text',
              opacity: !esPrecioEditable ? 0.75 : 1,
              background: !esPrecioEditable ? 'var(--surface-3, #f5f5f5)' : undefined,
            }}
          />
        </div>

        {/* Subtotal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>SUBTOTAL:</span>
          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--blue)' }}>
            {subtotal.toLocaleString('es-PY')} Gs
          </span>
        </div>
      </div>
    </div>
  )
}
