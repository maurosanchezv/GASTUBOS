// gastubos/frontend/src/pages/CargasPage.jsx
import { useState, useEffect, useCallback } from 'react'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner, EmptyState, GasDot, StateBadge, useToast, formatCapacidad, ObservacionCell } from '../components/ui.jsx'
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

const TIPO_CARGA_LABEL = {
  NORMAL: 'Normal',
  SALON:  'Salón',
  CAMION: 'En camión',
}

const TIPO_CARGA_BADGE = {
  NORMAL: 'badge-CARGADO',
  SALON:  'badge-REPARTIDOR',
  CAMION: 'badge-ALQUILADO',
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
  'Mezcla especial': 'MEZCLA_CO2_ARGON',
  'Acetileno': 'ACETILENO',
}

const ESTADOS_CARGABLES = ['VACIO', 'DEVUELTO', 'DISPONIBLE']

const formatNumberSpanish = (val) => {
  const num = Number(val)
  if (isNaN(num)) return '0'
  const rounded = Math.round(num * 1000) / 1000
  if (Number.isInteger(rounded)) {
    return rounded.toString()
  }
  return rounded.toFixed(3).replace('.', ',')
}

const FORM_INICIAL = {
  tuboId: '', tipoGas: '', unidad: '', tipoCarga: 'NORMAL', cantidad: '',
  fechaCarga: new Date().toISOString().slice(0, 16), observaciones: '', metodoPago: '',
}

