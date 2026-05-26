// gastubos/frontend/src/pages/DevolucionesPage.jsx
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api.js'
import { PageHeader, StateBadge, GasDot } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

export default function DevolucionesPage() {
  const [tuboId,  setTuboId]  = useState('')
  const [tubo,    setTubo]    = useState(null)
  const [estado,  setEstado]  = useState('DEVUELTO')
  const [obs,     setObs]     = useState('')
  const [saving,  setSaving]  = useState(false)
  const [pendientes, setPendientes] = useState([])
  const [params]  = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    api.get('/tubos', { params: { estado: 'ENTREGADO', limit: 50 } }).then(r => setPendientes(r.data.tubos)).catch(() => {})
    api.get('/tubos', { params: { estado: 'ALQUILADO', limit: 50 } }).then(r => setPendientes(p => [...p, ...r.data.tubos])).catch(() => {})
    if (params.get('tubo')) { setTuboId(params.get('tubo')); buscarPorId(params.get('tubo')) }
  }, [])

  async function buscarPorId(id) {
    try {
      const r = await api.get(`/tubos/${id.trim().toUpperCase()}`)
      setTubo(r.data)
      setTuboId(r.data.id)
    } catch { toast('Tubo no encontrado', 'error'); setTubo(null) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!tubo) return toast('Buscá un tubo primero', 'error')
    setSaving(true)
    try {
      await api.post('/devoluciones', { tuboId: tubo.id, estadoDestino: estado, observaciones: obs })
      toast('Devolución registrada correctamente', 'success')
      setTubo(null); setTuboId(''); setObs('')
      const r = await api.get('/tubos', { params: { estado: 'ENTREGADO', limit: 50 } })
      setPendientes(r.data.tubos)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al registrar devolución', 'error')
    } finally { setSaving(false) }
  }

  return (
    <>
      <PageHeader title="Devoluciones" subtitle="Registrar retorno de tubos de clientes" />
      <div className="app-content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
          <form onSubmit={handleSubmit}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Registrar devolución</div>
              <div className="alert alert-info">
                <i className="ti ti-scan" />
                Escaneá el QR del tubo o ingresá el código manualmente.
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  style={{ flex: 1 }}
                  placeholder="TUBO-000001"
                  value={tuboId}
                  onChange={e => setTuboId(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscarPorId(tuboId))}
                />
                <button type="button" className="btn" onClick={() => buscarPorId(tuboId)}>
                  <i className="ti ti-search" /> Buscar
                </button>
              </div>

              {tubo && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <GasDot gas={tubo.gas} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700 }}>{tubo.id}</div>
                    <StateBadge estado={tubo.estado} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                    {[['Gas', tubo.gas],['Cap.', `${tubo.capacidadLitros}L`],['Cliente', tubo.cliente?.nombre || '—'],['Ubicación', tubo.ubicacion]].map(([k,v]) => (
                      <div key={k}><span style={{ color: 'var(--text-muted)' }}>{k}: </span><strong>{v}</strong></div>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Estado tras devolución <span className="form-required">*</span></label>
                  <select value={estado} onChange={e => setEstado(e.target.value)}>
                    <option value="DEVUELTO">Devuelto</option>
                    <option value="VACIO">Vacío</option>
                    <option value="EN_REVISION">En revisión</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de devolución</label>
                  <input type="date" defaultValue={new Date().toISOString().slice(0,10)} readOnly />
                </div>
                <div className="form-group col-span-2">
                  <label className="form-label">Observaciones</label>
                  <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Estado físico del tubo, notas..." style={{ height: 64 }} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={!tubo || saving}>
                {saving ? 'Registrando...' : <><i className="ti ti-check" /> Confirmar devolución</>}
              </button>
            </div>
          </form>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Pendientes de devolución</div>
            {pendientes.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>Sin tubos pendientes</p>
            ) : pendientes.slice(0,10).map(t => (
              <div
                key={t.id}
                style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => { setTuboId(t.id); buscarPorId(t.id) }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--blue)' }}>{t.id}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{t.cliente?.nombre}</div>
                <div style={{ marginTop: 4 }}><StateBadge estado={t.estado} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
