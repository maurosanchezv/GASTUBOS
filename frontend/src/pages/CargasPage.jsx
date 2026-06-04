// gastubos/frontend/src/pages/CargasPage.jsx
import { useState, useEffect, useCallback } from 'react'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner, EmptyState, GasDot, StateBadge, useToast } from '../components/ui.jsx'
import { useAuthStore } from '../store/authStore.js'

const TIPO_GAS_LABEL = {
  CO2:             'CO₂',
  OXIGENO:         'Oxígeno',
  ARGON:           'Argón',
  NITROGENO:       'Nitrógeno',
  AIRE_COMPRIMIDO: 'Aire comprimido',
  MEZCLA_CO2_ARGON:'Mezcla 80% CO₂ / 20% Argón',
  ACETILENO:       'Acetileno',
}

const TIPO_GAS_UNIDAD = {
  CO2: 'KG', OXIGENO: 'M3', ARGON: 'M3', NITROGENO: 'M3',
  AIRE_COMPRIMIDO: 'M3', MEZCLA_CO2_ARGON: 'M3', ACETILENO: 'KG',
}

const GAS_STRING_TO_ENUM = {
  'CO2': 'CO2', 'CO₂': 'CO2',
  'Oxígeno': 'OXIGENO', 'Oxigeno': 'OXIGENO',
  'Argón': 'ARGON', 'Argon': 'ARGON',
  'Nitrógeno': 'NITROGENO', 'Nitrogeno': 'NITROGENO',
  'Aire comprimido': 'AIRE_COMPRIMIDO',
  'Mezcla': 'MEZCLA_CO2_ARGON',
  'Acetileno': 'ACETILENO',
}

const ESTADOS_CARGABLES = ['VACIO', 'DISPONIBLE', 'DEVUELTO', 'EN_REVISION', 'RESERVADO']

const FORM_INICIAL = {
  tuboId: '', tipoGas: '', unidad: '', cantidad: '',
  fechaCarga: new Date().toISOString().slice(0, 16), observaciones: '',
}

