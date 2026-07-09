// gastubos/frontend/src/pages/TubosPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api.js'
import { PageHeader, StateBadge, Modal, FormGroup, Spinner, EmptyState, GasDot } from '../components/ui.jsx'
import { useConfigStore } from '../store/configStore.js'
import { useToast } from '../components/ui.jsx'

const ESTADOS = ['DISPONIBLE','CARGADO','VACIO','ENTREGADO','ALQUILADO','VENDIDO','RESERVADO','PERDIDO','DEVUELTO','EN_REVISION']
const GASES   = ['CO2','Oxígeno','Argón','Nitrógeno','Acetileno','Mezcla Ar+CO2','Mezcla especial']

const EMPTY_TUBO = {
  serie: '', gas: 'CO2', capacidadLitros: 50, capacidadKg: '', talla: 'T50',
  pesoKg: '', propietario: 'PROPIO', propietarioClienteId: '', estado: 'DISPONIBLE',
  ubicacion: 'Depósito A', fechaCompra: '', observaciones: '',
}

export default function TubosPage() {
  const { nombre_empresa } = useConfigStore()
  const [tubos,   setTubos]   = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState(EMPTY_TUBO)
  const [saving,  setSaving]  = useState(false)
  const [q,       setQ]       = useState('')
  const [params]  = useSearchParams()
  const [estadoFilter, setEstadoFilter] = useState(params.get('estado') || '')
  const [clientes, setClientes] = useState([])
  const navigate  = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    api.get('/clientes')
      .then(res => setClientes(res.data))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/tubos', { params: { q: q || undefined, estado: estadoFilter || undefined, limit: 80 } })
      const ownTubos = res.data.tubos.filter(t => !t.id.startsWith('CLI_') && !t.id.startsWith('CLI-'))
      setTubos(ownTubos)
      setTotal(ownTubos.length)
    } catch { toast('Error al cargar tubos', 'error') }
    finally { setLoading(false) }
  }, [q, estadoFilter])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e) => {
    e.preventDefault()

    if (form.propietario === 'CLIENTE' && !form.propietarioClienteId) {
      toast('Debe seleccionar un cliente propietario', 'error')
      return
    }

    setSaving(true)
    try {
      const isAcetileno = form.gas.toLowerCase() === 'acetileno'
      const payload = {
        ...form,
        capacidadLitros: isAcetileno ? undefined : Number(form.capacidadLitros),
        capacidadKg: isAcetileno ? Number(form.capacidadKg) : undefined,
        pesoKg: form.pesoKg ? Number(form.pesoKg) : undefined,
        fechaCompra: form.fechaCompra ? new Date(form.fechaCompra).toISOString() : undefined,
        propietarioClienteId: form.propietario === 'CLIENTE' ? form.propietarioClienteId : undefined,
      }

      await api.post('/tubos', payload)
      toast('Tubo creado correctamente', 'success')
      setModal(false)
      setForm(EMPTY_TUBO)
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al crear tubo', 'error')
    } finally { setSaving(false) }
  }

  const handleGasChange = (e) => {
    const val = e.target.value
    const isAcetileno = val.toLowerCase() === 'acetileno'
    setForm(prev => ({
      ...prev,
      gas: val,
      capacidadLitros: isAcetileno ? '' : 50,
      capacidadKg: isAcetileno ? 1 : '',
    }))
  }

  const f = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <>
      <PageHeader
        title="Tubos"
        subtitle={`${total} tubos registrados`}
        actions={
          <>
            <button
              className="btn btn-sm"
              onClick={load}
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <i className={`ti ti-refresh ${loading ? 'ti-spin' : ''}`} />
              Actualizar
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => setModal(true)}>
              <i className="ti ti-plus" /> Nuevo Tubo
            </button>
          </>
        }
      />

      <div className="app-content">
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <i className="ti ti-search" />
            <input
              placeholder="Buscar por código, serie, gas..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            {q && <button className="btn-icon" onClick={() => setQ('')}><i className="ti ti-x" /></button>}
          </div>
          <select style={{ width: 180 }} value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
        </div>

        {loading ? <Spinner /> : (
          <>
            {/* VISTA TABLE (Desktop) */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              {tubos.length === 0 ? (
                <EmptyState icon="ti-cylinder" message="No se encontraron tubos con esos filtros" />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Gas</th>
                      <th>Cap.</th>
                      <th>Estado</th>
                      <th>Propietario</th>
                      <th>Cliente</th>
                      <th>Ubicación</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tubos.map(t => (
                      <tr key={t.id}>
                        <td>
                          <button
                            className="btn btn-sm"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px', color: 'var(--blue)' }}
                            onClick={() => navigate(`/tubos/${t.id}/detalle`)}
                          >
                            {t.id}
                          </button>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <GasDot gas={t.gas} /> {t.gas}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {t.capacidadLitros ? `${t.capacidadLitros}L` : `${Number(t.capacidadKg)} kg`}
                        </td>
                        <td><StateBadge estado={t.estado} /></td>
                        <td>
                          <span className={`badge badge-${t.propietario}`}>{t.propietario}</span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.cliente?.nombre || '—'}
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{t.ubicacion || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" title="Ver detalle" onClick={() => navigate(`/tubos/${t.id}/detalle`)}>
                              <i className="ti ti-eye" />
                            </button>
                            <button className="btn-icon" title="Imprimir QR" onClick={() => navigate(`/tubos/${t.id}/detalle?qr=1`)}>
                              <i className="ti ti-qrcode" />
                            </button>
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
              {tubos.length === 0 ? (
                <EmptyState icon="ti-cylinder" message="Sin resultados" />
              ) : (
                tubos.map(t => (
                  <div key={t.id} className="list-card">
                    <div className="list-card-header">
                      <div className="list-card-title">{t.id}</div>
                      <StateBadge estado={t.estado} />
                    </div>
                    <div className="list-card-body">
                      <div className="list-card-item">
                        <span className="list-card-label">Gas / Capacidad</span>
                        <span className="list-card-value">
                          <GasDot gas={t.gas} /> {t.gas} · {t.capacidadLitros ? `${t.capacidadLitros}L` : `${Number(t.capacidadKg)} kg`}
                        </span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Propietario</span>
                        <span className="list-card-value">{t.propietario}</span>
                      </div>
                      <div className="list-card-item" style={{ gridColumn: 'span 2' }}>
                        <span className="list-card-label">Cliente actual</span>
                        <span className="list-card-value">{t.cliente?.nombre || 'En depósito'}</span>
                      </div>
                    </div>
                    <div className="list-card-actions">
                      <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => navigate(`/tubos/${t.id}/detalle`)}>
                        <i className="ti ti-eye" /> Ver detalle
                      </button>
                      <button className="btn btn-sm" onClick={() => navigate(`/tubos/${t.id}/detalle?qr=1`)}>
                        <i className="ti ti-qrcode" /> QR
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal nuevo tubo */}
      <Modal
        open={modal}
        title="Nuevo Tubo"
        onClose={() => setModal(false)}
        footer={
          <>
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Guardando...' : <><i className="ti ti-device-floppy" /> Guardar Tubo</>}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreate}>
          <div className="form-grid">
            <FormGroup label="Número de serie" required>
              <input value={form.serie} onChange={f('serie')} placeholder="SN-2025-001" required />
            </FormGroup>
            <FormGroup label="Tipo de gas" required>
              <select value={form.gas} onChange={handleGasChange}>
                {GASES.map(g => <option key={g}>{g}</option>)}
              </select>
            </FormGroup>
            {form.gas.toLowerCase() === 'acetileno' ? (
              <FormGroup label="Capacidad (kg)" required>
                <select value={form.capacidadKg} onChange={f('capacidadKg')}>
                  <option value="">Seleccionar...</option>
                  {[1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8].map(kg => (
                    <option key={kg} value={kg}>{kg} kg</option>
                  ))}
                </select>
              </FormGroup>
            ) : (
              <FormGroup label="Capacidad (litros)" required>
                <select value={form.capacidadLitros} onChange={f('capacidadLitros')}>
                  <option value={8}>8 L</option>
                  <option value={10}>10 L</option>
                  <option value={50}>50 L</option>
                </select>
              </FormGroup>
            )}
            <FormGroup label="Talla">
              <input value={form.talla} onChange={f('talla')} placeholder="T50" />
            </FormGroup>
            <FormGroup label="Peso (kg)">
              <input type="number" value={form.pesoKg} onChange={f('pesoKg')} placeholder="75" step="0.1" />
            </FormGroup>
            <FormGroup label="Estado inicial">
              <select value={form.estado} onChange={f('estado')}>
                {['DISPONIBLE','CARGADO','VACIO'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Propietario">
              <select value={form.propietario} onChange={f('propietario')}>
                <option value="PROPIO">{nombre_empresa || 'Propio'}</option>
                <option value="CLIENTE">Cliente</option>
              </select>
            </FormGroup>
            {form.propietario === 'CLIENTE' && (
              <FormGroup label="Cliente Propietario" required>
                <select value={form.propietarioClienteId} onChange={f('propietarioClienteId')} required>
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre} (RUC: {c.ruc})</option>
                  ))}
                </select>
              </FormGroup>
            )}
            <FormGroup label="Fecha de compra">
              <input type="date" value={form.fechaCompra} onChange={f('fechaCompra')} />
            </FormGroup>
            <FormGroup label="Ubicación">
              <input value={form.ubicacion} onChange={f('ubicacion')} placeholder="Depósito A" />
            </FormGroup>
            <FormGroup label="Observaciones" >
              <textarea value={form.observaciones} onChange={f('observaciones')} style={{ height: 56 }} />
            </FormGroup>
          </div>
        </form>
      </Modal>
    </>
  )
}
