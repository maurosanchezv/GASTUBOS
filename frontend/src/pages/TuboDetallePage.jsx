// gastubos/frontend/src/pages/TuboDetallePage.jsx
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useReactToPrint } from 'react-to-print'
import api from '../services/api.js'
import { PageHeader, StateBadge, Modal, FormGroup, Spinner } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'
import { TRANSICIONES } from '../utils/estadosTubo.js'

const GAS_LABELS = {
  CO2: 'CO₂', OXIGENO: 'Oxígeno', ARGON: 'Argón',
  NITROGENO: 'Nitrógeno', AIRE_COMPRIMIDO: 'Aire comprimido',
  MEZCLA_CO2_ARGON: 'Mezcla CO₂/Argón', ACETILENO: 'Acetileno',
}

// --- ESC/POS Binary Command Builder ---
class EscPosBuilder {
  constructor() {
    this.buffer = [];
  }

  addBytes(bytes) {
    if (Array.isArray(bytes)) {
      this.buffer.push(...bytes);
    } else {
      this.buffer.push(bytes);
    }
    return this;
  }

  addText(text) {
    const cleanText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/g, "n").replace(/Ñ/g, "N");
    for (let i = 0; i < cleanText.length; i++) {
      this.buffer.push(cleanText.charCodeAt(i));
    }
    return this;
  }

  addTextLine(text = '') {
    this.addText(text);
    this.buffer.push(13, 10); // CR, LF
    return this;
  }

  initialize() {
    return this.addBytes([0x1B, 0x40]);
  }

  alignCenter() {
    return this.addBytes([0x1B, 0x61, 0x01]);
  }

  alignLeft() {
    return this.addBytes([0x1B, 0x61, 0x00]);
  }

  alignRight() {
    return this.addBytes([0x1B, 0x61, 0x02]);
  }

  boldOn() {
    return this.addBytes([0x1B, 0x45, 0x01]);
  }

  boldOff() {
    return this.addBytes([0x1B, 0x45, 0x00]);
  }

  doubleSizeOn() {
    return this.addBytes([0x1D, 0x21, 0x11]);
  }

  doubleSizeOff() {
    return this.addBytes([0x1D, 0x21, 0x00]);
  }

  feed(lines = 3) {
    return this.addBytes([0x1B, 0x64, lines]);
  }

  addQRCode(data) {
    // 1. Método Epson Estándar (GS ( k) - para impresoras de escritorio standard
    this.addBytes([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x03]); // Tamaño 3
    this.addBytes([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30]); // ECC L
    
    const dataLength = data.length;
    const totalLength = dataLength + 3;
    const pL = totalLength % 256;
    const pH = Math.floor(totalLength / 256);

    this.addBytes([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]);
    for (let i = 0; i < dataLength; i++) {
      this.buffer.push(data.charCodeAt(i));
    }
    this.addBytes([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]); // Imprimir

    // 2. Método ESC Z (1B 5A) - utilizado por impresoras portátiles HPRT / Rongta / Genéricas
    // Comando: ESC Z [m] [n] [k] [dL] [dH] [datos]
    // m = 2 (QR code), n = 2 (ECC Level M), k = 4 (tamaño de módulo)
    const dL = dataLength % 256;
    const dH = Math.floor(dataLength / 256);
    this.addBytes([0x1B, 0x5A, 0x02, 0x02, 0x04, dL, dH]);
    for (let i = 0; i < dataLength; i++) {
      this.buffer.push(data.charCodeAt(i));
    }

    return this;
  }

  getBuffer() {
    return new Uint8Array(this.buffer);
  }
}

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
  const [qrModal,     setQrModal]     = useState(false)
  const [nuevoEstado, setNuevoEstado] = useState('')
  const [obsEstado,   setObsEstado]   = useState('')
  const [clientes, setClientes] = useState([])
  const [clienteIdReserva, setClienteIdReserva] = useState('')

  // Impresión Bluetooth
  const [printerModalOpen, setPrinterModalOpen] = useState(false)
  const [pairedDevices, setPairedDevices] = useState([])
  const [connectingPrinter, setConnectingPrinter] = useState(false)
  const [selectedDeviceAddress, setSelectedDeviceAddress] = useState('')

  const buscarImpresoras = () => {
    if (!window.bluetoothSerial) {
      toast('Bluetooth no disponible en este dispositivo', 'error')
      return
    }
    setConnectingPrinter(true)
    setPrinterModalOpen(true)
    window.bluetoothSerial.list(
      (devices) => {
        setPairedDevices(devices)
        setConnectingPrinter(false)
        const autoDevice = devices.find(d => d.name && d.name.toUpperCase().includes('HM-A300'))
        if (autoDevice) {
          setSelectedDeviceAddress(autoDevice.address || autoDevice.id)
        }
      },
      (err) => {
        toast('Error al buscar dispositivos: ' + err, 'error')
        setConnectingPrinter(false)
      }
    )
  }

  const imprimirTuboBluetooth = (t, deviceAddress) => {
    if (!window.bluetoothSerial) return
    if (!deviceAddress) {
      toast('Por favor, selecciona una impresora', 'warning')
      return
    }
    setConnectingPrinter(true)
    
    window.bluetoothSerial.connect(
      deviceAddress,
      () => {
        try {
          const clean = (str) => {
            if (!str) return ''
            return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/g, "n").replace(/Ñ/g, "N")
          }

          const gasDesc = clean(`${t.gas} - Talla: ${t.talla || '—'}`)
          const capDesc = clean(`Capacidad: ${t.capacidadLitros ? `${t.capacidadLitros}L` : `${Number(t.capacidadKg || 0)}kg`}`)
          const ownerDesc = clean(t.propietario === 'CLIENTE' ? `PROPIETARIO: CLIENTE - ${t.cliente?.nombre || 'Desconocido'}` : 'PROPIETARIO: PROPIO')
          const nroSerie = t.serie ? clean(`Nro Serie: ${t.serie}`) : ''

          // El ancho de etiqueta para 80mm es de 640 dots a 203 dpi
          // Altura total de etiqueta: 640 dots (aprox 80mm) para que sea cuadrada
          let cpcl = '';
          cpcl += '! 0 200 200 640 1\r\n'; // Header (offset, horizontal dpi, vertical dpi, height, qty)
          cpcl += 'PAGE-WIDTH 640\r\n';
          
          // Título (inicia en y=50 para dejar margen arriba)
          cpcl += 'ALIGN CENTER\r\n';
          cpcl += 'SETBOLD 1\r\n';
          cpcl += 'TEXT 4 0 0 50 ETIQUETA DE CILINDRO\r\n';
          cpcl += 'SETBOLD 0\r\n';
          
          // ID del tubo (Grande, y=95)
          cpcl += 'SETMAG 2 2\r\n';
          cpcl += `TEXT 4 0 0 95 ${clean(t.id)}\r\n`;
          cpcl += 'SETMAG 1 1\r\n';
          
          // Detalles (alineados a la izquierda con un margen de 20 dots)
          cpcl += 'ALIGN LEFT\r\n';
          cpcl += `TEXT 4 0 20 170 ${gasDesc}\r\n`;
          cpcl += `TEXT 4 0 20 200 ${capDesc}\r\n`;
          
          let nextY = 230;
          if (nroSerie) {
            cpcl += `TEXT 4 0 20 ${nextY} ${nroSerie}\r\n`;
            nextY += 30;
          }
          cpcl += `TEXT 4 0 20 ${nextY} ${ownerDesc}\r\n`;
          nextY += 40; // Espaciado cómodo antes del QR
          
          // Código QR grande (U 8, tamaño módulo = 8, ancho aprox 264 dots)
          // x=188 centra el código en el ancho de 640 dots ((640 - 264) / 2 = 188)
          cpcl += 'ALIGN CENTER\r\n';
          cpcl += `B QR 188 ${nextY} M 2 U 8\r\n`;
          cpcl += `${tuboUrl}\r\n`;
          cpcl += 'ENDQR\r\n';
          nextY += 270; // Espaciado para el tamaño del QR (33 * 8 = 264 dots)
          
          // Texto de URL abajo
          cpcl += 'ALIGN CENTER\r\n';
          cpcl += `TEXT 4 0 0 ${nextY} ${clean(tuboUrl).slice(0, 48)}\r\n`;
          if (clean(tuboUrl).length > 48) {
            cpcl += `TEXT 4 0 0 ${nextY + 20} ${clean(tuboUrl).slice(48)}\r\n`;
          }

          cpcl += 'PRINT\r\n';

          // Convertir string de CPCL a Uint8Array
          const encoder = new TextEncoder();
          const binaryBuffer = encoder.encode(cpcl);
          
          window.bluetoothSerial.write(
            binaryBuffer,
            () => {
              toast('Etiqueta enviada correctamente', 'success')
              setConnectingPrinter(false)
              setPrinterModalOpen(false)
              window.bluetoothSerial.disconnect()
            },
            (err) => {
              toast('Error al enviar a impresora: ' + err, 'error')
              setConnectingPrinter(false)
              window.bluetoothSerial.disconnect()
            }
          )
        } catch (e) {
          toast('Error de formato: ' + e.message, 'error')
          setConnectingPrinter(false)
          window.bluetoothSerial.disconnect()
        }
      },
      (err) => {
        toast('No se pudo conectar a la impresora', 'error')
        setConnectingPrinter(false)
      }
    )
  }

  useEffect(() => {
    api.get('/clientes')
      .then(res => setClientes(res.data))
      .catch(() => {})
  }, [])

  const getPublicTuboUrl = () => {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    if (apiUrl.startsWith('http')) {
      const base = apiUrl.replace('/api', '');
      return `${base}/tubos/${id}`;
    }
    return `${window.location.origin}/tubos/${id}`;
  };
  const tuboUrl = getPublicTuboUrl();

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    pageStyle: `
      @page {
        size: 80mm auto;
        margin: 0mm;
      }
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          height: auto !important;
          background: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `
  })

  useEffect(() => { load() }, [id])
  
  useEffect(() => {
    if (params.get('qr') === '1' && tubo) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768 || window.Capacitor
      if (isMobile) {
        setQrModal(true)
      } else {
        setTimeout(handlePrint, 800)
      }
    }
  }, [params, tubo])

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
      await api.post(`/tubos/${id}/cambiar-estado`, {
        estadoNuevo: nuevoEstado,
        observaciones: obsEstado,
        clienteId: nuevoEstado === 'RESERVADO' ? (clienteIdReserva || null) : null
      })
      toast('Estado actualizado', 'success')
      setCambioModal(false)
      setNuevoEstado(''); setObsEstado(''); setClienteIdReserva('')
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
        subtitle={`${tubo.gas} · ${tubo.capacidadLitros ? `${tubo.capacidadLitros}L` : `${Number(tubo.capacidadKg)} kg`} · ${tubo.talla}`}
        actions={
          <>
            <button className="btn btn-sm" onClick={() => navigate('/tubos')}>
              <i className="ti ti-arrow-left" /> Volver
            </button>
            {window.Capacitor || window.innerWidth < 768 ? (
              <button className="btn btn-sm" onClick={() => setQrModal(true)}>
                <i className="ti ti-qrcode" /> Ver QR
              </button>
            ) : (
              <button className="btn btn-sm" onClick={handlePrint}>
                <i className="ti ti-printer" /> Imprimir QR
              </button>
            )}
            <button className="btn btn-sm btn-primary" onClick={() => setCambioModal(true)}>

              <i className="ti ti-refresh" /> Cambiar estado
            </button>
          </>
        }
      />

      <div className="app-content">
        <div className="responsive-grid">
          {/* Info principal */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">Información del tubo</div>
                <StateBadge estado={tubo.estado} />
              </div>
              <div className="form-grid">
                {[
                  ['Código interno', tubo.id],
                  ['Número de serie', tubo.serie],
                  ['Tipo de gas', tubo.gas],
                  ['Capacidad', tubo.capacidadLitros ? `${tubo.capacidadLitros}L` : `${Number(tubo.capacidadKg)} kg`],
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

            {/* Historial de cargas */}
            {tubo.cargas?.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title">Historial de cargas</div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tubo.cargas.length} registro{tubo.cargas.length !== 1 ? 's' : ''}</span>
                </div>
                {/* Vista Desktop: Tabla Completa */}
                <div className="desktop-only table-wrap">
                  <table>
                    <thead>
                      <tr><th>Fecha</th><th>Gas</th><th>Cantidad</th><th>Operador</th><th>Obs.</th></tr>
                    </thead>
                    <tbody>
                      {tubo.cargas.map(c => (
                        <tr key={c.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>
                            {new Date(c.fechaCarga).toLocaleDateString('es-PY')}
                          </td>
                          <td>{GAS_LABELS[c.tipoGas] || c.tipoGas}</td>
                          <td style={{ fontWeight: 600 }}>
                            {Number(c.cantidad).toLocaleString('es-PY')} {c.unidad === 'KG' ? 'kg' : 'm³'}
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                            {c.operador?.nombre || c.operador?.username}
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.observaciones || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Vista Móvil: Lista de Tarjetas */}
                <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
                  {tubo.cargas.map(c => (
                    <div
                      key={c.id}
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                          {GAS_LABELS[c.tipoGas] || c.tipoGas}
                        </strong>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue)' }}>
                          {Number(c.cantidad).toLocaleString('es-PY')} {c.unidad === 'KG' ? 'kg' : 'm³'}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span>Operador: {c.operador?.nombre || c.operador?.username}</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>
                          {new Date(c.fechaCarga).toLocaleDateString('es-PY')}
                        </span>
                      </div>
                      
                      {c.observaciones && (
                        <div style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--text-muted)', borderTop: '0.5px solid var(--border)', paddingTop: 4, marginTop: 2 }}>
                          {c.observaciones}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historial */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Historial de movimientos</div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tubo.auditoria?.length || 0} registros</span>
              </div>
              {tubo.auditoria?.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>Sin movimientos registrados</p>
              ) : (
                <>
                  {/* Vista Desktop: Tabla Completa */}
                  <div className="desktop-only table-wrap">
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

                  {/* Vista Móvil: Lista de Tarjetas */}
                  <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
                    {tubo.auditoria?.map(a => (
                      <div
                        key={a.id}
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{a.accion}</strong>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {new Date(a.createdAt).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Estado:</span>
                          {a.estadoAnterior ? <StateBadge estado={a.estadoAnterior} /> : '—'}
                          <i className="ti ti-arrow-right" style={{ color: 'var(--text-muted)', fontSize: 12 }} />
                          {a.estadoNuevo ? <StateBadge estado={a.estadoNuevo} /> : '—'}
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          Usuario: <strong>{a.usuario?.username}</strong>
                        </div>
                        
                        {a.observaciones && (
                          <div style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--text-muted)', borderTop: '0.5px solid var(--border)', paddingTop: 4 }}>
                            {a.observaciones}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sidebar QR */}
          <div>
            <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 14 }}>Código QR</div>

              {/* Printable label */}
              <div ref={printRef} style={{ width: '74mm', maxWidth: '100%', padding: '10px', boxSizing: 'border-box', textAlign: 'center', margin: '0 auto', background: '#fff' }}>
                <div style={{
                  border: '2px solid #000', borderRadius: 8,
                  padding: 12, display: 'block',
                  fontFamily: 'var(--font-mono)',
                  background: '#fff'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <QRCodeSVG value={tuboUrl} size={150} level="M" />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#000' }}>{tubo.id}</div>
                  <div style={{ fontSize: 10, color: '#000', marginTop: 2 }}>{tubo.gas} · {tubo.capacidadLitros ? `${tubo.capacidadLitros} L` : `${Number(tubo.capacidadKg)} kg`}</div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', marginTop: 4, color: '#000' }}>
                    {tubo.propietario === 'CLIENTE' ? `CLIENTE - ${tubo.cliente?.nombre || 'Desconocido'}` : 'PROPIO'}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 14px', wordBreak: 'break-all' }}>
                {tuboUrl}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {window.Capacitor || window.innerWidth < 768 ? (
                  <>
                    <button className="btn btn-secondary" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => setQrModal(true)}>
                      <i className="ti ti-qrcode" /> Ampliar código QR
                    </button>
                    {(window.Capacitor || window.bluetoothSerial) && (
                      <button className="btn btn-primary" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={buscarImpresoras}>
                        <i className="ti ti-printer" /> Imprimir etiqueta (Bluetooth)
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button className="btn btn-primary" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={handlePrint}>
                      <i className="ti ti-printer" /> Imprimir etiqueta (PC)
                    </button>
                    {window.bluetoothSerial && (
                      <button className="btn btn-secondary" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={buscarImpresoras}>
                        <i className="ti ti-printer" /> Imprimir (Bluetooth)
                      </button>
                    )}
                  </>
                )}
              </div>
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
        {nuevoEstado === 'RESERVADO' && (
          <FormGroup label="Reservar para cliente" required>
            <select value={clienteIdReserva} onChange={e => setClienteIdReserva(e.target.value)}>
              <option value="">Seleccionar cliente...</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </FormGroup>
        )}
        <FormGroup label="Observación">
          <textarea
            value={obsEstado}
            onChange={e => setObsEstado(e.target.value)}
            placeholder="Motivo del cambio (requerido para ciertos estados)..."
            style={{ height: 72 }}
          />
        </FormGroup>
      </Modal>

      {/* Modal visor de QR para móviles */}
      <Modal
        open={qrModal}
        title="Código QR del Cilindro"
        onClose={() => { setQrModal(false); navigate(`/tubos/${id}/detalle`, { replace: true }) }}
        footer={
          <>
            <button className="btn" onClick={() => { setQrModal(false); navigate(`/tubos/${id}/detalle`, { replace: true }) }}>
              Cerrar
            </button>
            {!window.Capacitor && (
              <button className="btn btn-primary" onClick={handlePrint}>
                <i className="ti ti-printer" /> Imprimir
              </button>
            )}
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0' }}>
          <div style={{
            border: '2px solid #000', borderRadius: 8,
            padding: 16, display: 'inline-block',
            background: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,.08)',
            marginBottom: 16
          }}>
            <QRCodeSVG value={tuboUrl} size={180} level="M" />
            <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', textAlign: 'center', color: '#000' }}>
              {tubo.id}
            </div>
            <div style={{ fontSize: 11, textAlign: 'center', color: 'var(--text-secondary)', marginTop: 2 }}>
              {tubo.gas} · {tubo.capacidadLitros ? `${tubo.capacidadLitros}L` : `${Number(tubo.capacidadKg)} kg`}
            </div>
            <div style={{ fontSize: 11, textAlign: 'center', fontWeight: 'bold', color: '#000', marginTop: 4 }}>
              {tubo.propietario === 'CLIENTE' ? `CLIENTE - ${tubo.cliente?.nombre || 'Desconocido'}` : 'PROPIO'}
            </div>
          </div>
          
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 280, margin: '0 auto 8px' }}>
            Escanea este código QR con la cámara de otro dispositivo para acceder directamente a la ficha del cilindro.
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
            {tuboUrl}
          </div>
        </div>
      </Modal>

      {/* Modal para selección de Impresora Bluetooth (HM-A300E) */}
      <Modal
        open={printerModalOpen}
        title="Impresoras Bluetooth Vinculadas"
        onClose={() => setPrinterModalOpen(false)}
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setPrinterModalOpen(false)}
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={() => imprimirTuboBluetooth(tubo, selectedDeviceAddress)}
              disabled={connectingPrinter || !selectedDeviceAddress}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {connectingPrinter ? <Spinner size="sm" /> : <i className="ti ti-printer" />}
              Imprimir Etiqueta
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Asegúrate de que la impresora <strong>HM-A300E</strong> esté encendida y vinculada en los Ajustes de Bluetooth de tu celular.
          </p>

          {connectingPrinter && pairedDevices.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <Spinner />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Buscando dispositivos vinculados...</div>
            </div>
          ) : pairedDevices.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>
              <i className="ti ti-bluetooth-off" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>No se encontraron impresoras vinculadas.</div>
              <button 
                className="btn btn-sm btn-secondary" 
                onClick={buscarImpresoras}
                style={{ marginTop: 10 }}
              >
                Buscar de nuevo
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
              {pairedDevices.map(device => {
                const esHMA300 = device.name && device.name.toUpperCase().includes('HM-A300')
                const esSeleccionado = selectedDeviceAddress === (device.address || device.id)
                return (
                  <div
                    key={device.address || device.id}
                    onClick={() => setSelectedDeviceAddress(device.address || device.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: `1px solid ${esSeleccionado ? 'var(--blue)' : 'var(--border)'}`,
                      background: esSeleccionado ? 'var(--blue-light)' : 'var(--surface-2)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: esSeleccionado ? 600 : 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-bluetooth" style={{ color: esHMA300 ? 'var(--blue)' : 'var(--text-muted)' }} />
                        {device.name || 'Dispositivo sin nombre'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {device.address || device.id}
                      </div>
                    </div>
                    <i 
                      className={`ti ${esSeleccionado ? 'ti-circle-dot' : 'ti-circle'}`} 
                      style={{ color: esSeleccionado ? 'var(--blue)' : 'var(--text-muted)', fontSize: 18 }} 
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}

