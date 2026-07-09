// gastubos/frontend/src/pages/DevolucionesPage.jsx
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import api from '../services/api.js'
import { useAuthStore } from '../store/authStore.js'
import { PageHeader, StateBadge, GasDot, Spinner, Modal } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

export default function DevolucionesPage() {
  const { user } = useAuthStore()
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768)
  const [pendientesAbierto, setPendientesAbierto] = useState(window.innerWidth > 768)
  const [tuboId,  setTuboId]  = useState('')
  const [tubo,    setTubo]    = useState(null)
  const [estado,  setEstado]  = useState('DEVUELTO')
  const [obs,     setObs]     = useState('')
  const [saving,  setSaving]  = useState(false)
  
  // Búsqueda con sugerencias
  const [tuboBusq, setTuboBusq] = useState('')
  const [tuboSugs, setTuboSugs] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [mostrarSugs, setMostrarSugs] = useState(false)
  const busqRef = useRef(null)

  // Scanner
  const [escaneando, setEscaneando] = useState(false)
  const scannerRef = useRef(null) // Instancia del scanner
  const scannerId  = 'qr-reader-devoluciones'

  const [pendientes, setPendientes] = useState([])
  const [params]  = useSearchParams()
  const { toast } = useToast()

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current = null
      } catch (err) { console.error('Error stopping scanner', err) }
    }
    setEscaneando(false)
  }

  const startScanner = async () => {
    setEscaneando(true)
    setTimeout(() => {
      const scanner = new Html5Qrcode(scannerId)
      scannerRef.current = scanner
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          // Extraer ID del tubo de la URL o texto directo
          // Formato esperado: .../tubos/TUBO-000001
          let id = text
          if (text.includes('/tubos/')) {
            id = text.split('/tubos/')[1].split('?')[0].split('/')[0]
          }
          setTuboBusq(id)
          buscarPorId(id)
          stopScanner()
          toast('Código QR detectado', 'success')
        },
        () => {}
      ).catch(err => {
        toast('Error al abrir cámara: ' + err, 'error')
        setEscaneando(false)
      })
    }, 100)
  }

  useEffect(() => {
    return () => { if (scannerRef.current) stopScanner() }
  }, [])

  const fetchSugerencias = async (q = '') => {
    setBuscando(true)
    try {
      // Para devoluciones, buscamos tubos que NO estén disponibles (estén en clientes)
      // O simplemente usamos la búsqueda general pero filtramos por estados lógicos
      const r = await api.get(`/tubos?q=${encodeURIComponent(q)}&limit=15`)
      // Filtrar los que se pueden devolver
      const filtrados = (r.data.tubos || []).filter(t => 
        ['ENTREGADO', 'ALQUILADO', 'VENDIDO'].includes(t.estado)
      )
      setTuboSugs(filtrados)
    } catch { setTuboSugs([]) } finally { setBuscando(false) }
  }

  useEffect(() => {
    api.get('/tubos', { params: { estado: 'ENTREGADO', limit: 50 } }).then(r => setPendientes(r.data.tubos)).catch(() => {})
    api.get('/tubos', { params: { estado: 'ALQUILADO', limit: 50 } }).then(r => setPendientes(p => [...p, ...r.data.tubos])).catch(() => {})
    if (params.get('tubo')) { 
      const id = params.get('tubo')
      setTuboBusq(id)
      buscarPorId(id) 
    }
  }, [])

  // Escuchar cambio de tamaño de pantalla para adaptar plegado
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768
      setEsMovil(mobile)
      if (!mobile) {
        setPendientesAbierto(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Cerrar dropdown al hacer clic afuera
  useEffect(() => {
    const handler = e => {
      if (busqRef.current && !busqRef.current.contains(e.target)) setMostrarSugs(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounce para búsqueda
  useEffect(() => {
    if (!mostrarSugs) return
    const t = setTimeout(() => {
      fetchSugerencias(tuboBusq)
    }, 300)
    return () => clearTimeout(t)
  }, [tuboBusq, mostrarSugs])

  async function buscarPorId(id) {
    try {
      const r = await api.get(`/tubos/${id.trim().toUpperCase()}`)
      setTubo(r.data)
      setTuboBusq(r.data.id)
      setMostrarSugs(false)
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
        <div className="responsive-grid" style={{ flexDirection: 'column' }}>
          <form onSubmit={handleSubmit}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>Identificar Tubo</div>
              
              {/* Bloque de Identificación (QR + Manual) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ width: '100%', height: 50, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 10 }}
                  onClick={startScanner}
                >
                  <i className="ti ti-scan" style={{ fontSize: 20 }} /> 
                  Escanear Código QR
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>O BUSCAR POR CÓDIGO</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
                </div>

                <div ref={busqRef} style={{ position: 'relative' }}>
                  <div className="search-bar">
                    <i className="ti ti-search" />
                    <input
                      placeholder="Escribí código de tubo..."
                      value={tuboBusq}
                      onChange={e => { setTuboBusq(e.target.value); setMostrarSugs(true) }}
                      onFocus={() => { setMostrarSugs(true); fetchSugerencias(tuboBusq) }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); buscarPorId(tuboBusq) }
                        if (e.key === 'Escape') setMostrarSugs(false)
                      }}
                    />
                    {buscando && <Spinner size={14} />}
                    {tuboBusq && !buscando && (
                      <button className="btn-icon" onClick={() => { setTuboBusq(''); setTuboSugs([]) }}>
                        <i className="ti ti-x" />
                      </button>
                    )}
                  </div>

                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ width: '100%', marginTop: 8, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    onClick={() => buscarPorId(tuboBusq)}
                  >
                    <i className="ti ti-search" /> Buscar
                  </button>

                  {/* Sugerencias Dropdown */}
                  {mostrarSugs && (tuboSugs.length > 0 || buscando) && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      zIndex: 10, maxHeight: 240, overflowY: 'auto', marginTop: 4
                    }}>
                      {buscando && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>Buscando...</div>}
                      {tuboSugs.map(t => (
                        <div
                          key={t.id}
                          onClick={() => buscarPorId(t.id)}
                          style={{
                            padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', gap: 10, fontSize: 13
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <GasDot gas={t.gas} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{t.id}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t.cliente?.nombre || 'Sin cliente'}</div>
                          </div>
                          <StateBadge estado={t.estado} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Detalle del Tubo Seleccionado */}
              {tubo ? (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--blue)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <GasDot gas={tubo.gas} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{tubo.id}</div>
                    <StateBadge estado={tubo.estado} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                    {[['Gas', tubo.gas],['Capacidad', tubo.capacidadLitros ? `${tubo.capacidadLitros}L` : `${Number(tubo.capacidadKg)} kg`],['Cliente actual', tubo.cliente?.nombre || '—'],['Últ. Ubicación', tubo.ubicacion || '—']].map(([k,v]) => (
                      <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>{k}</span>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 10, marginBottom: 20 }}>
                  <i className="ti ti-cylinder" style={{ fontSize: 24, color: 'var(--text-muted)', opacity: 0.5 }} />
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Ningún tubo seleccionado</p>
                </div>
              )}

              {/* Datos de la Devolución (solo visibles cuando hay un tubo seleccionado) */}
              {tubo && (
                <>
                  <div className="form-grid" style={{ marginTop: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Estado tras devolución <span className="form-required">*</span></label>
                      <select value={estado} onChange={e => setEstado(e.target.value)}>
                        <option value="DEVUELTO">Devuelto (Listo)</option>
                        <option value="VACIO">Vacío (Para cargar)</option>
                        <option value="EN_REVISION">En revisión (Taller)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Fecha</label>
                      <input type="date" defaultValue={new Date().toISOString().slice(0,10)} readOnly style={{ background: 'var(--surface-2)' }} />
                    </div>
                    <div className="form-group col-span-2">
                      <label className="form-label">Observaciones / Notas</label>
                      <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="¿En qué condiciones vuelve el tubo?..." style={{ height: 60 }} />
                    </div>
                  </div>
                  
                  <button type="submit" className="btn btn-primary" style={{ marginTop: 16, width: '100%', height: 48, fontWeight: 600 }} disabled={saving}>
                    {saving ? 'Registrando...' : <><i className="ti ti-check" /> Confirmar Devolución</>}
                  </button>
                </>
              )}
            </div>
          </form>

          <div className="card" style={{ marginTop: esMovil ? 16 : 0 }}>
            <div 
              className="card-title" 
              onClick={() => esMovil && setPendientesAbierto(!pendientesAbierto)}
              style={{ 
                marginBottom: pendientesAbierto ? 12 : 0, 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                cursor: esMovil ? 'pointer' : 'default',
                userSelect: 'none'
              }}
            >
              <span>Pendientes de devolución ({pendientes.length})</span>
              {esMovil && (
                <i className={`ti ti-chevron-${pendientesAbierto ? 'up' : 'down'}`} style={{ fontSize: 18, color: 'var(--text-secondary)' }} />
              )}
            </div>
            
            {pendientesAbierto && (
              pendientes.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>Sin tubos pendientes</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pendientes.slice(0,15).map(t => (
                    <div
                      key={t.id}
                      className="list-card"
                      style={{ 
                        padding: '10px 12px', cursor: 'pointer', background: 'var(--surface-2)', 
                        border: '1px solid var(--border)', borderRadius: 8, transition: 'transform 0.1s' 
                      }}
                      onClick={() => { setTuboId(t.id); buscarPorId(t.id) }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>{t.id}</div>
                        <GasDot gas={t.gas} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 4 }}>{t.cliente?.nombre}</div>
                      <StateBadge estado={t.estado} />
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Modal del Scanner */}
      <Modal
        open={escaneando}
        title="Escaneando código QR del tubo..."
        onClose={stopScanner}
        width={400}
        footer={<button className="btn" onClick={stopScanner}>Cancelar</button>}
      >
        <div id={scannerId} style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }}></div>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
          Apuntá con la cámara al código QR impreso en el tubo.
        </p>
      </Modal>
    </>
  )
}
