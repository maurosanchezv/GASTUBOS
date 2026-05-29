// gastubos/frontend/src/pages/TuboDetallePage.jsx
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useReactToPrint } from 'react-to-print'
import api from '../services/api.js'
import { PageHeader, StateBadge, Modal, FormGroup, Spinner } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'
import { TRANSICIONES } from '../utils/estadosTubo.js'

export default function TuboDetallePage() {
  const { id }       = useParams()
  const [params]     = useSearchParams()
  const navigate     = useNavigate()
  const { toast }    = useToast()
  const printRef     = useRef()

  const [tubo,    setTubo]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [cambioModal, setCambioModal] = useState(false)
  const [nuevoEstado, setNuevoEstado] = useState('')
  const [obsEstado,   setObsEstado]   = useState('')

  const tuboUrl = `${window.location.origin}/tubos/${id}`

  const handlePrint = useReactToPrint({ content: () => printRef.current })

  useEffect(() => { load() }, [id])
  useEffect(() => { if (params.get('qr') === '1') setTimeout(handlePrint, 800) }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get(`/tubos/${id}`)
      setTubo(res.data)
    } catch { toast('Tubo no encontrado', 'error'); navigate('/tubos') }
    finally { setLoading(false) }
  }

  async function handleCambioEstado() {
    if (!nuevoEstado) return
    setSaving(true)
    try {
      await api.post(`/tubos/${id}/cambiar-estado`, { estadoNuevo: nuevoEstado, observaciones: obsEstado })
      toast('Estado actualizado', 'success')
      setCambioModal(false)
      setNuevoEstado(''); setObsEstado('')
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al cambiar estado', 'error')
    } finally { setSaving(false) }
  }

  if (loading) return (
    <>
      <PageHeader title="Detalle de Tubo" />
      <div className="app-content"><Spinner /></div>
    </>
  )
  if (!tubo) return null

  const transiciones = TRANSICIONES[tubo.estado] || []

  return (
    <>
      <PageHeader
        title={tubo.id}
        subtitle={`${tubo.gas} · ${tubo.capacidadLitros}L · ${tubo.talla}`}
        actions={
          <>
            <button className="btn btn-sm" onClick={() => navigate('/tubos')}>
              <i className="ti ti-arrow-left" /> Volver
            </button>
            <button className="btn btn-sm" onClick={handlePrint}>
              <i className="ti ti-printer" /> Imprimir QR
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => setCambioModal(true)}>
              <i className="ti ti-refresh" /> Cambiar estado
            </button>
          </>
        }
      />

      <div className="app-content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
          {/* Info principal */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">Información del tubo</div>
                <StateBadge estado={tubo.estado} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  ['Código interno', tubo.id],
                  ['Número de serie', tubo.serie],
                  ['Tipo de gas', tubo.gas],
                  ['Capacidad', `${tubo.capacidadLitros}L`],
                  ['Talla', tubo.talla],
                  ['Peso', tubo.pesoKg ? `${tubo.pesoKg} kg` : '—'],
                  ['Propietario', tubo.propietario],
                  ['Fecha de compra', tubo.fechaCompra ? new Date(tubo.fechaCompra).toLocaleDateString('es-PY') : '—'],
                  ['Ubicación', tubo.ubicacion || '—'],
                  ['Cliente actual', tubo.cliente?.nombre || '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 3 }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: k === 'Código interno' ? 600 : 400, fontFamily: k === 'Código interno' || k === 'Número de serie' ? 'var(--font-mono)' : 'inherit' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Historial */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Historial de movimientos</div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tubo.auditoria?.length || 0} registros</span>
              </div>
              {tubo.auditoria?.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>Sin movimientos registrados</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Anterior</th><th>Nuevo</th><th>Obs.</th></tr>
                    </thead>
                    <tbody>
                      {tubo.auditoria?.map(a => (
                        <tr key={a.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap' }}>
                            {new Date(a.createdAt).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td>{a.accion}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{a.usuario?.username}</td>
                          <td>{a.estadoAnterior ? <StateBadge estado={a.estadoAnterior} /> : '—'}</td>
                          <td>{a.estadoNuevo    ? <StateBadge estado={a.estadoNuevo}    /> : '—'}</td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.observaciones || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar QR */}
          <div>
            <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 14 }}>Código QR</div>

              {/* Printable label */}
              <div ref={printRef} style={{ padding: 8 }}>
                <div style={{
                  border: '2px solid #000', borderRadius: 8,
                  padding: 14, display: 'inline-block',
                  fontFamily: 'var(--font-mono)',
                }}>
                  <QRCodeSVG value={tuboUrl} size={140} level="M" />
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>{tubo.id}</div>
                  <div style={{ fontSize: 10 }}>{tubo.gas} · {tubo.capacidadLitros}L</div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 14px', wordBreak: 'break-all' }}>
                {tuboUrl}
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handlePrint}>
                <i className="ti ti-printer" /> Imprimir etiqueta
              </button>
            </div>

            {/* Cambio rápido de estado */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 10 }}>Estado actual</div>
              <div style={{ marginBottom: 12 }}><StateBadge estado={tubo.estado} /></div>
              {transiciones.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Puede pasar a:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {transiciones.map(s => (
                      <button
                        key={s}
                        className="badge"
                        style={{ cursor: 'pointer', border: '1px solid currentColor' }}
                        onClick={() => { setNuevoEstado(s); setCambioModal(true) }}
                      >
                        {s.replace('_',' ')}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {transiciones.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Estado final, sin transiciones disponibles.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal cambio de estado */}
      <Modal
        open={cambioModal}
        title="Cambiar estado del tubo"
        onClose={() => { setCambioModal(false); setNuevoEstado('') }}
        footer={
          <>
            <button className="btn" onClick={() => setCambioModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleCambioEstado} disabled={!nuevoEstado || saving}>
              {saving ? 'Guardando...' : 'Confirmar cambio'}
            </button>
          </>
        }
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Estado actual: <StateBadge estado={tubo.estado} />
          </div>
        </div>
        <FormGroup label="Nuevo estado" required>
          <select value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}>
            <option value="">Seleccionar...</option>
            {transiciones.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Observación">
          <textarea
            value={obsEstado}
            onChange={e => setObsEstado(e.target.value)}
            placeholder="Motivo del cambio (requerido para ciertos estados)..."
            style={{ height: 72 }}
          />
        </FormGroup>
      </Modal>
    </>
  )
}
