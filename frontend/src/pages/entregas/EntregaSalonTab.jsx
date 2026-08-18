// gastubos/frontend/src/pages/entregas/EntregaSalonTab.jsx
//
// "Entrega en Salón": mismo modelo Entrega y los mismos endpoints que usa el
// repartidor (POST /entregas, PUT /:id/confirmar con su mecanismo de
// `recambios`), pero para clientes que retiran sus tubos directo en
// mostrador — sin repartidor real ni GPS. Wizard propio, estado 100%
// independiente del formulario de "Nueva Entrega" (ese está entrelazado con
// mapa/GPS/autocomplete de direcciones). No importa nada de RepartoPage.jsx
// a propósito — es una vista móvil en producción usada por repartidores
// reales, y esto solo duplica la porción chica de datos/lógica que necesita
// (selector de gas/capacidad, escaneo QR).

import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import api from '../../services/api.js'
import { Modal, Spinner, GasDot, StateBadge, FormGroup, formatCapacidad } from '../../components/ui.jsx'
import { useAuthStore } from '../../store/authStore.js'
import { GASES_RETORNO, capacidadesParaGas, capacidadInicialParaGas, nextRecambioDescripcion } from '../../utils/recambiosCalculadora.js'
import TuboChip from '../../components/TuboChip.jsx'
import ClienteAutocomplete from '../../components/ClienteAutocomplete.jsx'

const SCANNER_VERIFICAR_ID = 'entrega-salon-verificar-qr-reader'
const SCANNER_RETORNO_ID = 'entrega-salon-retorno-qr-reader'

const PASOS = [
  { key: 'datos',     label: 'Datos y tubos' },
  { key: 'verificar', label: 'Verificar' },
  { key: 'retorno',   label: 'Retorno' },
  { key: 'confirmar', label: 'Confirmar' },
]

