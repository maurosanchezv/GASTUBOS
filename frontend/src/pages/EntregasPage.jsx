// gastubos/frontend/src/pages/EntregasPage.jsx
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import api from '../services/api.js'
import { PageHeader, StateBadge, Spinner, GasDot, EmptyState } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

// Fix Leaflet marker icons con Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

const EMPTY = {
  clienteId: '', direccionEntrega: '', tipoOperacion: 'ENTREGA_SIMPLE',
  repartidorId: '', observaciones: '', tubosIds: [],
  fechaVencimiento: '', referencia: '',
  latitud: null, longitud: null,
}

export default function EntregasPage() {
  const [tab, setTab]           = useState('nueva')
  const [form, setForm]         = useState(EMPTY)
  const [clientes, setClientes] = useState([])
  const [usuarios, setUsuarios] = useState([])

  // Búsqueda de tubos mejorada
  const [tuboBusq, setTuboBusq]       = useState('')
  const [tuboSugs, setTuboSugs]       = useState([])
  const [tuboBuscando, setTuboBuscando] = useState(false)
  const busqRef = useRef(null)

  // GPS / Mapa picker
  const [gpsLoading, setGpsLoading]           = useState(false)
  const [mapaPickerAbierto, setMapaPickerAbierto] = useState(false)
  const mapaPickerRef      = useRef(null)
  const mapaPickerInstance = useRef(null)   // { map, marker }

  // Historial + mapa historial
  const [saving, setSaving]   = useState(false)
  const [entregas, setEntregas] = useState([])
  const [loadingH, setLoadingH] = useState(false)
  const [mapaHistAbierto, setMapaHistAbierto] = useState(false)
  const mapaHistRef      = useRef(null)
  const mapaHistInstance = useRef(null)

  const [params] = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    api.get('/clientes').then(r => setClientes(r.data)).catch(() => {})
    api.get('/usuarios').then(r => setUsuarios(r.data)).catch(() => {})
    if (params.get('tubo')) agregarTubo(params.get('tubo'))
  }, [])

  useEffect(() => {
    if (tab === 'historial') loadEntregas()
  }, [tab])

  // Búsqueda debounced de tubos
  useEffect(() => {
    if (!tuboBusq.trim()) { setTuboSugs([]); return }
    const t = setTimeout(async () => {
      setTuboBuscando(true)
      try {
        const r = await api.get(`/tubos?q=${encodeURIComponent(tuboBusq)}&limit=8`)
        setTuboSugs(r.data.tubos || [])
      } catch { setTuboSugs([]) } finally { setTuboBuscando(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [tuboBusq])

  // Cerrar dropdown al hacer clic afuera
  useEffect(() => {
    const handler = e => {
      if (busqRef.current && !busqRef.current.contains(e.target)) setTuboSugs([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Inicializar mapa picker cuando se abre
  useEffect(() => {
    if (!mapaPickerAbierto) {
      // Destruir al cerrar
      if (mapaPickerInstance.current) {
        mapaPickerInstance.current.map.remove()
        mapaPickerInstance.current = null
      }
      return
    }
    if (!mapaPickerRef.current || mapaPickerInstance.current) return

    const lat = form.latitud ?? -25.2867
    const lng = form.longitud ?? -57.6474
    const zoom = form.latitud ? 15 : 12

    const map = L.map(mapaPickerRef.current).setView([lat, lng], zoom)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    }).addTo(map)

    let marker = null
    if (form.latitud && form.longitud) {
      marker = L.marker([form.latitud, form.longitud]).addTo(map)
    }

    map.on('click', e => {
      const { lat: la, lng: lo } = e.latlng
      const latR = parseFloat(la.toFixed(6))
      const lngR = parseFloat(lo.toFixed(6))
      if (marker) marker.setLatLng([latR, lngR])
      else {
        marker = L.marker([latR, lngR]).addTo(map)
        mapaPickerInstance.current.marker = marker
      }
      setForm(f => ({ ...f, latitud: latR, longitud: lngR }))
    })

    mapaPickerInstance.current = { map, marker }
  }, [mapaPickerAbierto])

  // Inicializar mapa historial cuando se abre
  useEffect(() => {
    if (!mapaHistAbierto) {
      if (mapaHistInstance.current) {
        mapaHistInstance.current.remove()
        mapaHistInstance.current = null
      }
      return
    }
    if (!mapaHistRef.current || mapaHistInstance.current) return

    const conCoords = entregas.filter(e => e.latitud && e.longitud)
    const center = conCoords.length > 0
      ? [conCoords[0].latitud, conCoords[0].longitud]
      : [-25.2867, -57.6474]

    const map = L.map(mapaHistRef.current).setView(center, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    }).addTo(map)

    conCoords.forEach(e => {
      const popup = `
        <div style="font-family:sans-serif;font-size:13px;min-width:160px">
          <b style="color:#1A5FA8">${e.numero}</b><br/>
          <b>${e.cliente?.nombre}</b><br/>
          <span style="color:#52525B">${e.direccionEntrega}</span><br/>
          <small style="color:#A1A1AA">${new Date(e.fechaEntrega).toLocaleDateString('es-PY')}</small><br/>
          <a href="https://www.google.com/maps?q=${e.latitud},${e.longitud}" target="_blank"
             style="color:#1A5FA8;font-size:12px">Abrir en Google Maps ↗</a>
        </div>`
      L.marker([e.latitud, e.longitud]).addTo(map).bindPopup(popup)
    })

    if (conCoords.length > 1) {
      const bounds = L.latLngBounds(conCoords.map(e => [e.latitud, e.longitud]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }

    mapaHistInstance.current = map
  }, [mapaHistAbierto, entregas])

  async function loadEntregas() {
    setLoadingH(true)
    try {
      const r = await api.get('/entregas')
      setEntregas(r.data.entregas)
    } catch { } finally { setLoadingH(false) }
  }

  async function agregarTubo(id) {
    if (form.tubosIds.includes(id)) return toast('El tubo ya está en la lista')
    try {
      const r = await api.get(`/tubos/${id}`)
      if (!['DISPONIBLE', 'CARGADO', 'RESERVADO'].includes(r.data.estado)) {
        return toast(`Tubo en estado ${r.data.estado}, no disponible para entrega`, 'error')
      }
      setForm(f => ({ ...f, tubosIds: [...f.tubosIds, id] }))
      setTuboSugs([])
      setTuboBusq('')
    } catch { toast('Tubo no encontrado', 'error') }
  }

  function quitarTubo(id) {
    setForm(f => ({ ...f, tubosIds: f.tubosIds.filter(x => x !== id) }))
  }

  function handleGPS() {
    if (!navigator.geolocation) return toast('Geolocalización no disponible en este navegador', 'error')
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6))
        const lng = parseFloat(pos.coords.longitude.toFixed(6))
        setForm(f => ({ ...f, latitud: lat, longitud: lng }))
        setGpsLoading(false)
        toast('Ubicación GPS obtenida', 'success')
        // Actualizar mapa si está abierto
        if (mapaPickerInstance.current) {
          const { map, marker } = mapaPickerInstance.current
          if (marker) marker.setLatLng([lat, lng])
          else {
            const m = L.marker([lat, lng]).addTo(map)
            mapaPickerInstance.current.marker = m
          }
          map.setView([lat, lng], 16)
        }
      },
      err => {
        setGpsLoading(false)
        toast('No se pudo obtener la ubicación: ' + err.message, 'error')
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.clienteId) return toast('Seleccioná un cliente', 'error')
    if (form.tubosIds.length === 0) return toast('Agregá al menos un tubo', 'error')
    if (form.tipoOperacion === 'ALQUILER' && !form.fechaVencimiento) {
      return toast('Ingresá la fecha de vencimiento del alquiler', 'error')
    }
    setSaving(true)
    try {
      await api.post('/entregas', {
        ...form,
        repartidorId:     form.repartidorId || undefined,
        fechaVencimiento: form.fechaVencimiento ? new Date(form.fechaVencimiento).toISOString() : undefined,
        referencia:       form.referencia || undefined,
        latitud:          form.latitud ?? undefined,
        longitud:         form.longitud ?? undefined,
      })
      toast('Entrega registrada correctamente', 'success')
      setForm(EMPTY)
      setMapaPickerAbierto(false)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al registrar entrega', 'error')
    } finally { setSaving(false) }
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const clienteSeleccionado = clientes.find(c => c.id === form.clienteId)
  const entregasConCoords = entregas.filter(e => e.latitud && e.longitud)

  return (
    <>
      <PageHeader title="Entregas" subtitle="Registrar y consultar entregas de tubos" />
      <div className="app-content">
        <div className="tabs">
          <div className={`tab ${tab === 'nueva' ? 'active' : ''}`}     onClick={() => setTab('nueva')}>Nueva Entrega</div>
          <div className={`tab ${tab === 'historial' ? 'active' : ''}`} onClick={() => setTab('historial')}>Historial</div>
        </div>

        {/* ── NUEVA ENTREGA ─────────────────────────────────────────────────── */}
        {tab === 'nueva' && (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
              <div>
                {/* Datos de la entrega */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-title" style={{ marginBottom: 14 }}>Datos de la entrega</div>
                  <div className="form-grid">

                    <div className="form-group">
                      <label className="form-label">Cliente <span className="form-required">*</span></label>
                      <select value={form.clienteId} onChange={f('clienteId')} required>
                        <option value="">Seleccionar cliente...</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tipo de operación <span className="form-required">*</span></label>
                      <select value={form.tipoOperacion} onChange={f('tipoOperacion')}>
                        <option value="ENTREGA_SIMPLE">Entrega simple</option>
                        <option value="ALQUILER">Alquiler</option>
                        <option value="VENTA">Venta</option>
                      </select>
                    </div>

                    {/* Dirección + Geolocalización */}
                    <div className="form-group col-span-2">
                      <label className="form-label">Dirección de entrega <span className="form-required">*</span></label>
                      <input value={form.direccionEntrega} onChange={f('direccionEntrega')}
                        placeholder={clienteSeleccionado?.direccion || 'Calle, ciudad...'} required />

                      {/* Controles de ubicación */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
                        <button type="button" className="btn btn-sm" onClick={handleGPS} disabled={gpsLoading}
                          style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <i className="ti ti-current-location" style={{ fontSize: 14 }} />
                          {gpsLoading ? 'Obteniendo GPS...' : 'Usar mi GPS'}
                        </button>
                        <button type="button" className="btn btn-sm"
                          onClick={() => setMapaPickerAbierto(v => !v)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <i className="ti ti-map-pin" style={{ fontSize: 14 }} />
                          {mapaPickerAbierto ? 'Ocultar mapa' : 'Fijar en mapa'}
                        </button>
                        {form.latitud && form.longitud && (
                          <>
                            <span style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="ti ti-circle-check" />
                              {form.latitud.toFixed(5)}, {form.longitud.toFixed(5)}
                            </span>
                            <a href={`https://www.google.com/maps?q=${form.latitud},${form.longitud}`}
                              target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'underline' }}>
                              Ver en Google Maps ↗
                            </a>
                            <button type="button"
                              onClick={() => setForm(f => ({ ...f, latitud: null, longitud: null }))}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                color: 'var(--text-muted)', fontSize: 13, lineHeight: 1 }}>
                              <i className="ti ti-x" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Mapa picker (Leaflet) */}
                    {mapaPickerAbierto && (
                      <div className="form-group col-span-2">
                        <div ref={mapaPickerRef}
                          style={{ height: 300, borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }} />
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                          <i className="ti ti-hand-click" style={{ marginRight: 4 }} />
                          Hacé clic en el mapa para fijar el punto de entrega. Podés combinar dirección de texto + coordenadas.
                        </p>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">Repartidor</label>
                      <select value={form.repartidorId} onChange={f('repartidorId')}>
                        <option value="">Sin asignar</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                      </select>
                    </div>
                    {form.tipoOperacion === 'ALQUILER' && (
                      <div className="form-group">
                        <label className="form-label">Fecha vencimiento alquiler <span className="form-required">*</span></label>
                        <input type="date" value={form.fechaVencimiento} onChange={f('fechaVencimiento')} required />
                      </div>
                    )}
                    {form.tipoOperacion === 'VENTA' && (
                      <div className="form-group">
                        <label className="form-label">Referencia (factura, orden)</label>
                        <input value={form.referencia} onChange={f('referencia')} placeholder="FAC-001" />
                      </div>
                    )}
                    <div className="form-group col-span-2">
                      <label className="form-label">Observaciones</label>
                      <textarea value={form.observaciones} onChange={f('observaciones')} style={{ height: 56 }} />
                    </div>
                  </div>
                </div>

                {/* Agregar tubos — búsqueda mejorada */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Tubos a entregar</div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{form.tubosIds.length} seleccionados</span>
                  </div>

                  <div ref={busqRef} style={{ position: 'relative', marginBottom: 12 }}>
                    <div style={{ position: 'relative' }}>
                      <i className="ti ti-search" style={{
                        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--text-muted)', fontSize: 14, pointerEvents: 'none',
                      }} />
                      <input
                        style={{ paddingLeft: 32 }}
                        placeholder="Buscar por código, gas o serie… (ej: TUBO-0001, CO2, Argon)"
                        value={tuboBusq}
                        onChange={e => setTuboBusq(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Escape') { setTuboSugs([]); setTuboBusq('') }
                        }}
                      />
                      {tuboBuscando && (
                        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          fontSize: 11, color: 'var(--text-muted)' }}>
                          Buscando…
                        </span>
                      )}
                    </div>

                    {/* Dropdown de sugerencias */}
                    {(tuboSugs.length > 0 || (tuboBusq.trim() && !tuboBuscando)) && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.10)',
                        zIndex: 200, maxHeight: 300, overflowY: 'auto',
                      }}>
                        {tuboSugs.length === 0 && tuboBusq.trim() && (
                          <div style={{ padding: '14px 12px', textAlign: 'center',
                            color: 'var(--text-muted)', fontSize: 12 }}>
                            <i className="ti ti-cylinder" style={{ display: 'block', fontSize: 22, marginBottom: 4 }} />
                            Sin resultados para «{tuboBusq}»
                          </div>
                        )}
                        {tuboSugs.map((t, i) => {
                          const yaAgregado = form.tubosIds.includes(t.id)
                          const disponible = ['DISPONIBLE', 'CARGADO', 'RESERVADO'].includes(t.estado)
                          return (
                            <div key={t.id}
                              onClick={() => !yaAgregado && disponible && agregarTubo(t.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 12px',
                                cursor: yaAgregado || !disponible ? 'not-allowed' : 'pointer',
                                opacity: yaAgregado || !disponible ? 0.5 : 1,
                                borderBottom: i < tuboSugs.length - 1 ? '1px solid var(--border)' : 'none',
                                background: 'transparent',
                                transition: 'background .12s',
                              }}
                              onMouseEnter={e => { if (!yaAgregado && disponible) e.currentTarget.style.background = 'var(--surface-2)' }}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <GasDot gas={t.gas} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{t.id}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {t.gas} · {t.capacidadLitros}L
                                  {t.cliente ? <span style={{ color: 'var(--text-muted)' }}> · {t.cliente.nombre}</span> : ''}
                                </div>
                              </div>
                              <StateBadge estado={t.estado} />
                              {yaAgregado && (
                                <span style={{ fontSize: 10, color: 'var(--green)', whiteSpace: 'nowrap' }}>Ya agregado</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {form.tubosIds.length === 0 ? (
                    <div style={{ border: '1px dashed var(--border-mid)', borderRadius: 8,
                      padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      <i className="ti ti-cylinder" style={{ fontSize: 24, display: 'block', marginBottom: 6 }} />
                      Buscá tubos por código, gas o serie y agregálos aquí
                    </div>
                  ) : (
                    form.tubosIds.map(tuboId => (
                      <TuboChip key={tuboId} tuboId={tuboId} onRemove={quitarTubo} />
                    ))
                  )}
                </div>
              </div>

              {/* Resumen lateral */}
              <div>
                <div className="card" style={{ position: 'sticky', top: 'calc(var(--header-h) + 20px)' }}>
                  <div className="card-title" style={{ marginBottom: 14 }}>Resumen</div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>CLIENTE</div>
                    <div style={{ fontWeight: 600 }}>{clienteSeleccionado?.nombre || '—'}</div>
                    {clienteSeleccionado && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{clienteSeleccionado.telefono}</div>}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>TIPO</div>
                    <div style={{ fontWeight: 600 }}>{form.tipoOperacion.replace('_', ' ')}</div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>TUBOS</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--blue)' }}>{form.tubosIds.length}</div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>UBICACIÓN</div>
                    {form.latitud && form.longitud ? (
                      <a href={`https://www.google.com/maps?q=${form.latitud},${form.longitud}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <i className="ti ti-map-pin" style={{ color: 'var(--green)' }} />
                        {form.latitud.toFixed(4)}, {form.longitud.toFixed(4)}
                      </a>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin coordenadas</span>
                    )}
                  </div>
                  <div className="alert alert-info" style={{ fontSize: 11 }}>
                    <i className="ti ti-info-circle" />
                    Al confirmar, los tubos cambiarán de estado automáticamente.
                  </div>
                  <button type="submit" className="btn btn-primary"
                    style={{ width: '100%', marginTop: 4 }}
                    disabled={saving || form.tubosIds.length === 0}>
                    {saving ? 'Registrando...' : <><i className="ti ti-check" /> Confirmar entrega</>}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* ── HISTORIAL ─────────────────────────────────────────────────────── */}
        {tab === 'historial' && (
          loadingH ? <Spinner /> : (
            <div>
              {/* Botón mapa historial */}
              {entregasConCoords.length > 0 && (
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setMapaHistAbierto(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-map" />
                    {mapaHistAbierto
                      ? 'Ocultar mapa'
                      : `Ver mapa (${entregasConCoords.length} ubicaciones)`}
                  </button>
                </div>
              )}

              {/* Mapa de historial */}
              {mapaHistAbierto && (
                <div className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
                  <div ref={mapaHistRef} style={{ height: 380 }} />
                </div>
              )}

              {/* Tabla */}
              <div className="card" style={{ padding: 0 }}>
                {entregas.length === 0
                  ? <EmptyState icon="ti-truck-delivery" message="Sin entregas registradas" />
                  : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Nro</th>
                            <th>Cliente</th>
                            <th>Tipo</th>
                            <th>Dirección</th>
                            <th>Ubic.</th>
                            <th>Tubos</th>
                            <th>Repartidor</th>
                            <th>Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entregas.map(e => (
                            <tr key={e.id}>
                              <td className="td-code">{e.numero}</td>
                              <td style={{ fontWeight: 500 }}>{e.cliente?.nombre}</td>
                              <td>
                                <span className={`badge badge-${e.tipoOperacion === 'ALQUILER' ? 'ALQUILADO' : e.tipoOperacion === 'VENTA' ? 'VENDIDO' : 'ENTREGADO'}`}>
                                  {e.tipoOperacion.replace('_', ' ')}
                                </span>
                              </td>
                              <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 180,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {e.direccionEntrega}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {e.latitud && e.longitud ? (
                                  <a href={`https://www.google.com/maps?q=${e.latitud},${e.longitud}`}
                                    target="_blank" rel="noopener noreferrer"
                                    title={`${e.latitud.toFixed(5)}, ${e.longitud.toFixed(5)}`}
                                    style={{ color: 'var(--blue)', fontSize: 16 }}>
                                    <i className="ti ti-map-pin" />
                                  </a>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>
                                )}
                              </td>
                              <td>{e.detalles?.length ?? 0}</td>
                              <td style={{ color: 'var(--text-secondary)' }}>{e.repartidor?.nombre || '—'}</td>
                              <td style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                                {new Date(e.fechaEntrega).toLocaleDateString('es-PY')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            </div>
          )
        )}
      </div>
    </>
  )
}

function TuboChip({ tuboId, onRemove }) {
  const [tubo, setTubo] = useState(null)
  useEffect(() => {
    api.get(`/tubos/${tuboId}`).then(r => setTubo(r.data)).catch(() => {})
  }, [tuboId])
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', background: 'var(--surface-2)',
      borderRadius: 8, marginBottom: 6, fontSize: 12,
    }}>
      {tubo && <GasDot gas={tubo.gas} />}
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--blue)' }}>{tuboId}</span>
      {tubo && <><span style={{ color: 'var(--text-secondary)' }}>{tubo.gas}</span><StateBadge estado={tubo.estado} /></>}
      <button type="button" className="btn-icon" style={{ marginLeft: 'auto' }} onClick={() => onRemove(tuboId)}>
        <i className="ti ti-x" />
      </button>
    </div>
  )
}
