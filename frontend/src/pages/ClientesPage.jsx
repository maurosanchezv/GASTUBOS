// gastubos/frontend/src/pages/ClientesPage.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner, EmptyState, TipoBadge } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

const EMPTY = {
  nombre: '',
  ruc: '',
  telefono: '',
  direccion: '',
  latitud: null,
  longitud: null,
  contacto: '',
  tipo: 'EMPRESA'
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [q, setQ]               = useState('')
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [detalle, setDetalle]   = useState(null)
  const { toast }               = useToast()

  // Búsqueda de dirección + mapa
  const [addrSugs, setAddrSugs] = useState([])
  const [addrBuscando, setAddrBuscando] = useState(false)
  const addrRef = useRef(null)
  const lastSelectedAddress = useRef('')
  const mapRef = useRef(null)
  const mapInstance = useRef(null) // { map, marker }
  const [gpsLoading, setGpsLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/clientes', { params: { q: q || undefined } })
      setClientes(r.data)
    } catch { }
    finally { setLoading(false) }
  }, [q])

  useEffect(() => { load() }, [load])

  // Autocompletar dirección con Photon + Nominatim
  const fetchDirecciones = async (query) => {
    if (!query || query.trim().length < 2) {
      setAddrSugs([])
      return
    }
    setAddrBuscando(true)
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=-25.2867&lon=-57.6474&limit=6`
      const resPhoton = await fetch(photonUrl)
      const dataPhoton = await resPhoton.json()
      
      let sugs = []
      if (dataPhoton && dataPhoton.features && dataPhoton.features.length > 0) {
        sugs = dataPhoton.features.map(f => {
          const p = f.properties || {}
          const coords = f.geometry?.coordinates || []
          const nameParts = [p.name, p.street, p.housing, p.district, p.city || p.town || p.county, p.state || p.country]
            .filter(Boolean)
          const name = Array.from(new Set(nameParts)).join(', ')
          return {
            display_name: name || p.name || query,
            lat: coords[1],
            lon: coords[0],
          }
        }).filter(item => item.lat && item.lon)
      }

      if (sugs.length < 3) {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=py&viewbox=-58.5,-27.5,-54.0,-19.3`
        const resNom = await fetch(nomUrl, { headers: { 'Accept-Language': 'es' } })
        const dataNom = await resNom.json()
        if (dataNom && Array.isArray(dataNom)) {
          const nomSugs = dataNom.map(item => ({
            display_name: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
          }))
          for (const ns of nomSugs) {
            if (!sugs.some(s => s.display_name === ns.display_name)) {
              sugs.push(ns)
            }
          }
        }
      }

      setAddrSugs(sugs.slice(0, 6))
    } catch {
      setAddrSugs([])
    } finally {
      setAddrBuscando(false)
    }
  }

  // Debounce dirección
  useEffect(() => {
    const dir = form.direccion || ''
    if (dir === lastSelectedAddress.current || dir.trim().length < 2) {
      setAddrSugs([])
      return
    }
    const t = setTimeout(() => {
      fetchDirecciones(dir)
    }, 300)
    return () => clearTimeout(t)
  }, [form.direccion])

  // Reverse geocoding para actualizar texto al hacer clic en mapa
  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`)
      const data = await res.json()
      if (data.display_name) {
        lastSelectedAddress.current = data.display_name
        setForm(f => ({ ...f, direccion: data.display_name }))
      }
    } catch { }
  }

  // Inicializar o destruir el mini mapa Leaflet en el modal
  useEffect(() => {
    if (!modal) {
      if (mapInstance.current) {
        mapInstance.current.map.remove()
        mapInstance.current = null
      }
      return
    }

    const timer = setTimeout(() => {
      if (!mapRef.current) return
      const lat = form.latitud ?? -25.2867
      const lng = form.longitud ?? -57.6474
      const zoom = (form.latitud && form.longitud) ? 15 : 12

      if (mapInstance.current) {
        mapInstance.current.map.setView([lat, lng], zoom)
        if (form.latitud && form.longitud) {
          if (mapInstance.current.marker) {
            mapInstance.current.marker.setLatLng([lat, lng])
          } else {
            mapInstance.current.marker = L.marker([lat, lng], { draggable: true }).addTo(mapInstance.current.map)
          }
        }
        return
      }

      const map = L.map(mapRef.current).setView([lat, lng], zoom)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map)

      let marker = null
      if (form.latitud && form.longitud) {
        marker = L.marker([form.latitud, form.longitud], { draggable: true }).addTo(map)
        marker.on('dragend', e => {
          const { lat: la, lng: lo } = e.target.getLatLng()
          const latR = parseFloat(la.toFixed(6))
          const lngR = parseFloat(lo.toFixed(6))
          setForm(f => ({ ...f, latitud: latR, longitud: lngR }))
          reverseGeocode(latR, lngR)
        })
      }

      map.on('click', e => {
        const { lat: la, lng: lo } = e.latlng
        const latR = parseFloat(la.toFixed(6))
        const lngR = parseFloat(lo.toFixed(6))
        if (marker) {
          marker.setLatLng([latR, lngR])
        } else {
          marker = L.marker([latR, lngR], { draggable: true }).addTo(map)
          marker.on('dragend', ev => {
            const { lat: dragLa, lng: dragLo } = ev.target.getLatLng()
            const latD = parseFloat(dragLa.toFixed(6))
            const lngD = parseFloat(dragLo.toFixed(6))
            setForm(f => ({ ...f, latitud: latD, longitud: lngD }))
            reverseGeocode(latD, lngD)
          })
        }
        mapInstance.current.marker = marker
        setForm(f => ({ ...f, latitud: latR, longitud: lngR }))
        reverseGeocode(latR, lngR)
      })

      mapInstance.current = { map, marker }
    }, 150)

    return () => clearTimeout(timer)
  }, [modal])

  // Obtener ubicación GPS actual
  const obtenerGPS = () => {
    if (!navigator.geolocation) {
      toast('Tu navegador no soporta geolocalización', 'error')
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const latR = parseFloat(pos.coords.latitude.toFixed(6))
        const lngR = parseFloat(pos.coords.longitude.toFixed(6))
        setForm(f => ({ ...f, latitud: latR, longitud: lngR }))
        if (mapInstance.current) {
          mapInstance.current.map.setView([latR, lngR], 16)
          if (mapInstance.current.marker) {
            mapInstance.current.marker.setLatLng([latR, lngR])
          } else {
            const m = L.marker([latR, lngR], { draggable: true }).addTo(mapInstance.current.map)
            mapInstance.current.marker = m
          }
        }
        reverseGeocode(latR, lngR)
        setGpsLoading(false)
        toast('Ubicación GPS fijada', 'success')
      },
      () => {
        toast('No se pudo obtener la ubicación GPS', 'error')
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        latitud: form.latitud ? Number(form.latitud) : null,
        longitud: form.longitud ? Number(form.longitud) : null,
      }
      if (form.id) await api.patch(`/clientes/${form.id}`, payload)
      else await api.post('/clientes', payload)
      toast(`Cliente ${form.id ? 'actualizado' : 'creado'}`, 'success')
      setModal(false)
      setForm(EMPTY)
      load()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al guardar cliente', 'error')
    } finally {
      setSaving(false)
    }
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const seleccionarSugerencia = item => {
    lastSelectedAddress.current = item.display_name
    setForm(f => ({
      ...f,
      direccion: item.display_name,
      latitud: item.lat,
      longitud: item.lon,
    }))
    setAddrSugs([])
    if (mapInstance.current) {
      mapInstance.current.map.setView([item.lat, item.lon], 16)
      if (mapInstance.current.marker) {
        mapInstance.current.marker.setLatLng([item.lat, item.lon])
      } else {
        const m = L.marker([item.lat, item.lon], { draggable: true }).addTo(mapInstance.current.map)
        mapInstance.current.marker = m
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${clientes.length} clientes registrados`}
        actions={<button className="btn btn-sm btn-primary" onClick={() => { setForm(EMPTY); setModal(true) }}><i className="ti ti-plus" /> Nuevo Cliente</button>}
      />
      <div className="app-content">
        <div className="search-bar">
          <i className="ti ti-search" />
          <input placeholder="Buscar por nombre, RUC..." value={q} onChange={e => setQ(e.target.value)} />
          {q && <button className="btn-icon" onClick={() => setQ('')}><i className="ti ti-x" /></button>}
        </div>

        {loading ? <Spinner /> : (
          <>
            {/* VISTA TABLE (Desktop) */}
            <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
              {clientes.length === 0 ? <EmptyState icon="ti-users" message="Sin clientes registrados" /> : (
                <table>
                  <thead><tr><th>Nombre</th><th>RUC / CI</th><th>Teléfono</th><th>Ubicación GPS</th><th>Tipo</th><th>Tubos</th><th></th></tr></thead>
                  <tbody>
                    {clientes.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                        <td className="td-code">{c.ruc}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{c.telefono || '—'}</td>
                        <td>
                          {c.latitud && c.longitud ? (
                            <a
                              href={`https://www.google.com/maps?q=${c.latitud},${c.longitud}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}
                            >
                              <i className="ti ti-map-pin" /> Fijada
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin GPS</span>
                          )}
                        </td>
                        <td><TipoBadge tipo={c.tipo} /></td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{c._count?.tubos ?? 0}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 3 }}>tubos</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" title="Ver detalle" onClick={() => setDetalle(c)}>
                              <i className="ti ti-eye" />
                            </button>
                            <button className="btn-icon" title="Editar" onClick={() => { setForm(c); setModal(true) }}>
                              <i className="ti ti-edit" />
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
              {clientes.length === 0 ? (
                <EmptyState icon="ti-users" message="Sin resultados" />
              ) : (
                clientes.map(c => (
                  <div key={c.id} className="list-card">
                    <div className="list-card-header">
                      <div className="list-card-title" style={{ fontFamily: 'inherit', color: 'inherit' }}>{c.nombre}</div>
                      <TipoBadge tipo={c.tipo} />
                    </div>
                    <div className="list-card-body">
                      <div className="list-card-item">
                        <span className="list-card-label">RUC / CI</span>
                        <span className="list-card-value td-code">{c.ruc}</span>
                      </div>
                      <div className="list-card-item">
                        <span className="list-card-label">Teléfono</span>
                        <span className="list-card-value">{c.telefono || '—'}</span>
                      </div>
                      <div className="list-card-item col-span-2">
                        <span className="list-card-label">Ubicación GPS</span>
                        <span className="list-card-value">
                          {c.latitud && c.longitud ? (
                            <a
                              href={`https://www.google.com/maps?q=${c.latitud},${c.longitud}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}
                            >
                              <i className="ti ti-map-pin" /> GPS Fijado ({c.latitud.toFixed(4)}, {c.longitud.toFixed(4)})
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin coordenadas asignadas</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="list-card-actions">
                      <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setDetalle(c)}>
                        <i className="ti ti-eye" /> Detalle
                      </button>
                      <button className="btn btn-sm" onClick={() => { setForm(c); setModal(true) }}>
                        <i className="ti ti-edit" /> Editar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal crear/editar */}
      <Modal
        open={modal}
        title={form.id ? `Editar: ${form.nombre}` : 'Nuevo Cliente'}
        onClose={() => setModal(false)}
        width={560}
        footer={
          <>
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : <><i className="ti ti-device-floppy" /> Guardar Cliente</>}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <FormGroup label="Nombre / Razón social" required>
            <input value={form.nombre} onChange={f('nombre')} placeholder="Empresa SA..." required />
          </FormGroup>
          <FormGroup label="RUC o CI" required>
            <input value={form.ruc} onChange={f('ruc')} placeholder="80012345-1" required />
          </FormGroup>
          <FormGroup label="Tipo de cliente">
            <select value={form.tipo} onChange={f('tipo')}>
              <option value="EMPRESA">Empresa</option>
              <option value="PYME">Pyme</option>
              <option value="PARTICULAR">Particular</option>
            </select>
          </FormGroup>
          <FormGroup label="Teléfono">
            <input value={form.telefono || ''} onChange={f('telefono')} placeholder="021-555-0000" />
          </FormGroup>
          <FormGroup label="Contacto principal">
            <input value={form.contacto || ''} onChange={f('contacto')} placeholder="Nombre del contacto" />
          </FormGroup>

          {/* Dirección y Mini Mapa */}
          <div className="form-group col-span-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label className="form-label" style={{ margin: 0 }}>Dirección y Ubicación GPS</label>
              <button
                type="button"
                className="btn btn-sm"
                onClick={obtenerGPS}
                disabled={gpsLoading}
                style={{ fontSize: 11, padding: '2px 8px', height: 'auto', background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <i className={`ti ${gpsLoading ? 'ti-spin ti-refresh' : 'ti-current-location'}`} style={{ color: 'var(--blue)' }} /> Mi Ubicación GPS
              </button>
            </div>
            <div ref={addrRef} style={{ position: 'relative' }}>
              <input
                type="text"
                value={form.direccion || ''}
                onChange={f('direccion')}
                placeholder="Ej: Av. San Martín, Asunción..."
                style={{ paddingRight: addrBuscando ? '30px' : '10px' }}
              />
              {addrBuscando && (
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                </div>
              )}

              {addrSugs.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  zIndex: 1000, background: 'var(--bg-card, #fff)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)', marginTop: 4,
                  maxHeight: 220, overflowY: 'auto'
                }}>
                  {addrSugs.map((item, i) => (
                    <div
                      key={i}
                      onClick={() => seleccionarSugerencia(item)}
                      style={{
                        padding: '9px 12px', cursor: 'pointer',
                        borderBottom: i < addrSugs.length - 1 ? '1px solid var(--border-light, #eee)' : 'none',
                        fontSize: 12, color: 'var(--text)', display: 'flex', gap: 8, alignItems: 'flex-start'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2, #f5f5f5)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <i className="ti ti-map-pin" style={{ color: 'var(--blue)', marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{item.display_name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>GPS: ({item.lat.toFixed(4)}, {item.lon.toFixed(4)})</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mini Mapa Interactivo */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Haz clic en el mapa para ubicar la posición exacta del cliente:</span>
                {form.latitud && form.longitud && (
                  <span style={{ color: 'var(--blue)', fontWeight: 600 }}>
                    GPS: ({form.latitud}, {form.longitud})
                  </span>
                )}
              </div>
              <div ref={mapRef} style={{ width: '100%', height: 200, borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }} />
            </div>
          </div>
        </div>
      </Modal>

      {/* Detalle rápido */}
      {detalle && (
        <Modal open={true} title={detalle.nombre} onClose={() => setDetalle(null)}>
          <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            {[
              ['RUC/CI', detalle.ruc],
              ['Tipo', detalle.tipo],
              ['Teléfono', detalle.telefono || '—'],
              ['Contacto', detalle.contacto || '—'],
              ['Dirección', detalle.direccion || '—'],
              [
                'Coordenadas GPS',
                (detalle.latitud && detalle.longitud) ? (
                  <a
                    href={`https://www.google.com/maps?q=${detalle.latitud},${detalle.longitud}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--blue)', fontWeight: 600 }}
                  >
                    📍 {detalle.latitud}, {detalle.longitud} (Abrir en Maps)
                  </a>
                ) : '—'
              ]
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}
