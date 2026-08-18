// gastubos/frontend/src/components/ClienteAutocomplete.jsx
// Buscador de cliente por nombre o RUC/CI (GET /api/clientes?q=), reemplaza el patrón de
// <select> con todos los clientes cargados de una vez. Extraído del modal "Vender gas" de
// RepartoPage.jsx para reusarlo en todos los formularios que seleccionan un cliente.
import { useState } from 'react'
import api from '../services/api.js'

export default function ClienteAutocomplete({ value, onChange, placeholder = 'Buscar por nombre o RUC/CI...', disabled = false }) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)

  const buscar = async (q) => {
    setQuery(q)
    if (!q || q.trim().length < 2) {
      setResultados([])
      return
    }
    setBuscando(true)
    try {
      const res = await api.get('/clientes', { params: { q: q.trim() } })
      setResultados(res.data || [])
    } catch {
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }

  const seleccionar = (cliente) => {
    onChange(cliente)
    setQuery('')
    setResultados([])
  }

  const limpiar = () => {
    onChange(null)
    setQuery('')
    setResultados([])
  }

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{value.nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{value.ruc || 'Sin RUC/CI'}</div>
        </div>
        {!disabled && (
          <button type="button" className="btn btn-sm" onClick={limpiar}>Cambiar</button>
        )}
      </div>
    )
  }

  return (
    <div>
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={e => buscar(e.target.value)}
        disabled={disabled}
        style={{ width: '100%', height: 40 }}
      />
      {resultados.length > 0 && (
        <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          {resultados.map(c => (
            <div
              key={c.id}
              onClick={() => seleccionar(c)}
              style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}
            >
              <div style={{ fontSize: 13 }}>{c.nombre}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.ruc || 'Sin RUC/CI'}</div>
            </div>
          ))}
        </div>
      )}
      {!buscando && query.trim().length >= 2 && resultados.length === 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Sin resultados</div>
      )}
    </div>
  )
}
