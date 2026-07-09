// gastubos/frontend/src/pages/VentasPage.jsx
import { useState, useEffect } from 'react'
import api from '../services/api.js'
import { PageHeader, Spinner, EmptyState, GasDot } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

export default function VentasPage() {
  const [ventas,   setVentas]   = useState([])
  const [clientes, setClientes] = useState([])
  const [tubos,    setTubos]    = useState([])
  const [loading, setLoading]   = useState(true)
  const [form, setForm]         = useState({ tuboId: '', clienteId: '', referencia: '', observaciones: '' })
  const [saving, setSaving]     = useState(false)
  const { toast }               = useToast()

  useEffect(() => {
    Promise.all([
      api.get('/ventas'),
      api.get('/clientes'),
      api.get('/tubos', { params: { estado: 'DISPONIBLE', limit: 100 } }),
    ]).then(([v, c, t]) => { 
      setVentas(v.data); 
      setClientes(c.data); 
      setTubos(t.data.tubos.filter(x => !x.id.startsWith('CLI_') && !x.id.startsWith('CLI-'))) 
    })
    .catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await api.post('/ventas', form)
      toast('Venta registrada', 'success')
      setForm({ tuboId: '', clienteId: '', referencia: '', observaciones: '' })
      const [v, t] = await Promise.all([api.get('/ventas'), api.get('/tubos', { params: { estado: 'DISPONIBLE', limit: 100 } })])
      setVentas(v.data); 
      setTubos(t.data.tubos.filter(x => !x.id.startsWith('CLI_') && !x.id.startsWith('CLI-')))
    } catch (err) { toast(err.response?.data?.error || 'Error', 'error') }
    finally { setSaving(false) }
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <>
      <PageHeader title="Ventas Internas" subtitle="Registrar tubos vendidos" />
      <div className="app-content">
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Registrar venta</div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Tubo <span className="form-required">*</span></label>
                <select value={form.tuboId} onChange={f('tuboId')} required>
                  <option value="">Seleccionar tubo...</option>
                  {tubos.map(t => <option key={t.id} value={t.id}>{t.id} — {t.gas} {t.capacidadLitros}L</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Cliente comprador <span className="form-required">*</span></label>
                <select value={form.clienteId} onChange={f('clienteId')} required>
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Referencia (factura, orden)</label>
                <input value={form.referencia} onChange={f('referencia')} placeholder="FAC-001" />
              </div>
              <div className="form-group">
                <label className="form-label">Observaciones</label>
                <textarea value={form.observaciones} onChange={f('observaciones')} style={{ height: 56 }} />
              </div>
              <div className="alert alert-info" style={{ fontSize: 11 }}>
                <i className="ti ti-info-circle" />
                Al guardar el estado del tubo pasará a VENDIDO.
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : <><i className="ti ti-check" /> Registrar venta</>}
              </button>
            </form>
          </div>
          <div>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '14px 20px 10px', fontWeight: 600, fontSize: 14 }}>Ventas registradas</div>
              {loading ? <Spinner /> : ventas.length === 0 ? <EmptyState icon="ti-shopping-cart" message="Sin ventas registradas" /> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Nro</th><th>Tubo</th><th>Cliente</th><th>Referencia</th><th>Fecha</th></tr></thead>
                    <tbody>
                      {ventas.map(v => (
                        <tr key={v.id} style={v.cancelada ? { opacity: 0.6, textDecoration: 'line-through' } : {}}>
                          <td className="td-code">{v.numero}</td>
                          <td className="td-code">{v.tubo?.id}</td>
                          <td>
                            {v.cliente?.nombre}
                            {v.cancelada && <span className="badge badge-danger" style={{ marginLeft: 6, textDecoration: 'none', display: 'inline-block', fontSize: '9px', padding: '2px 4px', background: 'var(--red)', color: '#fff', borderRadius: '4px' }}>CANCELADA</span>}
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{v.referencia || '—'}</td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{new Date(v.fechaVenta).toLocaleDateString('es-PY')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