export default function CargasPage() {
  const { user } = useAuthStore()
  const { toast } = useToast()

  const [tab,      setTab]      = useState('pendientes') // 'pendientes' | 'historial'
  const [tubos,    setTubos]    = useState([])
  const [cargas,   setCargas]   = useState([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState(FORM_INICIAL)
  const [tuboSeleccionado, setTuboSeleccionado] = useState(null)
  const [page,     setPage]     = useState(1)
  const [filtroGas, setFiltroGas] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

  const limit = 50

  // Carga tubos pendientes de carga
  const loadTubos = useCallback(async () => {
    setLoading(true)
    try {
      // Buscar tubos en estados cargables (varias llamadas por limitación del filtro)
      const resultados = await Promise.all(
        ESTADOS_CARGABLES.map(estado => api.get(`/tubos?estado=${estado}&limit=200`))
      )
      const todos = resultados.flatMap(r => r.data.tubos)
      // Ordenar: VACIO primero, luego resto
      todos.sort((a, b) => {
        const orden = { VACIO: 0, DEVUELTO: 1, DISPONIBLE: 2, EN_REVISION: 3, RESERVADO: 4 }
        return (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9)
      })
      setTubos(todos)
    } catch { toast('Error al cargar tubos', 'error') }
    finally { setLoading(false) }
  }, [])

  // Carga historial de cargas
  const loadHistorial = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit })
      if (filtroGas)   params.set('tipoGas', filtroGas)
      if (filtroDesde) params.set('desde', new Date(filtroDesde).toISOString())
      if (filtroHasta) params.set('hasta', new Date(filtroHasta + 'T23:59:59').toISOString())
      const res = await api.get(`/cargas?${params}`)
      setCargas(res.data.cargas)
      setTotal(res.data.total)
    } catch { toast('Error al cargar historial', 'error') }
    finally { setLoading(false) }
  }, [page, filtroGas, filtroDesde, filtroHasta])

  useEffect(() => {
    if (tab === 'pendientes') loadTubos()
    else loadHistorial()
  }, [tab, loadTubos, loadHistorial])

  function abrirModalConTubo(tubo) {
    const gasEnum = GAS_STRING_TO_ENUM[tubo.gas] || ''
    setTuboSeleccionado(tubo)
    setForm({
      ...FORM_INICIAL,
      tuboId:  tubo.id,
      tipoGas: gasEnum,
      unidad:  gasEnum ? TIPO_GAS_UNIDAD[gasEnum] : '',
    })
    setModal(true)
  }

  function handleGasChange(tipoGas) {
    setForm(prev => ({ ...prev, tipoGas, unidad: TIPO_GAS_UNIDAD[tipoGas] || '' }))
  }

  async function handleSubmit() {
    if (!form.tuboId || !form.tipoGas || !form.cantidad || !form.fechaCarga) {
      toast('Completá los campos obligatorios', 'error')
      return
    }
    setSaving(true)
    try {
      await api.post('/cargas', {
        tuboId:        form.tuboId,
        tipoGas:       form.tipoGas,
        unidad:        form.unidad,
        cantidad:      Number(form.cantidad),
        fechaCarga:    new Date(form.fechaCarga).toISOString(),
        observaciones: form.observaciones || undefined,
      })
      toast('Carga registrada — tubo pasó a estado CARGADO', 'success')
      setModal(false)
      loadTubos()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al registrar la carga', 'error')
    } finally { setSaving(false) }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <>
      <PageHeader
        title="Cargas y Recargas"
        subtitle={tab === 'pendientes'
          ? `${tubos.length} tubo${tubos.length !== 1 ? 's' : ''} para cargar`
          : `${total} registro${total !== 1 ? 's' : ''} en historial`}
      />

      <div className="app-content">
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {[
            { key: 'pendientes', label: 'Tubos para cargar', icon: 'ti-cylinder' },
            { key: 'historial',  label: 'Historial de cargas', icon: 'ti-history' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1) }}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 500, border: 'none',
                background: 'transparent', cursor: 'pointer',
                borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent',
                color: tab === t.key ? 'var(--blue)' : 'var(--text-secondary)',
                marginBottom: -1,
              }}
            >
              <i className={`ti ${t.icon}`} style={{ marginRight: 6 }} />{t.label}
              {t.key === 'pendientes' && tubos.length > 0 && (
                <span style={{
                  marginLeft: 8, background: 'var(--blue)', color: '#fff',
                  borderRadius: 10, padding: '1px 7px', fontSize: 11,
                }}>{tubos.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* TAB: Tubos para cargar */}
        {tab === 'pendientes' && (
          <>
            {loading ? <Spinner /> : tubos.length === 0 ? (
              <EmptyState icon="ti-circle-check" message="No hay tubos pendientes de carga" />
            ) : (
              <>
                {/* VISTA TABLE (Desktop) */}
                <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Serie</th>
                        <th>Gas actual</th>
                        <th>Estado</th>
                        <th>Ubicación</th>
                        <th style={{ textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tubos.map(t => (
                        <tr key={t.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{t.id}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{t.serie}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <GasDot gas={t.gas} />
                              {t.gas}
                            </div>
                          </td>
                          <td><StateBadge estado={t.estado} /></td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.ubicacion || '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {(user?.rol === 'ADMIN' || user?.rol === 'OPERADOR') && (
                              <button className="btn btn-primary btn-sm" onClick={() => abrirModalConTubo(t)}>
                                <i className="ti ti-bolt" /> Cargar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* VISTA CARDS (Mobile) */}
                <div className="mobile-list">
                  {tubos.map(t => (
                    <div key={t.id} className="list-card">
                      <div className="list-card-header">
                        <div className="list-card-title">{t.id}</div>
                        <StateBadge estado={t.estado} />
                      </div>
                      <div className="list-card-body">
                        <div className="list-card-item">
                          <span className="list-card-label">Gas Actual</span>
                          <span className="list-card-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <GasDot gas={t.gas} /> {t.gas}
                          </span>
                        </div>
                        <div className="list-card-item">
                          <span className="list-card-label">Serie</span>
                          <span className="list-card-value">{t.serie}</span>
                        </div>
                        <div className="list-card-item col-span-2">
                          <span className="list-card-label">Ubicación</span>
                          <span className="list-card-value">{t.ubicacion || '—'}</span>
                        </div>
                      </div>
                      {(user?.rol === 'ADMIN' || user?.rol === 'OPERADOR') && (
                        <div className="list-card-actions" style={{ justifyContent: 'flex-end', paddingTop: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <button className="btn-icon btn-primary" onClick={() => abrirModalConTubo(t)}
                              style={{ width: 44, height: 44, fontSize: 20, borderRadius: 10 }}>
                              <i className="ti ti-bolt" />
                            </button>
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--blue)' }}>Cargar</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* TAB: Historial */}
        {tab === 'historial' && (
          <>
            {/* Filtros */}
            <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Gas</label>
                  <select value={filtroGas} onChange={e => { setFiltroGas(e.target.value); setPage(1) }}>
                    <option value="">Todos los gases</option>
                    {Object.entries(TIPO_GAS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Desde</label>
                  <input type="date" value={filtroDesde} onChange={e => { setFiltroDesde(e.target.value); setPage(1) }} />
                </div>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hasta</label>
                  <input type="date" value={filtroHasta} onChange={e => { setFiltroHasta(e.target.value); setPage(1) }} />
                </div>
                {(filtroGas || filtroDesde || filtroHasta) && (
                  <button className="btn btn-sm" onClick={() => { setFiltroGas(''); setFiltroDesde(''); setFiltroHasta(''); setPage(1) }}>
                    <i className="ti ti-x" /> Limpiar
                  </button>
                )}
              </div>
            </div>

            {loading ? <Spinner /> : cargas.length === 0 ? (
              <EmptyState icon="ti-history" message="Sin cargas registradas" />
            ) : (
              <>
                {/* VISTA TABLE (Desktop) */}
                <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Número</th>
                        <th>Tubo</th>
                        <th>Gas cargado</th>
                        <th>Cantidad</th>
                        <th>Fecha</th>
                        <th>Operador</th>
                        <th>Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargas.map(c => (
                        <tr key={c.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.numero}</td>
                          <td>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{c.tubo?.id}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.tubo?.serie}</div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <GasDot gas={TIPO_GAS_LABEL[c.tipoGas]} />
                              {TIPO_GAS_LABEL[c.tipoGas] || c.tipoGas}
                            </div>
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {Number(c.cantidad).toLocaleString('es-PY')} {c.unidad === 'KG' ? 'kg' : 'm³'}
                          </td>
                          <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                            {new Date(c.fechaCarga).toLocaleDateString('es-PY')}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {c.operador?.nombre || c.operador?.username}
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.observaciones || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* VISTA CARDS (Mobile) */}
                <div className="mobile-list">
                  {cargas.map(c => (
                    <div key={c.id} className="list-card">
                      <div className="list-card-header">
                        <div className="list-card-title">{c.numero}</div>
                        <div style={{ fontWeight: 700, color: 'var(--blue)' }}>
                          {Number(c.cantidad).toLocaleString('es-PY')} {c.unidad === 'KG' ? 'kg' : 'm³'}
                        </div>
                      </div>
                      <div className="list-card-body">
                        <div className="list-card-item">
                          <span className="list-card-label">Tubo</span>
                          <span className="list-card-value">{c.tubo?.id}</span>
                        </div>
                        <div className="list-card-item">
                          <span className="list-card-label">Gas</span>
                          <span className="list-card-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <GasDot gas={TIPO_GAS_LABEL[c.tipoGas]} /> {TIPO_GAS_LABEL[c.tipoGas]}
                          </span>
                        </div>
                        <div className="list-card-item">
                          <span className="list-card-label">Fecha</span>
                          <span className="list-card-value">{new Date(c.fechaCarga).toLocaleDateString('es-PY')}</span>
                        </div>
                        <div className="list-card-item">
                          <span className="list-card-label">Operador</span>
                          <span className="list-card-value">{c.operador?.username}</span>
                        </div>
                        {c.observaciones && (
                          <div className="list-card-item col-span-2">
                            <span className="list-card-label">Obs.</span>
                            <span className="list-card-value" style={{ whiteSpace: 'normal', fontSize: 11 }}>{c.observaciones}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 0 4px' }}>
                <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>{page} / {totalPages}</span>
                <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de carga */}
      <Modal
        open={modal}
        title={`Registrar carga — ${tuboSeleccionado?.id}`}
        onClose={() => setModal(false)}
        width={520}
        footer={
          <>
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Guardando...' : 'Confirmar carga'}
            </button>
          </>
        }
      >
        {tuboSeleccionado && (
          <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <GasDot gas={tuboSeleccionado.gas} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{tuboSeleccionado.id}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Serie: {tuboSeleccionado.serie} · Gas actual: {tuboSeleccionado.gas} · <StateBadge estado={tuboSeleccionado.estado} />
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormGroup label="Gas a cargar" required>
            <select value={form.tipoGas} onChange={e => handleGasChange(e.target.value)}>
              <option value="">Seleccionar...</option>
              {Object.entries(TIPO_GAS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </FormGroup>

          <FormGroup label="Unidad">
            <input
              value={form.unidad === 'KG' ? 'Kilogramo (kg)' : form.unidad === 'M3' ? 'Metro cúbico (m³)' : '—'}
              readOnly
              style={{ background: 'var(--bg-subtle)', cursor: 'not-allowed' }}
            />
          </FormGroup>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormGroup label="Cantidad cargada" required>
            <input
              type="number" min="0.001" step="0.001"
              placeholder={form.unidad === 'KG' ? 'ej: 25' : 'ej: 6'}
              value={form.cantidad}
              onChange={e => setForm(prev => ({ ...prev, cantidad: e.target.value }))}
            />
          </FormGroup>
          <FormGroup label="Fecha de carga" required>
            <input
              type="datetime-local"
              value={form.fechaCarga}
              onChange={e => setForm(prev => ({ ...prev, fechaCarga: e.target.value }))}
            />
          </FormGroup>
        </div>

        <FormGroup label="Observaciones">
          <textarea
            placeholder="Notas opcionales sobre esta carga..."
            value={form.observaciones}
            onChange={e => setForm(prev => ({ ...prev, observaciones: e.target.value }))}
            style={{ height: 64 }}
          />
        </FormGroup>
      </Modal>
    </>
  )
}