export default function EntregaSalonTab({ toast, onFinish }) {
  const { user } = useAuthStore()

  const [paso, setPaso] = useState('datos')

  // ── Paso 1: datos y tubos ────────────────────────────────────────────────
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [tipoOperacion, setTipoOperacion] = useState('ENTREGA_SIMPLE')
  const [tubosIds, setTubosIds] = useState([])
  const [tubosDetalles, setTubosDetalles] = useState([])
  const [metodoPago, setMetodoPago] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [referencia, setReferencia] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [tuboBusq, setTuboBusq] = useState('')
  const [tuboSugs, setTuboSugs] = useState([])
  const [tuboBuscando, setTuboBuscando] = useState(false)
  const [creando, setCreando] = useState(false)
  const busqRef = useRef(null)

  // Entrega ya creada — pivote del resto del wizard
  const [entregaCreada, setEntregaCreada] = useState(null)

  // Entrega de salón sin confirmar encontrada al entrar (el operador cerró
  // el navegador antes de terminar una vez anterior)
  const [pendienteExistente, setPendienteExistente] = useState(null)
  const [cancelandoPendiente, setCancelandoPendiente] = useState(false)

  // ── Paso 2: verificación física ──────────────────────────────────────────
  const [scannedIds, setScannedIds] = useState([])
  const [escaneando, setEscaneando] = useState(false)
  const [manualTuboId, setManualTuboId] = useState('')
  const scannerVerificarRef = useRef(null)

  // ── Paso 3: retorno de cilindros ─────────────────────────────────────────
  const [tieneRetorno, setTieneRetorno] = useState(null) // null | true | false
  const [calcGas, setCalcGas] = useState('Oxígeno')
  const [calcCapacidad, setCalcCapacidad] = useState('6 m³')
  const [recambios, setRecambios] = useState([])
  const [nuevoRecambioId, setNuevoRecambioId] = useState('')
  const [escaneandoRecambio, setEscaneandoRecambio] = useState(false)
  const scannerRetornoRef = useRef(null)

  // ── Paso 4: confirmación ─────────────────────────────────────────────────
  const [montoRecibido, setMontoRecibido] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [modalConfirmarAbierto, setModalConfirmarAbierto] = useState(false)

  // Si el operador había creado una entrega de salón y no llegó a
  // confirmarla, se la ofrecemos retomar en vez de dejarla huérfana.
  useEffect(() => {
    if (!user?.id) return
    api.get('/entregas', { params: { canal: 'SALON', confirmada: false, cancelada: false, repartidorId: user.id, limit: 5 } })
      .then(r => setPendienteExistente((r.data.entregas || [])[0] || null))
      .catch(() => {})
  }, [user?.id])

  useEffect(() => {
    const handler = e => {
      if (busqRef.current && !busqRef.current.contains(e.target)) setTuboSugs([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    return () => {
      scannerVerificarRef.current?.stop().catch(() => {})
      scannerRetornoRef.current?.stop().catch(() => {})
    }
  }, [])

  function resetWizard() {
    setPaso('datos')
    setClienteSeleccionado(null)
    setTipoOperacion('ENTREGA_SIMPLE')
    setTubosIds([])
    setTubosDetalles([])
    setMetodoPago('')
    setFechaVencimiento('')
    setReferencia('')
    setObservaciones('')
    setTuboBusq('')
    setTuboSugs([])
    setEntregaCreada(null)
    setScannedIds([])
    setManualTuboId('')
    setTieneRetorno(null)
    setCalcGas('Oxígeno')
    setCalcCapacidad('6 m³')
    setRecambios([])
    setNuevoRecambioId('')
    setMontoRecibido('')
    setModalConfirmarAbierto(false)
  }

  async function continuarPendiente() {
    setEntregaCreada(pendienteExistente)

    // Restaurar también el estado del paso "datos" — si no, el botón
    // "Volver" muestra el formulario vacío y metodoPago queda '' (rompe
    // la validación al confirmar, ver PUT /:id/confirmar).
    setClienteSeleccionado(pendienteExistente.cliente || null)
    setTipoOperacion(pendienteExistente.tipoOperacion || 'ENTREGA_SIMPLE')
    setMetodoPago(pendienteExistente.metodoPago || '')
    setObservaciones(pendienteExistente.observaciones || '')
    const detalles = pendienteExistente.detalles || []
    setTubosIds(detalles.map(d => d.tuboId))
    setTubosDetalles(detalles.map(d => ({
      tuboId: d.tuboId,
      cantidadGas: Number(d.cantidadGas || 0),
      unidadGas: d.unidadGas || 'KG',
      precioUnitario: Number(d.precioUnitario || 0),
    })))

    const subtotal = detalles.reduce((acc, d) => acc + Number(d.subtotal || 0), 0)
    setMontoRecibido(String(subtotal))
    setPendienteExistente(null)
    setPaso('verificar')
  }

  async function cancelarPendiente() {
    if (!pendienteExistente) return
    setCancelandoPendiente(true)
    try {
      await api.put(`/entregas/${pendienteExistente.id}/cancelar`, { motivo: 'Cancelada desde Entrega en Salón (sin confirmar)' })
      toast('Entrega pendiente cancelada', 'info')
      setPendienteExistente(null)
    } catch (err) {
      toast(err.response?.data?.error || 'Error al cancelar la entrega pendiente', 'error')
    } finally {
      setCancelandoPendiente(false)
    }
  }

  // ── Paso 1: buscar / agregar / quitar tubos ──────────────────────────────
  const fetchSugerencias = async (q = '') => {
    setTuboBuscando(true)
    try {
      const r = await api.get(`/tubos?q=${encodeURIComponent(q)}&limit=20&disponibles=true`)
      setTuboSugs(r.data.tubos || [])
    } catch {
      setTuboSugs([])
    } finally {
      setTuboBuscando(false)
    }
  }

  useEffect(() => {
    if (!tuboBusq.trim()) { setTuboSugs([]); return }
    const t = setTimeout(() => fetchSugerencias(tuboBusq), 350)
    return () => clearTimeout(t)
  }, [tuboBusq])

  async function agregarTuboSalon(id) {
    if (tubosIds.includes(id)) return toast('El tubo ya está en la lista')
    try {
      const r = await api.get(`/tubos/${id}`)
      if (!['DISPONIBLE', 'CARGADO', 'RESERVADO'].includes(r.data.estado)) {
        return toast(`Tubo en estado ${r.data.estado}, no disponible para entrega`, 'error')
      }
      let defaultCant = 0
      let defaultUnidad = 'KG'
      let defaultPrecio = 0

      const gasNorm = r.data.gas ? r.data.gas.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : ''
      const esM3 = gasNorm.includes('oxigeno') || gasNorm.includes('argon') || gasNorm.includes('nitrogeno') || gasNorm.includes('aire') || gasNorm.includes('mezcla')
      defaultUnidad = esM3 ? 'M3' : 'KG'

      if (r.data.estado === 'DISPONIBLE') {
        defaultCant = 0
        defaultPrecio = 0
      } else if (r.data.cargas && r.data.cargas.length > 0) {
        const ultimaCarga = r.data.cargas[0]
        defaultCant = Number(ultimaCarga.cantidad || 0)
        defaultUnidad = ultimaCarga.unidad || defaultUnidad
        defaultPrecio = Number(ultimaCarga.precioUnitario || 0)
      } else {
        defaultCant = r.data.capacidadKg ? Number(r.data.capacidadKg) : (Number(r.data.capacidadLitros) || 0)
        defaultPrecio = 0
      }

      setTubosIds(prev => [...prev, id])
      setTubosDetalles(prev => [...prev, { tuboId: id, cantidadGas: defaultCant, unidadGas: defaultUnidad, precioUnitario: defaultPrecio }])
      setTuboSugs([])
      setTuboBusq('')
    } catch {
      toast('Tubo no encontrado', 'error')
    }
  }

  function quitarTuboSalon(id) {
    setTubosIds(prev => prev.filter(x => x !== id))
    setTubosDetalles(prev => prev.filter(d => d.tuboId !== id))
  }

  function updateTuboDetailSalon(tuboId, key, value) {
    setTubosDetalles(prev => prev.map(d => d.tuboId === tuboId ? { ...d, [key]: value } : d))
  }

  async function crearEntregaSalon() {
    if (!clienteSeleccionado) return toast('Seleccioná un cliente', 'error')
    if (tubosIds.length === 0) return toast('Agregá al menos un tubo', 'error')
    if (!metodoPago) return toast('Seleccioná la forma de pago', 'error')
    if (tipoOperacion === 'ALQUILER' && !fechaVencimiento) return toast('Ingresá la fecha de vencimiento del alquiler', 'error')

    setCreando(true)
    try {
      const { data: creada } = await api.post('/entregas', {
        clienteId: clienteSeleccionado.id,
        sucursalId: null,
        direccionEntrega: 'Retiro en Salón',
        tipoOperacion,
        canal: 'SALON',
        repartidorId: user?.id,
        tubosIds,
        tubosDetalles,
        costoDelivery: 0,
        metodoPago,
        fechaVencimiento: tipoOperacion === 'ALQUILER' ? new Date(fechaVencimiento).toISOString() : undefined,
        referencia: tipoOperacion === 'VENTA' ? referencia : undefined,
        observaciones: observaciones || undefined,
      })
      // La respuesta de POST no trae detalles.tubo — se rehidrata completa
      // para poder mostrar gas/capacidad en el paso de verificación.
      const { data: completa } = await api.get(`/entregas/numero/${creada.numero}`)
      setEntregaCreada(completa)
      const subtotal = (completa.detalles || []).reduce((acc, d) => acc + Number(d.subtotal || 0), 0)
      setMontoRecibido(String(subtotal))
      toast('Entrega creada — verificá los tubos', 'success')
      setPaso('verificar')
    } catch (err) {
      toast(err.response?.data?.error || 'Error al crear la entrega', 'error')
    } finally {
      setCreando(false)
    }
  }

  // ── Paso 2: verificación física ──────────────────────────────────────────
  function marcarVerificado(idRaw) {
    let id = (idRaw || '').trim()
    if (!id) return
    if (id.includes('/tubos/')) id = id.split('/tubos/')[1].split('?')[0].split('/')[0]

    const pertenece = entregaCreada?.detalles?.some(d => d.tuboId === id)
    if (!pertenece) {
      toast(`El tubo ${id} no pertenece a esta entrega`, 'error')
      return
    }
    if (scannedIds.includes(id)) {
      toast('Tubo ya verificado', 'info')
      return
    }
    setScannedIds(prev => [...prev, id])
    toast(`Tubo ${id} verificado`, 'success')
  }

  function agregarManualVerificar() {
    marcarVerificado(manualTuboId)
    setManualTuboId('')
  }

  function startScannerVerificar() {
    setEscaneando(true)
    setTimeout(() => {
      const scanner = new Html5Qrcode(SCANNER_VERIFICAR_ID)
      scannerVerificarRef.current = scanner
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          stopScannerVerificar()
          marcarVerificado(text)
        },
        () => {}
      ).catch(() => {
        toast('No se pudo acceder a la cámara', 'error')
        setEscaneando(false)
      })
    }, 250)
  }

  async function stopScannerVerificar() {
    if (scannerVerificarRef.current) {
      try {
        await scannerVerificarRef.current.stop()
        scannerVerificarRef.current = null
      } catch { /* ya detenido */ }
    }
    setEscaneando(false)
  }

  // ── Paso 3: retorno de cilindros ─────────────────────────────────────────
  function agregarRecambioCalculadora() {
    const desc = nextRecambioDescripcion(calcGas, calcCapacidad, recambios)
    setRecambios(prev => [...prev, desc])
    toast(`Agregado retorno: ${desc}`, 'success')
  }

  function agregarRecambioManual() {
    const val = nuevoRecambioId.trim()
    if (!val) return
    if (recambios.includes(val)) {
      toast('Ese código ya está agregado', 'info')
      return
    }
    setRecambios(prev => [...prev, val])
    setNuevoRecambioId('')
  }

  function startScannerRetorno() {
    setEscaneandoRecambio(true)
    setTimeout(() => {
      const scanner = new Html5Qrcode(SCANNER_RETORNO_ID)
      scannerRetornoRef.current = scanner
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          let id = text.trim()
          if (id.includes('/tubos/')) id = id.split('/tubos/')[1].split('?')[0].split('/')[0]
          stopScannerRetorno()
          if (recambios.includes(id)) {
            toast('Tubo ya agregado al retorno', 'info')
          } else {
            setRecambios(prev => [...prev, id])
            toast(`Tubo ${id} agregado al retorno`, 'success')
          }
        },
        () => {}
      ).catch(() => {
        toast('No se pudo acceder a la cámara', 'error')
        setEscaneandoRecambio(false)
      })
    }, 250)
  }

  async function stopScannerRetorno() {
    if (scannerRetornoRef.current) {
      try {
        await scannerRetornoRef.current.stop()
        scannerRetornoRef.current = null
      } catch { /* ya detenido */ }
    }
    setEscaneandoRecambio(false)
  }

  // ── Paso 4: confirmar ────────────────────────────────────────────────────
  async function confirmarEntregaSalon() {
    if (!entregaCreada) return
    setConfirmando(true)
    try {
      await api.put(`/entregas/${entregaCreada.id}/confirmar`, {
        confirmados: scannedIds,
        recambios,
        metodoPago,
        montoRecibido: Number(montoRecibido) || 0,
      })
      const { data: entregaCompleta } = await api.get(`/entregas/numero/${entregaCreada.numero}`)
      toast('Entrega en salón confirmada', 'success')
      onFinish(entregaCompleta)
      resetWizard()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al confirmar la entrega', 'error')
    } finally {
      setConfirmando(false)
    }
  }

  const subtotalDetalles = (entregaCreada?.detalles || []).reduce((acc, d) => acc + Number(d.subtotal || 0), 0)
  const totalDetalles = entregaCreada?.detalles?.length || 0
  const todosVerificados = totalDetalles > 0 && scannedIds.length === totalDetalles

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Indicador de pasos */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
        {PASOS.map((p, i) => {
          const idxActual = PASOS.findIndex(x => x.key === paso)
          const activo = p.key === paso
          const completo = i < idxActual
          return (
            <div key={p.key} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: 4, borderRadius: 2, marginBottom: 6,
                background: activo || completo ? 'var(--blue)' : 'var(--border)',
              }} />
              <span style={{ fontSize: 11, fontWeight: activo ? 700 : 500, color: activo ? 'var(--blue)' : 'var(--text-secondary)' }}>
                {i + 1}. {p.label}
              </span>
            </div>
          )
        })}
      </div>

      {paso === 'datos' && pendienteExistente && (
        <div className="card" style={{ padding: 16, marginBottom: 16, border: '1px solid var(--amber, #d97706)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            <i className="ti ti-alert-triangle" style={{ color: 'var(--amber, #d97706)' }} /> Tenés una entrega de salón sin terminar
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
            {pendienteExistente.numero} — {pendienteExistente.cliente?.nombre} ({pendienteExistente.detalles?.length || 0} tubo(s)). ¿Continuás donde quedó o la cancelás?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={cancelarPendiente} disabled={cancelandoPendiente}>
              {cancelandoPendiente ? 'Cancelando...' : 'Cancelar entrega pendiente'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={continuarPendiente}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 1: DATOS Y TUBOS ─────────────────────────────────────────── */}
      {paso === 'datos' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Datos de la entrega</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Cliente <span className="form-required">*</span></label>
                <ClienteAutocomplete value={clienteSeleccionado} onChange={setClienteSeleccionado} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de operación <span className="form-required">*</span></label>
                <select value={tipoOperacion} onChange={e => setTipoOperacion(e.target.value)}>
                  <option value="ENTREGA_SIMPLE">Entrega simple</option>
                  <option value="ALQUILER">Alquiler</option>
                  <option value="VENTA">Venta</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Forma de pago <span className="form-required">*</span></label>
                <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} required>
                  <option value="">Seleccioná...</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </div>
              {tipoOperacion === 'ALQUILER' && (
                <div className="form-group">
                  <label className="form-label">Fecha vencimiento alquiler <span className="form-required">*</span></label>
                  <input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} required />
                </div>
              )}
              {tipoOperacion === 'VENTA' && (
                <div className="form-group">
                  <label className="form-label">Referencia (factura, orden)</label>
                  <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="FAC-001" />
                </div>
              )}
              <div className="form-group col-span-2">
                <label className="form-label">Observaciones</label>
                <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} style={{ height: 56 }} />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">Tubos a entregar</div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tubosIds.length} seleccionados</span>
            </div>

            <div ref={busqRef} style={{ position: 'relative', marginBottom: 12 }}>
              <div className="search-bar" style={{ marginBottom: 0 }}>
                <i className="ti ti-search" />
                <input
                  placeholder="Buscar código, gas o serie…"
                  value={tuboBusq}
                  onChange={e => setTuboBusq(e.target.value)}
                  onFocus={() => { if (!tuboBusq.trim()) fetchSugerencias('') }}
                />
                {tuboBuscando && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>...</span>}
              </div>

              {(tuboSugs.length > 0 || (tuboBusq.trim() && !tuboBuscando)) && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.10)',
                  zIndex: 200, maxHeight: 300, overflowY: 'auto',
                }}>
                  {tuboSugs.length === 0 && tuboBusq.trim() && (
                    <div style={{ padding: '14px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      <i className="ti ti-cylinder" style={{ display: 'block', fontSize: 22, marginBottom: 4 }} />
                      Sin resultados para «{tuboBusq}»
                    </div>
                  )}
                  {tuboSugs.map((t, i) => {
                    const yaAgregado = tubosIds.includes(t.id)
                    return (
                      <div key={t.id}
                        onClick={() => !yaAgregado && agregarTuboSalon(t.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          cursor: yaAgregado ? 'not-allowed' : 'pointer',
                          opacity: yaAgregado ? 0.5 : 1,
                          borderBottom: i < tuboSugs.length - 1 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <GasDot gas={t.gas} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{t.id}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t.gas} · {formatCapacidad(t)}</div>
                        </div>
                        <StateBadge estado={t.estado} />
                        {yaAgregado && <span style={{ fontSize: 10, color: 'var(--green)' }}>Ya agregado</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {tubosIds.length === 0 ? (
              <div style={{ border: '1px dashed var(--border-mid)', borderRadius: 8, padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                <i className="ti ti-cylinder" style={{ fontSize: 24, display: 'block', marginBottom: 6 }} />
                Buscá tubos por código, gas o serie y agregálos aquí
              </div>
            ) : (
              tubosIds.map(tuboId => (
                <TuboChip
                  key={tuboId}
                  tuboId={tuboId}
                  detail={tubosDetalles.find(d => d.tuboId === tuboId)}
                  onChange={updateTuboDetailSalon}
                  onRemove={quitarTuboSalon}
                />
              ))
            )}
          </div>

          <button className="btn btn-primary" style={{ width: '100%', height: 46 }} onClick={crearEntregaSalon} disabled={creando}>
            {creando ? 'Creando entrega...' : <><i className="ti ti-check" /> Crear entrega y continuar</>}
          </button>
        </>
      )}

      {/* ── PASO 2: VERIFICAR ─────────────────────────────────────────────── */}
      {paso === 'verificar' && entregaCreada && (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Escaneá o tipeá el código de cada tubo para verificar que coincide con lo elegido
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus
                placeholder="Código del tubo y Enter..."
                value={manualTuboId}
                onChange={e => setManualTuboId(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarManualVerificar() } }}
                style={{ flex: 1, height: 42, fontSize: 14 }}
              />
              <button className="btn btn-primary" onClick={agregarManualVerificar} disabled={!manualTuboId.trim()} style={{ height: 42, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-check" /> Validar
              </button>
              <button className="btn btn-secondary" onClick={startScannerVerificar} style={{ height: 42, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-qrcode" /> Escanear
              </button>
            </div>
          </div>

          {escaneando && (
            <Modal open={escaneando} title="Escanear Tubo" onClose={stopScannerVerificar} width={400}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, alignItems: 'center', background: '#000', padding: 12, borderRadius: 8 }}>
                <div id={SCANNER_VERIFICAR_ID} style={{ width: '100%', maxWidth: 320, overflow: 'hidden' }} />
                <button className="btn btn-danger" onClick={stopScannerVerificar} style={{ width: '100%', height: 42 }}>
                  <i className="ti ti-player-stop" /> Apagar Cámara / Cancelar
                </button>
              </div>
            </Modal>
          )}

          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            {entregaCreada.detalles?.map(d => {
              const verificado = scannedIds.includes(d.tuboId)
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <i className={`ti ${verificado ? 'ti-circle-check-filled' : 'ti-circle-dashed'}`} style={{ fontSize: 18, color: verificado ? 'var(--green)' : 'var(--text-muted)' }} />
                  <GasDot gas={d.tubo?.gas} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{d.tuboId}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{d.tubo?.gas} {d.tubo ? formatCapacidad(d.tubo) : ''}</span>
                </div>
              )
            })}
          </div>

          {!todosVerificados && (
            <div className="alert alert-info" style={{ fontSize: 12, marginBottom: 16 }}>
              <i className="ti ti-info-circle" /> Verificaste {scannedIds.length} de {totalDetalles} tubos. Podés continuar igual con una entrega parcial.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className={`btn ${todosVerificados ? 'btn-primary' : 'btn-warning'}`} style={{ height: 46 }}
              disabled={scannedIds.length === 0} onClick={() => setPaso('retorno')}>
              Siguiente: Retorno de Cilindros <i className="ti ti-arrow-right" />
            </button>
            <button className="btn btn-outline" style={{ height: 44 }} onClick={() => setPaso('datos')}>
              <i className="ti ti-arrow-left" /> Volver
            </button>
          </div>
        </>
      )}

      {/* ── PASO 3: RETORNO ───────────────────────────────────────────────── */}
      {paso === 'retorno' && (
        <>
          {tieneRetorno === null ? (
            <div className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue-light)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <i className="ti ti-transfer" style={{ fontSize: 26 }} />
              </div>
              <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>¿El cliente va a retornar algún cilindro?</h4>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                Indicá si recibís envases vacíos o tubos en recambio para registrar su ingreso.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-primary" style={{ height: 46 }} onClick={() => setTieneRetorno(true)}>
                  <i className="ti ti-check" /> SÍ, RETORNA CILINDROS
                </button>
                <button className="btn btn-outline" style={{ height: 44 }} onClick={() => { setRecambios([]); setTieneRetorno(false); setPaso('confirmar') }}>
                  <i className="ti ti-x" style={{ color: 'var(--red)' }} /> NO RETORNA NINGUNO
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Seleccionar retorno de cilindros</div>
                <button type="button" onClick={() => { setRecambios([]); setTieneRetorno(null) }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--blue)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <i className="ti ti-rotate-clockwise" /> Cambiar respuesta
                </button>
              </div>

              <div className="card" style={{ padding: 14, marginBottom: 12 }}>
                <div style={{ background: 'var(--blue-light)', borderRadius: 6, padding: '10px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue-dark)' }}>SELECCIÓN:</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue-dark)' }}>{calcGas} {calcCapacidad}</span>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>1. Seleccionar Gas</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {GASES_RETORNO.map(g => (
                      <button key={g} type="button"
                        onClick={() => { setCalcGas(g); setCalcCapacidad(capacidadInicialParaGas(g)) }}
                        style={{
                          padding: '8px 4px', fontSize: 11, fontWeight: calcGas === g ? 700 : 500,
                          background: calcGas === g ? 'var(--blue)' : 'var(--surface-2)',
                          color: calcGas === g ? '#fff' : 'var(--text-secondary)',
                          border: `1px solid ${calcGas === g ? 'var(--blue)' : 'var(--border)'}`,
                          borderRadius: 6, cursor: 'pointer',
                        }}
                      >{g}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>2. Seleccionar Capacidad</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                    {capacidadesParaGas(calcGas).map(c => (
                      <button key={c} type="button" onClick={() => setCalcCapacidad(c)}
                        style={{
                          padding: '8px 4px', fontSize: 11, fontWeight: calcCapacidad === c ? 700 : 500,
                          background: calcCapacidad === c ? 'var(--blue-mid)' : 'var(--surface-2)',
                          color: calcCapacidad === c ? '#fff' : 'var(--text-secondary)',
                          border: `1px solid ${calcCapacidad === c ? 'var(--blue-mid)' : 'var(--border)'}`,
                          borderRadius: 6, cursor: 'pointer',
                        }}
                      >{c}</button>
                    ))}
                  </div>
                </div>

                <button type="button" className="btn btn-primary" onClick={agregarRecambioCalculadora} style={{ width: '100%', height: 42 }}>
                  <i className="ti ti-plus" /> Agregar Retorno
                </button>
              </div>

              <div className="card" style={{ padding: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 8, color: 'var(--text-secondary)' }}>
                  O ESCANEAR / ESCRIBIR CÓDIGO DEL RETORNO
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    placeholder="Ej: CLI-001 o código de tubo..."
                    value={nuevoRecambioId}
                    onChange={e => setNuevoRecambioId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), agregarRecambioManual())}
                    style={{ flex: 1, minHeight: 36, fontSize: 13 }}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={agregarRecambioManual}>Agregar</button>
                  <button className="btn btn-secondary btn-sm" onClick={startScannerRetorno} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-qrcode" /> Escanear QR
                  </button>
                </div>

                {escaneandoRecambio && (
                  <Modal open={escaneandoRecambio} title="Escanear Tubo Retornado" onClose={stopScannerRetorno} width={400}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 15, alignItems: 'center', background: '#000', padding: 12, borderRadius: 8 }}>
                      <div id={SCANNER_RETORNO_ID} style={{ width: '100%', maxWidth: 320, overflow: 'hidden' }} />
                      <button className="btn btn-danger" onClick={stopScannerRetorno} style={{ width: '100%', height: 42 }}>
                        <i className="ti ti-player-stop" /> Apagar Cámara / Cancelar
                      </button>
                    </div>
                  </Modal>
                )}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>CILINDROS RETORNADOS:</div>
                {recambios.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {recambios.map(rId => (
                      <div key={rId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{rId}</span>
                        <button className="btn-icon btn-sm" onClick={() => setRecambios(prev => prev.filter(x => x !== rId))}>
                          <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
                    Ningún cilindro agregado para retorno (continuá si no retorna)
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-primary" style={{ height: 48 }} onClick={() => setPaso('confirmar')}>
                  Siguiente: Confirmar <i className="ti ti-arrow-right" />
                </button>
                <button className="btn btn-outline" style={{ height: 44 }} onClick={() => setPaso('verificar')}>
                  <i className="ti ti-arrow-left" /> Volver
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* ── PASO 4: CONFIRMAR ─────────────────────────────────────────────── */}
      {paso === 'confirmar' && entregaCreada && (
        <>
          <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '12px 14px', borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-circle-check-filled" /> Entregando ({scannedIds.length} tubos):
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {entregaCreada.detalles?.filter(d => scannedIds.includes(d.tuboId)).map(d => (
                <div key={d.id} style={{ fontSize: 12, color: '#047857', fontFamily: 'var(--font-mono)' }}>• {d.tuboId} ({d.tubo?.gas})</div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '12px 14px', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-arrow-back-up" style={{ color: 'var(--blue)' }} /> Retornando ({recambios.length}):
            </div>
            {recambios.length > 0 ? (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recambios.map(rId => <div key={rId} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>• {rId}</div>)}
              </div>
            ) : (
              <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>Ningún cilindro retornado</div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <FormGroup label="Monto cobrado (Gs.)" hint={`Subtotal de la entrega: ${subtotalDetalles.toLocaleString('es-PY')} Gs.`}>
              <input type="number" min="0" value={montoRecibido} onChange={e => setMontoRecibido(e.target.value)} />
            </FormGroup>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-primary" style={{ height: 50 }} onClick={() => setModalConfirmarAbierto(true)} disabled={confirmando}>
              <i className="ti ti-check" /> {confirmando ? 'Confirmando...' : 'Confirmar Entrega en Salón'}
            </button>
            <button className="btn btn-outline" style={{ height: 44 }} onClick={() => setPaso('retorno')} disabled={confirmando}>
              <i className="ti ti-arrow-left" /> Volver
            </button>
          </div>

          {modalConfirmarAbierto && (
            <Modal open={modalConfirmarAbierto} title="Confirmar entrega en salón" onClose={() => setModalConfirmarAbierto(false)} width={380}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 18px' }}>
                Vas a confirmar la entrega de {scannedIds.length} tubo(s)
                {recambios.length > 0 ? ` y el retorno de ${recambios.length} cilindro(s)` : ', sin retorno de cilindros'}
                {' '}por un monto de <strong>{(Number(montoRecibido) || 0).toLocaleString('es-PY')} Gs.</strong> ¿Confirmás este movimiento?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline" style={{ flex: 1, height: 44 }} onClick={() => setModalConfirmarAbierto(false)} disabled={confirmando}>
                  Cancelar
                </button>
                <button className="btn btn-primary" style={{ flex: 1, height: 44 }}
                  onClick={async () => { setModalConfirmarAbierto(false); await confirmarEntregaSalon() }} disabled={confirmando}>
                  <i className="ti ti-check" /> Sí, confirmar
                </button>
              </div>
            </Modal>
          )}
        </>
      )}

      {paso !== 'datos' && !entregaCreada && (
        <div className="card" style={{ padding: 20 }}><Spinner /></div>
      )}
    </div>
  )
}
