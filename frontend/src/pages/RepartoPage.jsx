// gastubos/frontend/src/pages/RepartoPage.jsx
import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import api from '../services/api.js'
import { useAuthStore } from '../store/authStore.js'
import { PageHeader, Spinner, EmptyState, StateBadge } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'

const SCANNER_ID = 'reparto-qr-reader'

const TIPO_INFO = {
  ENTREGA_SIMPLE: { label: 'Entrega',  className: 'badge-tipo-ENTREGA_SIMPLE' },
  ALQUILER:       { label: 'Alquiler', className: 'badge-tipo-ALQUILER' },
  VENTA:          { label: 'Venta',    className: 'badge-tipo-VENTA' },
}

export default function RepartoPage() {
  const { user } = useAuthStore()
  const { toast } = useToast()

  const [entregas, setEntregas] = useState([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(!navigator.onLine)
  
  // Entrega seleccionada para entrega activa en calle
  const [activeEntrega, setActiveEntrega] = useState(null)
  
  // Escáner QR
  const [escaneando, setEscaneando] = useState(false)
  const [scannedIds, setScannedIds] = useState([]) // IDs de tubos validados de la entrega activa
  const scannerRef = useRef(null)

  // Detectar cambios de conectividad
  useEffect(() => {
    const handleOnline = () => {
      setOffline(false)
      toast('Conexión de red restablecida. Sincronizando...', 'success')
      sincronizarConfirmacionesPendientes()
    }
    const handleOffline = () => {
      setOffline(true)
      toast('Sin conexión a internet. Trabajando en modo local.', 'error')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Cargar ruta asignada
  const fetchRuta = async () => {
    if (!user) return
    setLoading(true)
    try {
      if (navigator.onLine) {
        // Carga online filtrando por chofer y no confirmadas
        const res = await api.get(`/entregas?repartidorId=${user.id}&confirmada=false&limit=100`)
        const data = res.data.entregas || []
        setEntregas(data)
        // Guardar copia local de respaldo
        localStorage.setItem(`ruta_offline_${user.id}`, JSON.stringify(data))
      } else {
        // Carga offline
        const data = JSON.parse(localStorage.getItem(`ruta_offline_${user.id}`)) || []
        setEntregas(data)
        setOffline(true)
      }
    } catch (err) {
      // Si falla y hay copia local, la cargamos
      const data = JSON.parse(localStorage.getItem(`ruta_offline_${user.id}`)) || []
      setEntregas(data)
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRuta()
    // Intenta sincronizar pendientes al cargar la página
    if (navigator.onLine) {
      sincronizarConfirmacionesPendientes()
    }
  }, [user])

  // Detener lector QR
  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current = null
      } catch (err) {
        console.error('Error al apagar el escáner', err)
      }
    }
    setEscaneando(false)
  }

  // Iniciar lector QR
  const startScanner = (entrega) => {
    setEscaneando(true)
    setTimeout(() => {
      const scanner = new Html5Qrcode(SCANNER_ID)
      scannerRef.current = scanner
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          // Normalizar código QR
          let id = text
          if (text.includes('/tubos/')) {
            id = text.split('/tubos/')[1].split('?')[0].split('/')[0]
          }
          
          // Verificar si pertenece a los tubos de la entrega
          const pertenece = entrega.detalles?.some(d => d.tuboId === id)
          
          if (pertenece) {
            if (scannedIds.includes(id)) {
              toast('Tubo ya verificado anteriormente', 'info')
            } else {
              setScannedIds(prev => [...prev, id])
              toast(`Tubo ${id} verificado con éxito`, 'success')
            }
          } else {
            toast(`El tubo ${id} no pertenece a esta remisión`, 'error')
          }
          
          // Si ya escaneó todos, cerramos cámara automáticamente
          const totalTubos = entrega.detalles?.map(d => d.tuboId) || []
          const nuevosVerificados = scannedIds.includes(id) ? scannedIds : [...scannedIds, id]
          const todosEscaneados = totalTubos.every(tId => nuevosVerificados.includes(tId))
          if (todosEscaneados) {
            stopScanner()
            toast('¡Todos los tubos escaneados! Ya puedes confirmar la entrega.', 'success')
          }
        },
        () => {}
      ).catch(err => {
        toast('No se pudo acceder a la cámara: ' + err, 'error')
        setEscaneando(false)
      })
    }, 150)
  }

  useEffect(() => {
    return () => {
      if (scannerRef.current) stopScanner()
    }
  }, [])

  // Seleccionar remisión para entregar
  const iniciarEntrega = (entrega) => {
    setActiveEntrega(entrega)
    setScannedIds([])
  }

  const cancelarEntregaActiva = () => {
    stopScanner()
    setActiveEntrega(null)
    setScannedIds([])
  }

  // Confirmar entrega físicamente
  const confirmarEntrega = async (entregaId) => {
    try {
      if (navigator.onLine) {
        await api.put(`/entregas/${entregaId}/confirmar`)
        toast('Entrega confirmada y registrada en el servidor', 'success')
      } else {
        // Registrar confirmación localmente
        const queue = JSON.parse(localStorage.getItem('confirmaciones_offline')) || []
        if (!queue.includes(entregaId)) {
          queue.push(entregaId)
          localStorage.setItem('confirmaciones_offline', JSON.stringify(queue))
        }
        
        // Quitar de la ruta local para no mostrarla de nuevo
        const nuevaRutaLocal = entregas.filter(x => x.id !== entregaId)
        setEntregas(nuevaRutaLocal)
        if (user) {
          localStorage.setItem(`ruta_offline_${user.id}`, JSON.stringify(nuevaRutaLocal))
        }
        
        toast('Confirmado localmente (Fuera de Línea). Pendiente de sincronización.', 'success')
      }
      
      cancelarEntregaActiva()
      fetchRuta()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al confirmar entrega', 'error')
    }
  }

  // Marcar como No Concretada la entrega físicamente en terreno
  const rechazarEntrega = async (entregaId) => {
    const motivo = window.prompt("Ingrese el motivo por el cual no se concretó la entrega (ej: Cliente ausente, Dirección incorrecta, Pedido rechazado):")
    if (motivo === null) return // Canceló el diálogo

    try {
      if (navigator.onLine) {
        await api.put(`/entregas/${entregaId}/cancelar`, { motivo: motivo || 'No concretada en terreno' })
        toast('Entrega registrada como NO CONCRETADA', 'success')
      } else {
        // Registrar cancelación offline
        const queue = JSON.parse(localStorage.getItem('cancelaciones_offline')) || []
        if (!queue.some(x => x.id === entregaId)) {
          queue.push({ id: entregaId, motivo: motivo || 'No concretada en terreno' })
          localStorage.setItem('cancelaciones_offline', JSON.stringify(queue))
        }

        // Quitar de la ruta local para no mostrarla de nuevo
        const nuevaRutaLocal = entregas.filter(x => x.id !== entregaId)
        setEntregas(nuevaRutaLocal)
        if (user) {
          localStorage.setItem(`ruta_offline_${user.id}`, JSON.stringify(nuevaRutaLocal))
        }

        toast('Entrega registrada como NO CONCRETADA localmente (Fuera de Línea).', 'success')
      }

      cancelarEntregaActiva()
      fetchRuta()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al procesar la cancelación', 'error')
    }
  }

  // Sincronizar confirmaciones y cancelaciones acumuladas sin señal
  const sincronizarConfirmacionesPendientes = async () => {
    const queueConf = JSON.parse(localStorage.getItem('confirmaciones_offline')) || []
    const queueCanc = JSON.parse(localStorage.getItem('cancelaciones_offline')) || []
    if (queueConf.length === 0 && queueCanc.length === 0) return

    let exitosos = 0
    let fallidos = 0

    // Sincronizar confirmaciones
    if (queueConf.length > 0) {
      const confFallidas = []
      for (const id of queueConf) {
        try {
          await api.put(`/entregas/${id}/confirmar`)
          exitosos++
        } catch (err) {
          fallidos++
          confFallidas.push(id)
        }
      }
      if (confFallidas.length > 0) {
        localStorage.setItem('confirmaciones_offline', JSON.stringify(confFallidas))
      } else {
        localStorage.removeItem('confirmaciones_offline')
      }
    }

    // Sincronizar cancelaciones
    if (queueCanc.length > 0) {
      const cancFallidas = []
      for (const item of queueCanc) {
        try {
          await api.put(`/entregas/${item.id}/cancelar`, { motivo: item.motivo })
          exitosos++
        } catch (err) {
          fallidos++
          cancFallidas.push(item)
        }
      }
      if (cancFallidas.length > 0) {
        localStorage.setItem('cancelaciones_offline', JSON.stringify(cancFallidas))
      } else {
        localStorage.removeItem('cancelaciones_offline')
      }
    }

    if (exitosos > 0) {
      toast(`Se sincronizaron ${exitosos} transacciones realizadas sin conexión.`, 'success')
      fetchRuta()
    }
    if (fallidos > 0) {
      toast(`Fallo al sincronizar ${fallidos} transacciones. Se reintentará luego.`, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Ruta de Reparto Móvil"
        subtitle={offline ? "TRABAJANDO FUERA DE LÍNEA (MODO LOCAL)" : "Entregas asignadas a tu planilla de ruta"}
        actions={
          <button className="btn btn-sm" onClick={fetchRuta} disabled={loading} title="Recargar Ruta">
            <i className="ti ti-refresh" />
          </button>
        }
      />

      <div className="app-content reparto-wrap">

        {/* Banner offline */}
        {offline && (
          <div className="alert alert-info" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, background: '#fffbeb', border: '1px solid #fef3c7', color: '#b45309', padding: 10, borderRadius: 8 }}>
            <i className="ti ti-wifi-off" style={{ fontSize: 18 }} />
            <div>
              <strong>Modo Sin Conexión activo.</strong> Las acciones se guardan localmente y se sincronizan al recuperar señal.
            </div>
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : !activeEntrega ? (
          // VISTA 1: LISTADO DE ENTREGAS DEL CHOFER
          <>
            {/* Banner de stats — llena el espacio en desktop y da contexto en mobile */}
            <div className="reparto-stats">
              <div className="reparto-stat">
                <div className="reparto-stat-label">Pendientes hoy</div>
                <div className="reparto-stat-value" style={{ color: 'var(--blue)' }}>{entregas.length}</div>
                <div className="reparto-stat-foot">entrega{entregas.length === 1 ? '' : 's'} por realizar</div>
              </div>
              <div className="reparto-stat">
                <div className="reparto-stat-label">Estado señal</div>
                <div className="reparto-stat-value" style={{ color: offline ? 'var(--amber)' : 'var(--green)', fontSize: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className={`ti ${offline ? 'ti-wifi-off' : 'ti-wifi'}`} />
                  {offline ? 'Sin conexión' : 'En línea'}
                </div>
                <div className="reparto-stat-foot">{offline ? 'Modo local activo' : 'Cambios sincronizados'}</div>
              </div>
            </div>

            {entregas.length === 0 ? (
              <EmptyState icon="ti-truck-delivery" message="No tienes entregas pendientes asignadas para hoy" />
            ) : (
              <div className="reparto-grid">
                {entregas.map(e => {
                  const tipo = TIPO_INFO[e.tipoOperacion] || { label: e.tipoOperacion, className: 'badge-OPERADOR' }
                  const tieneGps = !!(e.latitud && e.longitud)
                  return (
                    <div key={e.id} className="reparto-card">
                      <div className="reparto-card-head">
                        <span className="reparto-card-num">{e.numero}</span>
                        <span className={`badge ${tipo.className}`}>{tipo.label}</span>
                      </div>

                      <div className="reparto-card-cli">{e.cliente?.nombre}</div>

                      <div className="reparto-card-addr">
                        <i className="ti ti-map-pin" style={{ color: 'var(--text-muted)', marginTop: 2 }} />
                        <span>{e.direccionEntrega}</span>
                      </div>

                      {(e.cliente?.contacto || e.cliente?.telefono) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {e.cliente?.contacto && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <i className="ti ti-user" style={{ color: 'var(--blue)' }} />
                              {e.cliente.contacto}
                            </span>
                          )}
                          {e.cliente?.telefono && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <i className="ti ti-phone" style={{ color: 'var(--green)' }} />
                              <a href={`tel:${e.cliente.telefono}`} style={{ color: 'var(--blue)', fontWeight: 500 }}>{e.cliente.telefono}</a>
                            </span>
                          )}
                        </div>
                      )}

                      <div className="reparto-card-meta">
                        <span><i className="ti ti-cylinder" /> {e.detalles?.length || 0} tubo{e.detalles?.length === 1 ? '' : 's'}</span>
                        {tieneGps && <span><i className="ti ti-gps" /> GPS</span>}
                        {e.observaciones && <span><i className="ti ti-note" /> con obs.</span>}
                      </div>

                      <div className="reparto-card-actions">
                        <a
                          href={tieneGps
                            ? `https://www.google.com/maps?q=${e.latitud},${e.longitud}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.direccionEntrega)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-secondary"
                          style={{ flex: 1, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                        >
                          <i className={`ti ${tieneGps ? 'ti-navigation' : 'ti-map-pin'}`} /> {tieneGps ? 'Navegar GPS' : 'Buscar'}
                        </a>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => iniciarEntrega(e)}
                          style={{ flex: 1.2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                        >
                          <i className="ti ti-circle-check" /> Iniciar Entrega
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          // VISTA 2: PROCESO DE ENTREGA ACTIVA
          (() => {
            const totalIds = activeEntrega.detalles?.map(d => d.tuboId) || []
            const todosListos = totalIds.length > 0 && totalIds.every(id => scannedIds.includes(id))
            const progreso = totalIds.length === 0 ? 0 : Math.round((scannedIds.length / totalIds.length) * 100)
            const tipo = TIPO_INFO[activeEntrega.tipoOperacion] || { label: activeEntrega.tipoOperacion, className: 'badge-OPERADOR' }

            return (
              <div className="reparto-active">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <button className="btn btn-sm" onClick={cancelarEntregaActiva}>
                    <i className="ti ti-arrow-left" /> Volver
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`badge ${tipo.className}`}>{tipo.label}</span>
                    <span className="reparto-card-num">{activeEntrega.numero}</span>
                  </div>
                </div>

                <div className="reparto-active-grid">

                  {/* Columna izquierda: datos cliente + checklist */}
                  <div>
                    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{activeEntrega.cliente?.nombre}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                        <i className="ti ti-map-pin" style={{ marginTop: 2 }} />
                        <span>{activeEntrega.direccionEntrega}</span>
                      </div>
                      
                      {(activeEntrega.cliente?.contacto || activeEntrega.cliente?.telefono) && (
                        <div style={{
                          marginTop: 8,
                          padding: '8px 10px',
                          background: 'var(--blue-light)',
                          border: '1px solid rgba(26, 95, 168, 0.15)',
                          borderRadius: 8,
                          fontSize: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}>
                          {activeEntrega.cliente?.contacto && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                              <i className="ti ti-user" style={{ color: 'var(--blue)', fontSize: 14 }} />
                              <span><strong>Contacto:</strong> {activeEntrega.cliente.contacto}</span>
                            </div>
                          )}
                          {activeEntrega.cliente?.telefono && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <i className="ti ti-phone" style={{ color: 'var(--green)', fontSize: 14 }} />
                              <span>
                                <strong>Teléfono:</strong>{' '}
                                <a 
                                  href={`tel:${activeEntrega.cliente.telefono}`} 
                                  style={{ 
                                    color: 'var(--blue)', 
                                    textDecoration: 'underline', 
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 2
                                  }}
                                >
                                  {activeEntrega.cliente.telefono}
                                  <i className="ti ti-external-link" style={{ fontSize: 10 }} />
                                </a>
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {activeEntrega.observaciones && (
                        <div style={{ fontSize: 11, fontStyle: 'italic', background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 6, marginTop: 8 }}>
                          <strong>Obs:</strong> {activeEntrega.observaciones}
                        </div>
                      )}
                    </div>

                    {/* Progreso */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                      <span>CILINDROS EN LA ORDEN</span>
                      <span>{scannedIds.length} de {totalIds.length} VERIFICADOS</span>
                    </div>
                    <div className="reparto-progress"><div className="reparto-progress-fill" style={{ width: `${progreso}%` }} /></div>

                    {/* Checklist de tubos */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {activeEntrega.detalles?.map(d => {
                        const verificado = scannedIds.includes(d.tuboId)
                        return (
                          <div
                            key={d.id}
                            style={{
                              display: 'flex', alignItems: 'center',
                              padding: '10px 12px', background: verificado ? '#ecfdf5' : 'var(--surface-2)',
                              border: `1px solid ${verificado ? '#10b981' : 'var(--border)'}`,
                              borderRadius: 8, fontSize: 13, gap: 10,
                            }}
                          >
                            <i
                              className={`ti ${verificado ? 'ti-circle-check-filled' : 'ti-circle'}`}
                              style={{ color: verificado ? '#10b981' : 'var(--text-muted)', fontSize: 22 }}
                            />
                            <div style={{ flex: 1 }}>
                              <strong style={{ fontFamily: 'var(--font-mono)' }}>{d.tuboId}</strong>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                                {d.tubo?.gas} {d.tubo?.talla} · {Number(d.cantidadGas)} {d.unidadGas}
                              </div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: verificado ? '#10b981' : 'var(--text-muted)' }}>
                              {verificado ? 'Listo' : 'Pendiente'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Columna derecha: scanner + acciones */}
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)' }}>
                        ESCÁNER DE CILINDROS
                      </div>

                      {escaneando ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', background: '#000', padding: 12, borderRadius: 8 }}>
                          <div id={SCANNER_ID} style={{ width: '100%', maxWidth: '320px', overflow: 'hidden' }} />
                          <button className="btn btn-sm btn-danger" onClick={stopScanner}>
                            <i className="ti ti-player-stop" /> Apagar Cámara
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-primary"
                          onClick={() => startScanner(activeEntrega)}
                          style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 52, fontSize: 14 }}
                        >
                          <i className="ti ti-qrcode" style={{ fontSize: 20 }} /> Escanear Código QR
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <button
                        className={`btn ${todosListos ? 'btn-success' : 'btn-secondary'}`}
                        disabled={!todosListos}
                        onClick={() => confirmarEntrega(activeEntrega.id)}
                        style={{ width: '100%', height: 50, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <i className="ti ti-check" />
                        {todosListos ? 'Confirmar y Finalizar Entrega' : 'Escanea todos los tubos'}
                      </button>

                      <button
                        className="btn btn-outline"
                        onClick={() => rechazarEntrega(activeEntrega.id)}
                        style={{ width: '100%', height: 44, fontSize: 13, borderColor: '#ef4444', color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'transparent' }}
                      >
                        <i className="ti ti-x" />
                        No concretar entrega
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )
          })()
        )}
      </div>
    </>
  )
}