export default function CargasPage() {
  const { user } = useAuthStore()
  const { toast } = useToast()

  const [q,        setQ]        = useState('')
  const [tab,      setTab]      = useState('pendientes') // 'pendientes' | 'historial'
  const [tubos,    setTubos]    = useState([])
  const [cargas,   setCargas]   = useState([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [modal,    setModal]    = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [form,     setForm]     = useState(FORM_INICIAL)
  const [tuboSeleccionado, setTuboSeleccionado] = useState(null)
  const [page,     setPage]     = useState(1)
  const [filtroGas, setFiltroGas] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [calcPrecio, setCalcPrecio] = useState('')       // SIEMPRE manual, nunca se recalcula
  const [calcMonto, setCalcMonto] = useState('')
  const [modoCalculo, setModoCalculo] = useState('PRECIO') // 'PRECIO' | 'MONTO' — cuál de los dos es editable

  const limit = 50

  const tubosFiltrados = tubos.filter(t => {
    if (!q.trim()) return true
    const query = q.toLowerCase().trim()
    return (
      t.id?.toLowerCase().includes(query) ||
      t.serie?.toLowerCase().includes(query) ||
      t.gas?.toLowerCase().includes(query) ||
      t.ubicacion?.toLowerCase().includes(query) ||
      t.estado?.toLowerCase().includes(query)
    )
  })

  // Carga tubos pendientes de carga
  const loadTubos = useCallback(async () => {
    setLoading(true)
    try {
      // Buscar tubos en estados cargables (varias llamadas por limitación del filtro)
      const resultados = await Promise.all(
        ESTADOS_CARGABLES.map(estado => api.get('/tubos', {
          params: { estado, limit: 200 },
        }))
      )
      const todos = resultados.flatMap(r => r.data.tubos).filter(t => !t.id.startsWith('CLI_') && !t.id.startsWith('CLI-'))
      // Ordenar: VACIO primero, luego resto
      todos.sort((a, b) => {
        const orden = { VACIO: 0, DEVUELTO: 1, DISPONIBLE: 2 }
        return (orden[a.estado] ?? 99) - (orden[b.estado] ?? 99)
      })
      setTubos(todos)
    } catch { toast('Error al cargar tubos', 'error') }
    finally { setLoading(false) }
  }, [])

  // Carga historial de cargas
  const loadHistorial = useCallback(async () => {
    setLoading(true)
    try {
      const p = { page, limit }
      if (filtroGas) p.tipoGas = filtroGas
      if (filtroDesde) p.desde = new Date(filtroDesde).toISOString()
      if (filtroHasta) {
        const h = new Date(filtroHasta)
        h.setHours(23, 59, 59, 999)
        p.hasta = h.toISOString()
      }
      const res = await api.get('/cargas', { params: p })
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
    const capVal = tubo.capacidadKg ? Number(tubo.capacidadKg) : (tubo.capacidadLitros ? Number(tubo.capacidadLitros) : null)
    const capStr = capVal ? String(capVal) : ''

    setTuboSeleccionado(tubo)

    setForm({
      ...FORM_INICIAL,
      tuboId:  tubo.id,
      tipoGas: gasEnum,
      unidad:  gasEnum ? TIPO_GAS_UNIDAD[gasEnum] : '',
      tipoCarga: 'NORMAL',
      cantidad: capStr,
    })

    setCalcPrecio('')
    setCalcMonto('')
    setModoCalculo('PRECIO')

    setModal(true)
  }

  function handleGasChange(tipoGas) {
    setForm(prev => ({ ...prev, tipoGas, unidad: TIPO_GAS_UNIDAD[tipoGas] || '' }))
    setCalcPrecio('')
    setCalcMonto('')
  }

  function abrirModalSalon() {
    setTuboSeleccionado(null)
    setForm({
      ...FORM_INICIAL,
      tuboId: '',
      tipoGas: 'CO2',
      unidad: 'KG',
      tipoCarga: 'SALON',
    })

    setCalcPrecio('')
    setCalcMonto('')
    setModoCalculo('PRECIO')

    setModal(true)
  }

  // 1. Cambia Cantidad -> recalcula Monto (T = Q × U) en modo PRECIO, o el Precio (U = T / Q) en modo MONTO.
  const handleCantidadChange = (cantidad) => {
    setForm(prev => ({ ...prev, cantidad }))
    const q = Number(cantidad)

    if (modoCalculo === 'MONTO') {
      const m = Number(calcMonto)
      if (!isNaN(q) && cantidad !== '' && q > 0 && m > 0) {
        setCalcPrecio(Math.round(m / q).toString())
      } else {
        setCalcPrecio('')
      }
    } else {
      const u = Number(calcPrecio)
      if (!isNaN(q) && cantidad !== '' && q >= 0 && u > 0) {
        setCalcMonto(Math.round(q * u).toString())
      } else {
        setCalcMonto('')
      }
    }
  }

  // 2. Cambia Precio -> recalcula Monto (T = Q × U). Solo aplica en modo PRECIO.
  const handleCalcPrecioChange = (precio) => {
    setCalcPrecio(precio)
    const u = Number(precio)
    const q = Number(form.cantidad)

    if (!isNaN(u) && precio !== '' && u >= 0 && q > 0) {
      setCalcMonto(Math.round(q * u).toString())
    } else {
      setCalcMonto('')
    }
  }

  // 3. Cambia Monto -> recalcula Precio unitario (U = T / Q). Solo aplica en modo MONTO.
  const handleCalcMontoChange = (monto) => {
    setCalcMonto(monto)
    const m = Number(monto)
    const q = Number(form.cantidad)

    if (!isNaN(m) && monto !== '' && m >= 0 && q > 0) {
      setCalcPrecio(Math.round(m / q).toString())
    } else {
      setCalcPrecio('')
    }
  }

  function cambiarModoCalculo(modo) {
    setModoCalculo(modo)
    setCalcPrecio('')
    setCalcMonto('')
  }

  function handleSubmit() {
    if (tuboSeleccionado && !form.tuboId) {
      toast('Completá los campos obligatorios', 'error')
      return
    }
    if (!form.tipoGas || !form.cantidad || !form.fechaCarga) {
      toast('Completá los campos obligatorios', 'error')
      return
    }
    if (!form.metodoPago) {
      toast('Seleccioná la forma de pago', 'error')
      return
    }
    setConfirmOpen(true)
  }

  async function guardarCarga() {
    setSaving(true)
    try {
      await api.post('/cargas', {
        tuboId:        tuboSeleccionado ? form.tuboId : undefined,
        tipoGas:       form.tipoGas,
        unidad:        form.unidad,
        tipoCarga:     form.tipoCarga,
        cantidad:      Number(form.cantidad),
        precioUnitario: Number(calcPrecio) || 0,
        fechaCarga:    new Date(form.fechaCarga).toISOString(),
        observaciones: form.observaciones || undefined,
        metodoPago:    form.metodoPago,
      })
      toast(
        tuboSeleccionado ? 'Carga registrada — tubo pasó a estado CARGADO' : 'Carga en salón registrada con éxito',
        'success'
      )
      setConfirmOpen(false)
      setModal(false)
      if (tab === 'pendientes') loadTubos()
      else loadHistorial()
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
        actions={
          <>
            <button
              className="btn btn-sm"
              onClick={tab === 'pendientes' ? loadTubos : loadHistorial}
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <i className={`ti ti-refresh ${loading ? 'ti-spin' : ''}`} />
              Actualizar
            </button>
            {(user?.rol === 'ADMIN' || user?.rol === 'SUPERVISOR' || user?.rol === 'OPERADOR') && (
              <button className="btn btn-primary btn-sm" onClick={abrirModalSalon}>
                <i className="ti ti-plus" /> Carga en salón
              </button>
            )}
          </>
        }
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
            {/* Buscador */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <div className="search-bar" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <i className="ti ti-search" />
                <input
                  placeholder="Buscar por código, serie, gas, ubicación..."
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
                {q && <button className="btn-icon" onClick={() => setQ('')}><i className="ti ti-x" /></button>}
              </div>
            </div>

            {loading ? <Spinner /> : tubos.length === 0 ? (
              <EmptyState icon="ti-circle-check" message="No hay tubos pendientes de carga" />
            ) : tubosFiltrados.length === 0 ? (
              <EmptyState icon="ti-cylinder" message="No se encontraron tubos con esos criterios de búsqueda" />
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
                        <th>Capacidad</th>
                        <th>Estado</th>
                        <th>Ubicación</th>
                        <th style={{ textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tubosFiltrados.map(t => (
                        <tr key={t.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{t.id}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{t.serie}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <GasDot gas={t.gas} />
                              {t.gas}
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 12 }}>{formatCapacidad(t)}</td>
                          <td><StateBadge estado={t.estado} /></td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.ubicacion || '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {(user?.rol === 'ADMIN' || user?.rol === 'SUPERVISOR' || user?.rol === 'OPERADOR') && (
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
                  {tubosFiltrados.map(t => (
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
                        <div className="list-card-item">
                          <span className="list-card-label">Capacidad</span>
                          <span className="list-card-value" style={{ fontWeight: 600, color: 'var(--blue)' }}>{formatCapacidad(t)}</span>
                        </div>
                        <div className="list-card-item">
                          <span className="list-card-label">Ubicación</span>
                          <span className="list-card-value">{t.ubicacion || '—'}</span>
                        </div>
                      </div>
                      {(user?.rol === 'ADMIN' || user?.rol === 'SUPERVISOR' || user?.rol === 'OPERADOR') && (
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
                        <th>Tipo de carga</th>
                        <th>Tubo</th>
                        <th>Gas cargado</th>
                        <th>Cantidad</th>
                        <th>Precio Unit.</th>
                        <th>Monto Total</th>
                        <th>Fecha</th>
                        <th>Operador</th>
                        <th>Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargas.map(c => {
                        const cant = Number(c.cantidad || 0)
                        const pu = Number(c.precioUnitario || 0)
                        const sub = cant * pu
                        const uLabel = c.unidad === 'KG' ? 'kg' : 'm³'
                        return (
                          <tr key={c.id}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.numero}</td>
                            <td>
                              <span className={`badge ${TIPO_CARGA_BADGE[c.tipoCarga] || 'badge-CARGADO'}`} style={{ fontSize: 10 }}>
                                {TIPO_CARGA_LABEL[c.tipoCarga] || 'Normal'}
                              </span>
                            </td>
                            <td>
                              {c.tubo ? (
                                <>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{c.tubo.id}</div>
                                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.tubo.serie}</div>
                                </>
                              ) : (
                                <span style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-muted)' }}>Carga en salón</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <GasDot gas={TIPO_GAS_LABEL[c.tipoGas]} />
                                {TIPO_GAS_LABEL[c.tipoGas] || c.tipoGas}
                              </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {cant.toLocaleString('es-PY')} {uLabel}
                            </td>
                            <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                              {pu > 0 ? `${pu.toLocaleString('es-PY')} GS/${uLabel}` : '—'}
                            </td>
                            <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--blue)' }}>
                              {sub > 0 ? `${sub.toLocaleString('es-PY')} GS` : '—'}
                            </td>
                            <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                              {new Date(c.fechaCarga).toLocaleDateString('es-PY')}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {c.operador?.nombre || c.operador?.username}
                            </td>
                            <td style={{ fontSize: 11 }}>
                              <ObservacionCell texto={c.observaciones} titulo="Observaciones de la carga" />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* VISTA CARDS (Mobile) */}
                <div className="mobile-list">
                  {cargas.map(c => {
                    const cant = Number(c.cantidad || 0)
                    const pu = Number(c.precioUnitario || 0)
                    const sub = cant * pu
                    const uLabel = c.unidad === 'KG' ? 'kg' : 'm³'
                    return (
                      <div key={c.id} className="list-card">
                        <div className="list-card-header">
                          <div className="list-card-title">{c.numero}</div>
                          <div style={{ fontWeight: 700, color: 'var(--blue)' }}>
                            {cant.toLocaleString('es-PY')} {uLabel}
                          </div>
                        </div>
                        <div className="list-card-body">
                          <div className="list-card-item">
                            <span className="list-card-label">Tipo</span>
                            <span className={`badge ${TIPO_CARGA_BADGE[c.tipoCarga] || 'badge-CARGADO'}`} style={{ fontSize: 10 }}>
                              {TIPO_CARGA_LABEL[c.tipoCarga] || 'Normal'}
                            </span>
                          </div>
                          <div className="list-card-item">
                            <span className="list-card-label">Tubo</span>
                            <span className="list-card-value">{c.tubo?.id || 'Carga en salón'}</span>
                          </div>
                          <div className="list-card-item">
                            <span className="list-card-label">Gas</span>
                            <span className="list-card-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <GasDot gas={TIPO_GAS_LABEL[c.tipoGas]} /> {TIPO_GAS_LABEL[c.tipoGas]}
                            </span>
                          </div>
                          <div className="list-card-item">
                            <span className="list-card-label">Precio Unit.</span>
                            <span className="list-card-value" style={{ fontFamily: 'var(--font-mono)' }}>
                              {pu > 0 ? `${pu.toLocaleString('es-PY')} GS/${uLabel}` : '—'}
                            </span>
                          </div>
                          <div className="list-card-item">
                            <span className="list-card-label">Monto Total</span>
                            <span className="list-card-value" style={{ fontWeight: 600, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>
                              {sub > 0 ? `${sub.toLocaleString('es-PY')} GS` : '—'}
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
                              <span className="list-card-value" style={{ fontSize: 11 }}>
                                <ObservacionCell texto={c.observaciones} titulo="Observaciones de la carga" maxWidth={220} />
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
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
        title={tuboSeleccionado ? `Registrar carga — ${tuboSeleccionado.id}` : 'Registrar Carga en Salón'}
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
                Serie: {tuboSeleccionado.serie} · Gas: {tuboSeleccionado.gas} · <strong>Capacidad: {formatCapacidad(tuboSeleccionado)}</strong> · <StateBadge estado={tuboSeleccionado.estado} />
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
              onChange={e => handleCantidadChange(e.target.value)}
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

        {/* Asistente de cálculo por dinero */}
        <div style={{ 
          border: '1px dashed var(--border-mid)', 
          borderRadius: 8, 
          padding: '12px 14px', 
          marginBottom: 16, 
          background: 'var(--bg-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-calculator" /> Asistente de cobro (Opcional)
            </div>
            <div style={{ display: 'flex', border: '1px solid var(--border-mid)', borderRadius: 6, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => cambiarModoCalculo('PRECIO')}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: modoCalculo === 'PRECIO' ? 'var(--blue)' : 'transparent',
                  color: modoCalculo === 'PRECIO' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                Por precio unitario
              </button>
              <button
                type="button"
                onClick={() => cambiarModoCalculo('MONTO')}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: modoCalculo === 'MONTO' ? 'var(--blue)' : 'transparent',
                  color: modoCalculo === 'MONTO' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                Por monto total
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormGroup label="Precio unitario (Gs.)">
              {modoCalculo === 'PRECIO' ? (
                <input
                  type="number"
                  min="0"
                  placeholder="ej: 10000"
                  value={calcPrecio}
                  onChange={e => handleCalcPrecioChange(e.target.value)}
                />
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    readOnly
                    placeholder="Cálculo automático"
                    value={calcPrecio ? `${Number(calcPrecio).toLocaleString('es-PY')} Gs.` : ''}
                    style={{
                      background: 'var(--bg-subtle, #f1f5f9)',
                      cursor: 'not-allowed',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      paddingRight: 32
                    }}
                  />
                  <i className="ti ti-lock" style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text-muted)', fontSize: 14
                  }} />
                </div>
              )}
            </FormGroup>
            <FormGroup label="Monto total (Gs.)">
              {modoCalculo === 'MONTO' ? (
                <input
                  type="number"
                  min="0"
                  placeholder="ej: 250000"
                  value={calcMonto}
                  onChange={e => handleCalcMontoChange(e.target.value)}
                />
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    readOnly
                    placeholder="Cálculo automático"
                    value={calcMonto ? `${Number(calcMonto).toLocaleString('es-PY')} Gs.` : ''}
                    style={{
                      background: 'var(--bg-subtle, #f1f5f9)',
                      cursor: 'not-allowed',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      paddingRight: 32
                    }}
                  />
                  <i className="ti ti-lock" style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text-muted)', fontSize: 14
                  }} />
                </div>
              )}
            </FormGroup>
          </div>
          {modoCalculo === 'PRECIO' ? (
            !calcPrecio || Number(calcPrecio) <= 0 ? (
              <div style={{ fontSize: 11, color: 'var(--amber, #d97706)', marginTop: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-info-circle" /> Ingresá el precio unitario para calcular el monto total
              </div>
            ) : Number(form.cantidad) > 0 && calcMonto !== '' ? (
              <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 6, fontWeight: 600 }}>
                Cálculo: {formatNumberSpanish(Number(form.cantidad))} {form.unidad || 'unidad'} × {Number(calcPrecio).toLocaleString('es-PY')} Gs./{form.unidad || 'unidad'} = {Number(calcMonto).toLocaleString('es-PY')} Gs.
              </div>
            ) : null
          ) : (
            !calcMonto || Number(calcMonto) <= 0 ? (
              <div style={{ fontSize: 11, color: 'var(--amber, #d97706)', marginTop: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-info-circle" /> Ingresá el monto total para calcular el precio unitario
              </div>
            ) : Number(form.cantidad) > 0 && calcPrecio !== '' ? (
              <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 6, fontWeight: 600 }}>
                Cálculo: {Number(calcMonto).toLocaleString('es-PY')} Gs. ÷ {formatNumberSpanish(Number(form.cantidad))} {form.unidad || 'unidad'} = {Number(calcPrecio).toLocaleString('es-PY')} Gs./{form.unidad || 'unidad'}
              </div>
            ) : null
          )}
        </div>

        <FormGroup label="Forma de pago" required>
          <select
            value={form.metodoPago}
            onChange={e => setForm(prev => ({ ...prev, metodoPago: e.target.value }))}
          >
            <option value="">Seleccioná...</option>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
          </select>
        </FormGroup>

        <FormGroup label="Observaciones">
          <textarea
            placeholder="Notas opcionales sobre esta carga..."
            value={form.observaciones}
            onChange={e => setForm(prev => ({ ...prev, observaciones: e.target.value }))}
            style={{ height: 64 }}
          />
        </FormGroup>
      </Modal>

      {/* Modal de confirmación de carga */}
      <Modal
        open={confirmOpen}
        title="¿Confirmar Registro de Carga?"
        onClose={() => setConfirmOpen(false)}
        width={400}
        footer={
          <>
            <button className="btn" onClick={() => setConfirmOpen(false)}>Atrás</button>
            <button className="btn btn-primary" onClick={guardarCarga} disabled={saving}>
              {saving ? 'Registrando...' : 'Sí, Registrar Carga'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Por favor, verificá que los datos ingresados sean correctos antes de guardar:
          </p>
          
          <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Destino:</span>
              <span style={{ fontWeight: 600 }}>{tuboSeleccionado ? `Tubo ${form.tuboId}` : 'Carga en Salón'}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Gas:</span>
              <span style={{ fontWeight: 600 }}>{TIPO_GAS_LABEL[form.tipoGas] || form.tipoGas}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px dashed var(--border)', paddingBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>Cantidad:</span>
              <span style={{ fontWeight: 700, color: 'var(--blue)' }}>
                {formatNumberSpanish(form.cantidad)} {form.unidad === 'KG' ? 'kg' : 'm³'}
              </span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Precio Unitario:</span>
              <span style={{ fontWeight: 600 }}>
                {Number(calcPrecio || 0).toLocaleString('es-PY')} GS / {form.unidad === 'KG' ? 'kg' : 'm³'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Forma de pago:</span>
              <span style={{ fontWeight: 600 }}>{form.metodoPago === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <span style={{ fontWeight: 600 }}>Monto Total:</span>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--green)' }}>
                {Number(calcMonto || Math.round(Number(form.cantidad || 0) * Number(calcPrecio || 0))).toLocaleString('es-PY')} GS
              </span>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
