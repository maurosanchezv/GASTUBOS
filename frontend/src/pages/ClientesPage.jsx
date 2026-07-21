// gastubos/frontend/src/pages/ClientesPage.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api.js'
import { PageHeader, Modal, FormGroup, Spinner, EmptyState, TipoBadge } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'
import MiniMapaPicker from '../components/MiniMapaPicker.jsx'

const EMPTY = {
  nombre: '',
  ruc: '',
  telefono: '',
  direccion: '',
  latitud: null,
  longitud: null,
  contacto: '',
  tipo: 'EMPRESA',
  sucursales: [],
}

const EMPTY_SUCURSAL = {
  nombre: '',
  direccion: '',
  ciudad: '',
  telefono: '',
  contacto: '',
  latitud: null,
  longitud: null,
  esPrincipal: false,
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

  // Modal para agregar/editar sucursal
  const [modalSucursal, setModalSucursal]   = useState(false)
  const [formSucursal, setFormSucursal]     = useState(EMPTY_SUCURSAL)
  const [savingSucursal, setSavingSucursal] = useState(false)

  // Búsqueda de dirección
  const [addrSugs, setAddrSugs]         = useState([])
  const [addrBuscando, setAddrBuscando] = useState(false)
  const addrRef = useRef(null)
  const lastSelectedAddress = useRef('')
  const [gpsLoading, setGpsLoading]     = useState(false)

  // Abrir modales reseteando sugerencias y guardando la dirección inicial
  const abrirModalCliente = (cData = EMPTY) => {
    lastSelectedAddress.current = cData.direccion || ''
    setAddrSugs([])
    setForm(cData)
    setModal(true)
  }

  const abrirModalSucursal = (sData = EMPTY_SUCURSAL) => {
    lastSelectedAddress.current = sData.direccion || ''
    setAddrSugs([])
    setFormSucursal(sData)
    setModalSucursal(true)
  }

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

  const targetForm = modalSucursal ? formSucursal : form
  const setTargetForm = modalSucursal ? setFormSucursal : setForm

  // Debounce dirección: Solo buscar si la dirección cambió manualmente y no es la precargada
  useEffect(() => {
    const dir = targetForm.direccion || ''
    if (!dir || dir === lastSelectedAddress.current || dir.trim().length < 2) {
      setAddrSugs([])
      return
    }
    const t = setTimeout(() => {
      fetchDirecciones(dir)
    }, 350)
    return () => clearTimeout(t)
  }, [targetForm.direccion, modalSucursal])

  // Obtener ubicación GPS actual
  const obtenerGPS = (isSucursal = false) => {
    if (!navigator.geolocation) {
      toast('Tu navegador no soporta geolocalización', 'error')
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const latR = parseFloat(pos.coords.latitude.toFixed(6))
        const lngR = parseFloat(pos.coords.longitude.toFixed(6))
        
        let addr = ''
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latR}&lon=${lngR}&zoom=18`)
          const data = await res.json()
          if (data.display_name) addr = data.display_name
        } catch {}

        if (isSucursal) {
          setFormSucursal(f => ({
            ...f,
            latitud: latR,
            longitud: lngR,
            ...(addr ? { direccion: addr } : {})
          }))
        } else {
          setForm(f => ({
            ...f,
            latitud: latR,
            longitud: lngR,
            ...(addr ? { direccion: addr } : {})
          }))
        }
        if (addr) lastSelectedAddress.current = addr
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

  // Guardar sucursal (para un cliente existente o borrador)
  const handleSaveSucursal = async (e) => {
    e.preventDefault()
    if (!formSucursal.nombre || !formSucursal.direccion) {
      toast('Ingresa nombre y dirección para la sucursal', 'error')
      return
    }

    setSavingSucursal(true)
    try {
      if (form.id) {
        if (formSucursal.id) {
          await api.patch(`/clientes/${form.id}/sucursales/${formSucursal.id}`, formSucursal)
          toast('Sucursal actualizada', 'success')
        } else {
          await api.post(`/clientes/${form.id}/sucursales`, formSucursal)
          toast('Sucursal agregada con éxito', 'success')
        }
        const r = await api.get(`/clientes/${form.id}`)
        setForm(r.data)
        load()
      } else {
        let sucs = [...(form.sucursales || [])]
        if (formSucursal.esPrincipal) {
          sucs = sucs.map(s => ({ ...s, esPrincipal: false }))
        }
        sucs.push({ ...formSucursal })
        setForm(f => ({ ...f, sucursales: sucs }))
        toast('Sucursal añadida a la lista', 'success')
      }
      setModalSucursal(false)
      setFormSucursal(EMPTY_SUCURSAL)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al guardar sucursal', 'error')
    } finally {
      setSavingSucursal(false)
    }
  }

  // Eliminar sucursal
  const handleEliminarSucursal = async (suc) => {
    if (!window.confirm(`¿Seguro que deseas eliminar la sucursal "${suc.nombre}"?`)) return
    try {
      if (form.id && suc.id) {
        await api.delete(`/clientes/${form.id}/sucursales/${suc.id}`)
        toast('Sucursal eliminada', 'success')
        const r = await api.get(`/clientes/${form.id}`)
        setForm(r.data)
        load()
      } else {
        setForm(f => ({
          ...f,
          sucursales: f.sucursales.filter(s => s !== suc)
        }))
      }
    } catch (err) {
      toast(err.response?.data?.error || 'Error al eliminar sucursal', 'error')
    }
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const fSuc = k => e => setFormSucursal(p => ({ ...p, [k]: e.target.value }))

  const seleccionarSugerencia = item => {
    lastSelectedAddress.current = item.display_name
    setTargetForm(f => ({
      ...f,
      direccion: item.display_name,
      latitud: item.lat,
      longitud: item.lon,
    }))
    setAddrSugs([])
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${clientes.length} clientes registrados`}
        actions={<button className="btn btn-sm btn-primary" onClick={() => abrirModalCliente(EMPTY)}><i className="ti ti-plus" /> Nuevo Cliente</button>}
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
                  <thead><tr><th>Nombre</th><th>RUC / CI</th><th>Teléfono</th><th>Locales / Sucursales</th><th>Tipo</th><th>Tubos</th><th></th></tr></thead>
                  <tbody>
                    {clientes.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                        <td className="td-code">{c.ruc}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{c.telefono || '—'}</td>
                        <td>
                          {c.sucursales && c.sucursales.length > 0 ? (
                            <span
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                                background: 'rgba(59, 130, 246, 0.1)', color: 'var(--blue)'
                              }}
                            >
                              <i className="ti ti-building-store" /> {c.sucursales.length} local{c.sucursales.length > 1 ? 'es' : ''}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>1 local (Matriz)</span>
                          )}
                        </td>
                        <td><TipoBadge tipo={c.tipo} /></td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{c._count?.tubos ?? 0}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 3 }}>tubos</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" title="Ver detalle y locales" onClick={() => setDetalle(c)}>
                              <i className="ti ti-eye" />
                            </button>
                            <button className="btn-icon" title="Editar" onClick={() => abrirModalCliente(c)}>
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
                        <span className="list-card-label">Locales / Sucursales</span>
                        <span className="list-card-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="ti ti-building-store" style={{ color: 'var(--blue)' }} />
                          {c.sucursales?.length || 1} registrado(s)
                        </span>
                      </div>
                    </div>
                    <div className="list-card-actions">
                      <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setDetalle(c)}>
                        <i className="ti ti-eye" /> Detalle / Locales
                      </button>
                      <button className="btn btn-sm" onClick={() => abrirModalCliente(c)}>
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

      {/* Modal crear/editar cliente */}
      <Modal
        open={modal}
        title={form.id ? `Editar Cliente: ${form.nombre}` : 'Nuevo Cliente'}
        onClose={() => setModal(false)}
        width={640}
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
          <FormGroup label="Teléfono central">
            <input value={form.telefono || ''} onChange={f('telefono')} placeholder="021-555-0000" />
          </FormGroup>
          <FormGroup label="Contacto principal">
            <input value={form.contacto || ''} onChange={f('contacto')} placeholder="Nombre del contacto" />
          </FormGroup>

          {/* Dirección Matriz y Ubicación GPS */}
          <div className="form-group col-span-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label className="form-label" style={{ margin: 0 }}>Dirección Matriz / Principal</label>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => obtenerGPS(false)}
                disabled={gpsLoading}
                style={{ fontSize: 11, padding: '2px 8px', height: 'auto', background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <i className={`ti ${gpsLoading ? 'ti-spin ti-refresh' : 'ti-current-location'}`} style={{ color: 'var(--blue)' }} /> GPS Actual
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

              {addrSugs.length > 0 && !modalSucursal && (
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
                <span>Haz clic o arrastra el marcador para fijar la ubicación GPS:</span>
                {form.latitud && form.longitud && (
                  <span style={{ color: 'var(--blue)', fontWeight: 600 }}>
                    GPS: ({form.latitud}, {form.longitud})
                  </span>
                )}
              </div>
              <MiniMapaPicker
                latitud={form.latitud}
                longitud={form.longitud}
                onChange={({ latitud, longitud, direccion }) => {
                  setForm(f => ({
                    ...f,
                    latitud,
                    longitud,
                    ...(direccion ? { direccion } : {})
                  }))
                  if (direccion) lastSelectedAddress.current = direccion
                }}
              />
            </div>
          </div>

          {/* Gestión de Sucursales / Locales Adicionales */}
          <div className="form-group col-span-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>Locales y Sucursales de Entrega</label>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Agrega tiendas o depósitos en distintas ciudades para este cliente.</div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => abrirModalSucursal({ ...EMPTY_SUCURSAL, esPrincipal: !(form.sucursales && form.sucursales.length > 0) })}
              >
                <i className="ti ti-plus" /> Agregar Sucursal / Local
              </button>
            </div>

            {form.sucursales && form.sucursales.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {form.sucursales.map((s, idx) => (
                  <div
                    key={s.id || idx}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8,
                      border: '1px solid var(--border)', fontSize: 12
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-building-store" style={{ color: 'var(--blue)' }} />
                        {s.nombre}
                        {s.esPrincipal && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--blue)', color: '#fff', fontWeight: 600 }}>
                            Principal
                          </span>
                        )}
                        {s.ciudad && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({s.ciudad})</span>}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>
                        📍 {s.direccion} {s.telefono ? `| 📞 ${s.telefono}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Editar sucursal"
                        onClick={() => abrirModalSucursal(s)}
                      >
                        <i className="ti ti-edit" />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Eliminar sucursal"
                        onClick={() => handleEliminarSucursal(s)}
                      >
                        <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                Si no agregas sucursales específicas, la dirección principal ingresada arriba se usará como sucursal "Casa Matriz".
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Sub-modal para Agregar / Editar Sucursal */}
      {modalSucursal && (
        <Modal
          open={true}
          title={formSucursal.id ? `Editar Sucursal: ${formSucursal.nombre}` : 'Nueva Sucursal / Local'}
          onClose={() => setModalSucursal(false)}
          width={540}
          footer={
            <>
              <button className="btn" onClick={() => setModalSucursal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveSucursal} disabled={savingSucursal}>
                {savingSucursal ? 'Guardando...' : <><i className="ti ti-check" /> Guardar Local</>}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <FormGroup label="Nombre del Local / Sucursal" required>
              <input
                value={formSucursal.nombre}
                onChange={fSuc('nombre')}
                placeholder="Ej: Sucursal San Lorenzo, Depósito Luque..."
                required
              />
            </FormGroup>
            <FormGroup label="Ciudad">
              <input
                value={formSucursal.ciudad || ''}
                onChange={fSuc('ciudad')}
                placeholder="Ej: San Lorenzo, Luque, Asunción..."
              />
            </FormGroup>
            <FormGroup label="Teléfono de la sucursal">
              <input
                value={formSucursal.telefono || ''}
                onChange={fSuc('telefono')}
                placeholder="021-555-1234"
              />
            </FormGroup>
            <FormGroup label="Contacto en la sucursal">
              <input
                value={formSucursal.contacto || ''}
                onChange={fSuc('contacto')}
                placeholder="Persona encargada en este local..."
              />
            </FormGroup>

            {/* Dirección de la sucursal */}
            <div className="form-group col-span-2">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="form-label" style={{ margin: 0 }}>Dirección exacta <span className="form-required">*</span></label>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => obtenerGPS(true)}
                  disabled={gpsLoading}
                  style={{ fontSize: 11, padding: '2px 8px', height: 'auto', background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <i className={`ti ${gpsLoading ? 'ti-spin ti-refresh' : 'ti-current-location'}`} style={{ color: 'var(--blue)' }} /> GPS Actual
                </button>
              </div>
              <div ref={addrRef} style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={formSucursal.direccion || ''}
                  onChange={fSuc('direccion')}
                  placeholder="Ej: Ruta 2 Km 14, San Lorenzo..."
                  required
                />
                {addrSugs.length > 0 && modalSucursal && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    zIndex: 1000, background: 'var(--bg-card, #fff)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)', marginTop: 4,
                    maxHeight: 180, overflowY: 'auto'
                  }}>
                    {addrSugs.map((item, i) => (
                      <div
                        key={i}
                        onClick={() => seleccionarSugerencia(item)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer',
                          borderBottom: i < addrSugs.length - 1 ? '1px solid var(--border-light, #eee)' : 'none',
                          fontSize: 12
                        }}
                      >
                        📍 {item.display_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Ubicación GPS del local en el mapa:</div>
                <MiniMapaPicker
                  latitud={formSucursal.latitud}
                  longitud={formSucursal.longitud}
                  onChange={({ latitud, longitud, direccion }) => {
                    setFormSucursal(f => ({
                      ...f,
                      latitud,
                      longitud,
                      ...(direccion ? { direccion } : {})
                    }))
                    if (direccion) lastSelectedAddress.current = direccion
                  }}
                />
              </div>
            </div>

            <div className="form-group col-span-2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={formSucursal.esPrincipal || false}
                  onChange={e => setFormSucursal(f => ({ ...f, esPrincipal: e.target.checked }))}
                />
                <strong>Marcar como Sucursal Principal / Matriz de este cliente</strong>
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Detalle de Cliente y sus Locales */}
      {detalle && (
        <Modal open={true} title={`Cliente: ${detalle.nombre}`} onClose={() => setDetalle(null)} width={600}>
          <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                ['RUC/CI', detalle.ruc],
                ['Tipo', detalle.tipo],
                ['Teléfono Central', detalle.telefono || '—'],
                ['Contacto Principal', detalle.contacto || '—'],
                ['Dirección General', detalle.direccion || '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-building-store" style={{ color: 'var(--blue)' }} />
                Locales y Sucursales ({detalle.sucursales?.length || 0})
              </div>

              {detalle.sucursales && detalle.sucursales.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {detalle.sucursales.map(s => (
                    <div
                      key={s.id}
                      style={{
                        padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8,
                        border: '1px solid var(--border)', fontSize: 12
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <strong style={{ fontSize: 13, color: 'var(--blue)' }}>
                          {s.nombre} {s.esPrincipal ? '(Matriz)' : ''}
                        </strong>
                        {s.ciudad && <span style={{ fontSize: 11, background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 4 }}>{s.ciudad}</span>}
                      </div>
                      <div style={{ color: 'var(--text-secondary)' }}>📍 {s.direccion}</div>
                      {(s.contacto || s.telefono) && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          {s.contacto ? `👤 ${s.contacto} ` : ''}
                          {s.telefono ? `📞 ${s.telefono}` : ''}
                        </div>
                      )}
                      {s.latitud && s.longitud && (
                        <div style={{ marginTop: 6 }}>
                          <a
                            href={`https://www.google.com/maps?q=${s.latitud},${s.longitud}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <i className="ti ti-map-pin" /> Abrir Ubicación GPS en Google Maps
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Sin sucursales adicionales registradas.
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
