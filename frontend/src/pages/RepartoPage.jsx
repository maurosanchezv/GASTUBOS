import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Html5Qrcode } from 'html5-qrcode'
import api from '../services/api.js'
import { useAuthStore } from '../store/authStore.js'
import { useConfigStore } from '../store/configStore.js'
import { PageHeader, Spinner, EmptyState, StateBadge, Modal, formatCapacidad } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'
import { EscPosBuilder } from '../utils/escPosBuilder.js'

const SCANNER_ID = 'reparto-qr-reader'

const TIPO_INFO = {
  ENTREGA_SIMPLE: { label: 'Entrega',  className: 'badge-tipo-ENTREGA_SIMPLE' },
  ALQUILER:       { label: 'Alquiler', className: 'badge-tipo-ALQUILER' },
  VENTA:          { label: 'Venta',    className: 'badge-tipo-VENTA' },
}

export default function RepartoPage() {
  const { user } = useAuthStore()
  const { nombre_empresa, direccion, telefono } = useConfigStore()
  const { toast } = useToast()

  const [entregas, setEntregas] = useState([])
  const [modalDetalle, setModalDetalle] = useState(false)
  const [entregaSeleccionada, setEntregaSeleccionada] = useState(null)
  const [entregaParaImprimir, setEntregaParaImprimir] = useState(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(!navigator.onLine)

  // Impresión Bluetooth
  const [printerModalOpen, setPrinterModalOpen] = useState(false)
  const [pairedDevices, setPairedDevices] = useState([])
  const [connectingPrinter, setConnectingPrinter] = useState(false)
  const [selectedDeviceAddress, setSelectedDeviceAddress] = useState('')
  const [paperWidth, setPaperWidth] = useState(() => {
    const saved = localStorage.getItem('printer_paper_width')
    return saved ? Number(saved) : 48
  })

  const safeParseJSON = (key, fallback = []) => {
    try {
      const val = localStorage.getItem(key)
      return val ? (JSON.parse(val) || fallback) : fallback
    } catch {
      return fallback
    }
  }

  // --- Bluetooth Thermal Printer Integration (HM-A300E) ---
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
        // Auto-seleccionar impresora HM-A300 o FTX/Bluetooth Printer de 58mm
        const autoDevice = devices.find(d => {
          const name = (d.name || '').toUpperCase()
          return name.includes('HM-A300') || name.includes('TDR058') || name.includes('FTX') || name.includes('BLUETOOTH') || name.includes('PRINTER')
        })
        if (autoDevice) {
          setSelectedDeviceAddress(autoDevice.address || autoDevice.id)
          const name = (autoDevice.name || '').toUpperCase()
          const detectedWidth = (name.includes('58') || name.includes('TDR') || name.includes('FTX') || name.includes('BLUETOOTH') || name.includes('PRINTER')) ? 32 : 48
          setPaperWidth(detectedWidth)
          localStorage.setItem('printer_paper_width', String(detectedWidth))
        }
      },
      (err) => {
        toast('Error al buscar dispositivos: ' + err, 'error')
        setConnectingPrinter(false)
      }
    )
  }

  // URL pública de la remisión que codifica el QR del ticket. Al escanearla
  // (con login) abre la página de detalle /remision/:numero. Deriva la base del
  // dominio de la API (quitando /api) para que funcione también desde el APK.
  const getRemisionUrl = (numero) => {
    const apiUrl = import.meta.env.VITE_API_URL || ''
    const base = apiUrl.startsWith('http') ? apiUrl.replace('/api', '') : window.location.origin
    return `${base}/remision/${numero}`
  }

  // Devuelve las líneas de recambios a imprimir. Prioriza los agregados
  // localmente en esta sesión (aún no confirmados en el servidor); si no hay,
  // usa los ya persistidos en la entrega (caso de reimpresión).
  const recambiosParaImprimir = (entrega) => {
    if (recambios && recambios.length > 0) {
      return recambios.map(v => String(v))
    }
    return (entrega?.recambios || []).map(r => {
      const t = r.tuboEntregado || {}
      return (t.observaciones && (t.observaciones.includes(' ') || t.observaciones.length > 15))
        ? t.observaciones
        : `${t.id} (${t.gas || ''})`.trim()
    })
  }

  const imprimirBluetooth = (entrega, deviceAddress) => {
    if (!window.bluetoothSerial) return
    if (!deviceAddress) {
      toast('Por favor, selecciona una impresora', 'warning')
      return
    }
    setConnectingPrinter(true)
    
    let alreadyPrinted = false
    window.bluetoothSerial.connect(
      deviceAddress,
      () => {
        if (alreadyPrinted) return
        alreadyPrinted = true
        try {
          const wrapText = (text, maxChars) => {
            if (!text) return []
            const words = text.split(' ')
            const lines = []
            let currentLine = ''
            
            words.forEach(word => {
              if ((currentLine + word).length <= maxChars) {
                currentLine += (currentLine ? ' ' : '') + word
              } else {
                if (currentLine) lines.push(currentLine)
                let remaining = word
                while (remaining.length > maxChars) {
                  lines.push(remaining.slice(0, maxChars))
                  remaining = remaining.slice(maxChars)
                }
                currentLine = remaining
              }
            })
            if (currentLine) lines.push(currentLine)
            return lines
          }

          const builder = new EscPosBuilder()
          const width = paperWidth
          
          const justify = (left, right) => {
            const pad = Math.max(1, width - left.length - right.length)
            return left + ' '.repeat(pad) + right
          }
          
          const line = () => '-'.repeat(width)
          const doubleLine = () => '='.repeat(width)
          
          const padChar = (text) => {
            const pad = Math.max(0, Math.floor((width - text.length) / 2))
            return ' '.repeat(pad) + text
          }

          builder.initialize()
          
          // Encabezado
          builder.alignCenter().boldOn().doubleSizeOn().addTextLine((nombre_empresa || 'GASTUBOS').toUpperCase()).doubleSizeOff()
          if (direccion) {
            wrapText(direccion, width).forEach(l => builder.addTextLine(l))
          }
          if (telefono) {
            wrapText('Tel: ' + telefono, width).forEach(l => builder.addTextLine(l))
          }
          builder.addTextLine(doubleLine())
          
          // Información de Remisión
          builder.alignLeft().boldOn().addTextLine('REMISION: ' + entrega.numero).boldOff()
          builder.addTextLine(line())

          // Datos del Cliente (mismo orden que la remisión de la computadora)
          const clienteText = 'Cliente: ' + (entrega.cliente?.nombre || '')
          wrapText(clienteText, width).forEach(l => builder.addTextLine(l))
          
          builder.addTextLine('RUC/CI: ' + (entrega.cliente?.ruc || '-'))
          
          const dirText = 'Direccion: ' + (entrega.direccionEntrega || '')
          wrapText(dirText, width).forEach(l => builder.addTextLine(l))
          
          builder.addTextLine('Fecha: ' + new Date(entrega.fechaEntrega).toLocaleString('es-PY'))
          
          const choferText = 'Chofer: ' + (entrega.repartidor?.nombre || 'Sin asignar')
          wrapText(choferText, width).forEach(l => builder.addTextLine(l))
          
          builder.addTextLine('Tipo: ' + (entrega.tipoOperacion || '').replace('_', ' '))
          builder.addTextLine(doubleLine())

          // Detalle de Productos (Tubo/Gas - Cant - Precio - Subtotal)
          builder.boldOn().addTextLine(justify('PRODUCTO', 'SUBTOTAL')).boldOff()
          builder.addTextLine(line())

          let subtotalItems = 0
          entrega.detalles?.forEach(d => {
            const desc = `${d.tuboId} (${d.tubo?.gas || ''})`
            const cant = `${Number(d.cantidadGas)} ${d.unidadGas}`
            const precioUnit = Number(d.precioUnitario).toLocaleString('es-PY')
            const price = Number(d.subtotal).toLocaleString('es-PY') + ' GS'

            builder.addTextLine(desc.slice(0, width))
            builder.addTextLine(justify(`  ${cant} x ${precioUnit}`, price))
            subtotalItems += Number(d.subtotal)
          })
          builder.addTextLine(line())

          // Totales
          const deliveryCost = Number(entrega.costoDelivery || 0)
          builder.addTextLine(justify('DELIVERY:', deliveryCost.toLocaleString('es-PY') + ' GS'))
          builder.boldOn().addTextLine(justify('TOTAL:', (subtotalItems + deliveryCost).toLocaleString('es-PY') + ' GS')).boldOff()
          builder.addTextLine(doubleLine())

          // Recambios/Devoluciones
          const recsBT = recambiosParaImprimir(entrega)
          if (recsBT.length > 0) {
            builder.boldOn().addTextLine('RECAMBIOS RECIBIDOS:').boldOff()
            recsBT.forEach(desc => {
              const wrapped = wrapText(desc, width - 2)
              wrapped.forEach((lineText, idx) => {
                if (idx === 0) {
                  builder.addTextLine('- ' + lineText)
                } else {
                  builder.addTextLine('  ' + lineText)
                }
              })
            })
            builder.addTextLine(line())
          }

          // Observaciones
          if (entrega.observaciones) {
            const obsText = 'Obs: ' + entrega.observaciones
            wrapText(obsText, width).forEach(l => builder.addTextLine(l))
            builder.addTextLine(line())
          }
          
          // Firmas side-by-side
          builder.addTextLine('').addTextLine('')
          const lineLength = width >= 48 ? 18 : 13
          const leftLine = '-'.repeat(lineLength)
          const rightLine = '-'.repeat(lineLength)
          const spacesBetweenLines = width - (lineLength * 2)
          builder.addTextLine(leftLine + ' '.repeat(spacesBetweenLines) + rightLine)
          
          const labelLeft = 'Firma Chofer'
          const labelRight = 'Firma Cliente'
          const padLeft = Math.max(0, Math.floor((lineLength - labelLeft.length) / 2))
          const padRight = Math.max(0, Math.floor((lineLength - labelRight.length) / 2))
          
          const strLeft = ' '.repeat(padLeft) + labelLeft + ' '.repeat(Math.max(0, lineLength - labelLeft.length - padLeft))
          const strRight = ' '.repeat(padRight) + labelRight + ' '.repeat(Math.max(0, lineLength - labelRight.length - padRight))
          
          builder.addTextLine(strLeft + ' '.repeat(spacesBetweenLines) + strRight)
          builder.addTextLine('')
          
          // Pie de ticket
          builder.alignCenter().boldOn().addTextLine('Gracias por su preferencia!').boldOff()
          // Espaciado generoso al final para evitar superposiciones con la siguiente impresión
          builder.addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('').addTextLine('')
          builder.feed(4)
          
          const binaryBuffer = builder.getBuffer()
          
          window.bluetoothSerial.write(
            binaryBuffer, // Enviar Uint8Array directamente para asegurar compatibilidad con el puente Capacitor-Android
            () => {
              toast('Impresión enviada correctamente', 'success')
              setConnectingPrinter(false)
              setPrinterModalOpen(false)
              window.bluetoothSerial.disconnect()
            },
            (err) => {
              toast('Error al enviar datos a la impresora: ' + err, 'error')
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
        toast('No se pudo conectar a la impresora. ¿Está encendida?', 'error')
        setConnectingPrinter(false)
      }
    )
  }

  const handlePrintClick = (entrega) => {
    setEntregaParaImprimir(entrega)
    setModalDetalle(false) // Close the detail modal first to avoid overlay conflict
    if (window.bluetoothSerial) {
      buscarImpresoras()
    } else {
      window.print()
    }
  }
  
  // Entrega seleccionada para entrega activa en calle
  const [activeEntrega, setActiveEntrega] = useState(null)
  const [entregaStep, setEntregaStep] = useState(1)
  const [calcGas, setCalcGas] = useState('Oxígeno')
  const [calcCapacidad, setCalcCapacidad] = useState('6 m³')
  
  // Escáner QR
  const [escaneando, setEscaneando] = useState(false)
  const [scannedIds, setScannedIds] = useState([]) // IDs de tubos validados de la entrega activa
  const scannerRef = useRef(null)

  const [recambios, setRecambios] = useState([])
  const [nuevoRecambioId, setNuevoRecambioId] = useState('')
  const [escaneandoRecambio, setEscaneandoRecambio] = useState(false)

  const [seccion, setSeccion] = useState('ruta') // 'ruta', 'historial' o 'camion'
  const [historialHoy, setHistorialHoy] = useState([])
  const [manualTuboId, setManualTuboId] = useState('')
  const [metodoPago, setMetodoPago] = useState('EFECTIVO')
  const [montoRecibido, setMontoRecibido] = useState('')

  // Estado para gestión de camión asignado al chofer
  const [camiones, setCamiones] = useState([])
  const [selectedCamionId, setSelectedCamionId] = useState(localStorage.getItem('repartidor_camion_id') || '')
  const [camionStock, setCamionStock] = useState([])
  const [loadingCamion, setLoadingCamion] = useState(false)

  const totalIds = activeEntrega?.detalles?.map(d => d.tuboId) || []
  const todosListos = totalIds.length > 0 && totalIds.every(id => scannedIds.includes(id))
  const progreso = totalIds.length === 0 ? 0 : Math.round((scannedIds.length / totalIds.length) * 100)
  const activeTipo = activeEntrega ? (TIPO_INFO[activeEntrega.tipoOperacion] || { label: activeEntrega.tipoOperacion, className: 'badge-OPERADOR' }) : null

  // Cargar ruta asignada
  const fetchRuta = async () => {
    if (!user) return
    setLoading(true)
    try {
      if (navigator.onLine) {
        // Si es REPARTIDOR, filtra por su propio repartidorId. Si es ADMIN/OPERADOR, ve todas.
        const queryParams = user.rol === 'REPARTIDOR' ? `&repartidorId=${user.id}` : ''
        const res = await api.get(`/entregas?confirmada=false&limit=100${queryParams}`)
        const data = res.data.entregas || []
        setEntregas(data)
        // Guardar copia local de respaldo
        localStorage.setItem(`ruta_offline_${user.id}`, JSON.stringify(data))
      } else {
        // Carga offline
        setEntregas(safeParseJSON(`ruta_offline_${user.id}`))
        setOffline(true)
      }
    } catch (err) {
      // Si falla y hay copia local, la cargamos
      setEntregas(safeParseJSON(`ruta_offline_${user.id}`))
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }

  const fetchHistorialHoy = async () => {
    if (!user) return
    try {
      if (navigator.onLine) {
        const hoy = new Date().toISOString().split('T')[0]
        const queryParams = user.rol === 'REPARTIDOR' ? `&repartidorId=${user.id}` : ''
        const resConf = await api.get(`/entregas?confirmada=true&desde=${hoy}&limit=50${queryParams}`)
        const resCanc = await api.get(`/entregas?cancelada=true&desde=${hoy}&limit=50${queryParams}`)
        const sorted = [...(resConf.data.entregas || []), ...(resCanc.data.entregas || [])].sort(
          (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        )
        setHistorialHoy(sorted)
        localStorage.setItem(`historial_hoy_offline_${user.id}`, JSON.stringify(sorted))
      } else {
        setHistorialHoy(safeParseJSON(`historial_hoy_offline_${user.id}`))
      }
    } catch {
      setHistorialHoy(safeParseJSON(`historial_hoy_offline_${user.id}`))
    }
  }

  // Sincronizar confirmaciones y cancelaciones acumuladas sin señal
  async function sincronizarConfirmacionesPendientes() {
    const queueConf = safeParseJSON('confirmaciones_offline')
    const queueCanc = safeParseJSON('cancelaciones_offline')
    if (queueConf.length === 0 && queueCanc.length === 0) return

    let exitosos = 0
    let fallidos = 0

    // Sincronizar confirmaciones
    if (queueConf.length > 0) {
      const confFallidas = []
      for (const item of queueConf) {
        try {
          const cId = typeof item === 'object' && item !== null ? item.id : item
          const recs = typeof item === 'object' && item !== null ? item.recambios : []
          const confs = typeof item === 'object' && item !== null ? item.confirmados : undefined
          const met = typeof item === 'object' && item !== null ? item.metodoPago : undefined
          const mont = typeof item === 'object' && item !== null ? item.montoRecibido : undefined
          await api.put(`/entregas/${cId}/confirmar`, {
            recambios: recs,
            confirmados: confs,
            metodoPago: met,
            montoRecibido: mont
          })
          exitosos++
        } catch (err) {
          fallidos++
          confFallidas.push(item)
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

  // Sincronizar monto recibido al cambiar los verificados
  useEffect(() => {
    if (!activeEntrega) return
    const subtotalScanned = (activeEntrega.detalles || [])
      .filter(d => scannedIds.includes(d.tuboId))
      .reduce((acc, d) => acc + Number(d.subtotal), 0)
    
    const delivery = Number(activeEntrega.costoDelivery || 0)
    setMontoRecibido(subtotalScanned + delivery)
  }, [scannedIds, activeEntrega])

  const agregarTuboAdicional = async (entregaId, tuboId) => {
    if (!tuboId.trim()) return
    const id = tuboId.trim().toUpperCase()
    
    if (activeEntrega?.detalles?.some(d => d.tuboId === id)) {
      toast('El tubo ya se encuentra en esta entrega', 'info')
      return
    }

    try {
      if (navigator.onLine) {
        const res = await api.post(`/entregas/${entregaId}/agregar-tubo`, { tuboId: id })
        toast('Tubo agregado al pedido con éxito', 'success')
        
        fetchRuta()
        const nuevoDetalle = res.data.detalle
        setActiveEntrega(prev => ({
          ...prev,
          detalles: [...(prev.detalles || []), nuevoDetalle]
        }))
        setScannedIds(prev => [...prev, id]) // Validar automáticamente
      } else {
        toast('Se requiere conexión a internet para agregar tubos adicionales al pedido', 'warning')
      }
    } catch (err) {
      toast(err.response?.data?.error || 'Error al agregar tubo al pedido', 'error')
    }
  }

  const handleManualVerify = () => {
    if (!manualTuboId.trim()) return
    const id = manualTuboId.trim().toUpperCase()
    const matches = activeEntrega?.detalles?.some(d => d.tuboId === id)
    if (matches) {
      setScannedIds(prev => {
        if (prev.includes(id)) {
          toast('Tubo ya verificado', 'info')
          return prev
        } else {
          toast(`Tubo ${id} verificado con éxito`, 'success')
          return [...prev, id]
        }
      })
      setManualTuboId('')
    } else {
      const confirmAdd = window.confirm(`El tubo ${id} no pertenece a esta remisión. ¿Deseas agregarlo al pedido de este cliente?`)
      if (confirmAdd) {
        agregarTuboAdicional(activeEntrega.id, id)
        setManualTuboId('')
      }
    }
  }

  // Iniciar lector QR para recambios
  const startScannerRecambio = () => {
    setEscaneandoRecambio(true)
    setTimeout(() => {
      const scanner = new Html5Qrcode(SCANNER_ID)
      scannerRef.current = scanner
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          let id = text
          if (text.includes('/tubos/')) {
            id = text.split('/tubos/')[1].split('?')[0].split('/')[0]
          }
          
          setRecambios(prev => {
            if (prev.includes(id)) {
              toast('Tubo ya agregado al recambio', 'info')
              return prev
            } else {
              toast(`Tubo ${id} agregado al recambio`, 'success')
              return [...prev, id]
            }
          })
          stopScannerRecambio()
        },
        () => {}
      ).catch(err => {
        toast('No se pudo acceder a la cámara: ' + err, 'error')
        setEscaneandoRecambio(false)
      })
    }, 150)
  }

  const stopScannerRecambio = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current = null
      } catch (err) {
        console.error('Error al apagar el escáner', err)
      }
    }
    setEscaneandoRecambio(false)
  }

  const agregarRecambioManual = () => {
    const rawVal = nuevoRecambioId.trim()
    if (!rawVal) return
    const val = (rawVal.includes(' ') || rawVal.length > 15) ? rawVal : rawVal.toUpperCase()
    if (recambios.includes(val)) {
      toast('Tubo o descripción ya agregado', 'info')
    } else {
      setRecambios(prev => [...prev, val])
      toast(`Agregado: "${val}"`, 'success')
      setNuevoRecambioId('')
    }
  }

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



  const fetchCamiones = async () => {
    try {
      const res = await api.get('/camiones')
      setCamiones(res.data.filter(c => c.activo))
    } catch {}
  }

  const fetchCamionStock = async (cId) => {
    if (!cId) return
    setLoadingCamion(true)
    try {
      const res = await api.get(`/camiones/${cId}/stock`)
      setCamionStock(res.data)
    } catch {}
    finally { setLoadingCamion(false) }
  }

  const handleSelectCamion = (id) => {
    setSelectedCamionId(id)
    if (id) {
      localStorage.setItem('repartidor_camion_id', id)
      fetchCamionStock(id)
    } else {
      localStorage.removeItem('repartidor_camion_id')
      setCamionStock([])
    }
  }

  useEffect(() => {
    if (seccion === 'camion') {
      fetchCamiones()
      if (selectedCamionId) {
        fetchCamionStock(selectedCamionId)
      }
    }
  }, [seccion, selectedCamionId])

  useEffect(() => {
    fetchRuta()
    fetchHistorialHoy()
    
    const interval = setInterval(() => {
      if (navigator.onLine) {
        fetchRuta()
        fetchHistorialHoy()
      }
    }, 5 * 60 * 1000)

    if (navigator.onLine) {
      sincronizarConfirmacionesPendientes()
    }

    return () => clearInterval(interval)
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
            stopScanner()
            const confirmAdd = window.confirm(`El tubo ${id} no pertenece a esta remisión. ¿Deseas agregarlo al pedido de este cliente?`)
            if (confirmAdd) {
              agregarTuboAdicional(entrega.id, id)
            }
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

  // Manejar clic en pestañas de navegación con validación de entrega activa
  const handleTabClick = (nuevaSeccion) => {
    if (activeEntrega) {
      toast('Tenés una entrega activa en curso. Confirmá o cancelá la entrega actual para poder cambiar de pestaña.', 'warning')
      return
    }
    setSeccion(nuevaSeccion)
  }

  // Seleccionar remisión para entregar
  const iniciarEntrega = (entrega) => {
    setActiveEntrega(entrega)
    setEntregaStep(1)
    setScannedIds([])
    setRecambios([])
    setNuevoRecambioId('')
    setManualTuboId('')
    setMetodoPago('EFECTIVO')
    const subtotal = entrega.detalles?.reduce((acc, d) => acc + Number(d.subtotal), 0) || 0
    const delivery = Number(entrega.costoDelivery || 0)
    setMontoRecibido(subtotal + delivery)
  }

  const cancelarEntregaActiva = () => {
    stopScanner()
    stopScannerRecambio()
    setActiveEntrega(null)
    setEntregaStep(1)
    setScannedIds([])
    setRecambios([])
    setNuevoRecambioId('')
    setManualTuboId('')
    setMetodoPago('EFECTIVO')
    setMontoRecibido('')
  }

  // Confirmar entrega físicamente
  const confirmarEntrega = async (entregaId) => {
    try {
      const payload = {
        confirmados: scannedIds,
        recambios,
        metodoPago,
        montoRecibido: Number(montoRecibido) || 0
      }
      if (navigator.onLine) {
        await api.put(`/entregas/${entregaId}/confirmar`, payload)
        toast('Entrega confirmada y registrada en el servidor', 'success')
      } else {
        // Registrar confirmación localmente
        const queue = safeParseJSON('confirmaciones_offline')
        const existe = queue.find(x => (typeof x === 'object' && x !== null ? x.id : x) === entregaId)
        if (!existe) {
          queue.push({ id: entregaId, ...payload })
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
      fetchHistorialHoy()
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
        const queue = safeParseJSON('cancelaciones_offline')
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



  return (
    <>
      <PageHeader
        title="Ruta de Reparto Móvil"
        subtitle={offline ? "TRABAJANDO FUERA DE LÍNEA (MODO LOCAL)" : "Entregas asignadas a tu planilla de ruta"}
        actions={
          <button
            className="btn btn-sm"
            onClick={() => { fetchRuta(); fetchHistorialHoy(); }}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <i className={`ti ti-refresh ${loading ? 'ti-spin' : ''}`} />
            Actualizar
          </button>
        }
      />

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '0 16px', position: 'sticky', top: 0, zIndex: 100 }}>
        <button
          onClick={() => handleTabClick('ruta')}
          style={{
            flex: 1,
            padding: '12px',
            background: 'none',
            border: 'none',
            borderBottom: seccion === 'ruta' ? '3px solid var(--blue)' : '3px solid transparent',
            color: seccion === 'ruta' ? 'var(--blue)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: activeEntrega ? (seccion === 'ruta' ? 'pointer' : 'not-allowed') : 'pointer',
            opacity: activeEntrega ? (seccion === 'ruta' ? 1 : 0.6) : 1,
            fontSize: '13px'
          }}
        >
          Entregas Activas ({entregas.length})
        </button>
        <button
          onClick={() => handleTabClick('historial')}
          style={{
            flex: 1,
            padding: '12px',
            background: 'none',
            border: 'none',
            borderBottom: seccion === 'historial' ? '3px solid var(--blue)' : '3px solid transparent',
            color: seccion === 'historial' ? 'var(--blue)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: activeEntrega ? (seccion === 'historial' ? 'pointer' : 'not-allowed') : 'pointer',
            opacity: activeEntrega ? (seccion === 'historial' ? 1 : 0.6) : 1,
            fontSize: '13px'
          }}
        >
          Historial de Hoy ({historialHoy.length})
        </button>
        <button
          onClick={() => handleTabClick('camion')}
          style={{
            flex: 1,
            padding: '12px',
            background: 'none',
            border: 'none',
            borderBottom: seccion === 'camion' ? '3px solid var(--blue)' : '3px solid transparent',
            color: seccion === 'camion' ? 'var(--blue)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: activeEntrega ? (seccion === 'camion' ? 'pointer' : 'not-allowed') : 'pointer',
            opacity: activeEntrega ? (seccion === 'camion' ? 1 : 0.6) : 1,
            fontSize: '13px'
          }}
        >
          Mi Camión
        </button>
      </div>

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

            {seccion === 'ruta' ? (
              entregas.length === 0 ? (
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

                      {e.repartidor && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--surface-2)', padding: '4px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <i className="ti ti-truck" style={{ color: 'var(--blue)' }} />
                          <span>Chofer: <strong>{e.repartidor.nombre}</strong></span>
                        </div>
                      )}

                      <div className="reparto-card-actions">
                        <a
                          href={tieneGps
                            ? `https://www.google.com/maps?q=${e.latitud},${e.longitud}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.direccionEntrega || '')}`}
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
              )
            ) : seccion === 'historial' ? (
              historialHoy.length === 0 ? (
                <EmptyState icon="ti-history" message="No tienes entregas realizadas o canceladas hoy" />
              ) : (
                <div className="reparto-grid">
                  {historialHoy.map(e => {
                    const tipo = TIPO_INFO[e.tipoOperacion] || { label: e.tipoOperacion, className: 'badge-OPERADOR' }
                    return (
                      <div 
                        key={e.id} 
                        className="reparto-card" 
                        style={{ opacity: 0.85, cursor: 'pointer' }}
                        onClick={() => {
                          setEntregaSeleccionada(e)
                          setModalDetalle(true)
                        }}
                      >
                        <div className="reparto-card-head">
                          <span className="reparto-card-num">{e.numero}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <span className={`badge ${tipo.className}`}>{tipo.label}</span>
                            {e.confirmada && <span className="badge badge-success">Confirmada</span>}
                            {e.cancelada && <span className="badge badge-danger" title={e.motivoCancelacion}>Cancelada</span>}
                          </div>
                        </div>

                        <div className="reparto-card-cli">{e.cliente?.nombre}</div>

                        <div className="reparto-card-addr">
                          <i className="ti ti-map-pin" style={{ color: 'var(--text-muted)', marginTop: 2 }} />
                          <span>{e.direccionEntrega}</span>
                        </div>

                        <div className="reparto-card-meta">
                          <span><i className="ti ti-cylinder" /> {e.detalles?.length || 0} tubo{e.detalles?.length === 1 ? '' : 's'}</span>
                          {e.metodoPago && <span><i className="ti ti-credit-card" /> {e.metodoPago}</span>}
                          {e.montoRecibido !== null && <span><i className="ti ti-currency-dollar" /> {Number(e.montoRecibido).toLocaleString('es-PY')} GS</span>}
                        </div>

                        {e.repartidor && (
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--surface-2)', padding: '4px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                            <i className="ti ti-truck" style={{ color: 'var(--blue)' }} />
                            <span>Chofer: <strong>{e.repartidor.nombre}</strong></span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Selecciona tu Vehículo / Camión</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select 
                      value={selectedCamionId} 
                      onChange={e => handleSelectCamion(e.target.value)}
                      style={{ flex: 1, height: 40 }}
                    >
                      <option value="">-- Sin Vehículo Asignado --</option>
                      {camiones.map(c => (
                        <option key={c.id} value={c.id}>{c.placa} (Capacidad: {c.capacidadMax})</option>
                      ))}
                    </select>
                    {selectedCamionId && (
                      <button className="btn btn-secondary" onClick={() => fetchCamionStock(selectedCamionId)} disabled={loadingCamion} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40 }} title="Actualizar stock">
                        <i className={`ti ti-refresh ${loadingCamion ? 'ti-spin' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>

                {selectedCamionId ? (
                  loadingCamion ? (
                    <Spinner />
                  ) : (
                    <>
                      {(() => {
                        const camion = camiones.find(c => c.id === selectedCamionId)
                        if (!camion) return null
                        const ocupados = camionStock.length
                        const libres = camion.capacidadMax - ocupados
                        const pct = Math.min(100, Math.round((ocupados / camion.capacidadMax) * 100))
                        return (
                          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>Carga Actual ({ocupados} / {camion.capacidadMax})</span>
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{libres} libres</span>
                            </div>
                            <div className="progress-bar-bg" style={{ width: '100%', height: 10, background: '#E2E8F0', borderRadius: 5, overflow: 'hidden' }}>
                              <div className="progress-bar-fg" style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? 'var(--red)' : 'var(--green)' }} />
                            </div>
                          </div>
                        )
                      })()}

                      <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                          CILINDROS EN EL VEHÍCULO
                        </div>
                        {camionStock.length === 0 ? (
                          <EmptyState icon="ti-cylinder" message="El camión no tiene cilindros asignados" />
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {camionStock.map((t, idx) => (
                              <div 
                                key={t.id} 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'space-between', 
                                  padding: '12px 16px', 
                                  borderBottom: idx === camionStock.length - 1 ? 'none' : '1px solid var(--border-light)' 
                                }}
                              >
                                <div>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: 13 }}>{t.id}</div>
                                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    {t.gas} · {formatCapacidad(t)}
                                  </div>
                                </div>
                                <span className={`badge badge-${t.estado}`} style={{ fontSize: 10 }}>
                                  {t.estado === 'DEVUELTO' ? 'DEVUELTO (VACÍO)' : 'EN TRÁNSITO'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )
                ) : (
                  <EmptyState icon="ti-truck" message="Selecciona un vehículo para ver su stock actual" />
                )}
              </div>
            )}
          </>
        ) : (
          // VISTA 2: PROCESO DE ENTREGA ACTIVA
          (
            <div className="reparto-active">
              {/* Encabezado del ticket */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <button className="btn btn-sm" onClick={cancelarEntregaActiva}>
                  <i className="ti ti-arrow-left" /> Volver a Hoja de Ruta
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${activeTipo?.className}`}>{activeTipo?.label}</span>
                  <span className="reparto-card-num">{activeEntrega.numero}</span>
                </div>
              </div>

              {/* Indicador de pasos */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8, marginBottom: 16, border: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: entregaStep === 1 ? 700 : 500, color: entregaStep === 1 ? 'var(--blue)' : 'var(--text-secondary)' }}>
                    1. Escanear
                  </span>
                  <span style={{ fontSize: 12, fontWeight: entregaStep === 2 ? 700 : 500, color: entregaStep === 2 ? 'var(--blue)' : 'var(--text-secondary)' }}>
                    2. Retorno
                  </span>
                  <span style={{ fontSize: 12, fontWeight: entregaStep === 3 ? 700 : 500, color: entregaStep === 3 ? 'var(--blue)' : 'var(--text-secondary)' }}>
                    3. Imprimir
                  </span>
                  <span style={{ fontSize: 12, fontWeight: entregaStep === 4 ? 700 : 500, color: entregaStep === 4 ? 'var(--blue)' : 'var(--text-secondary)' }}>
                    4. Confirmar
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                  PASO {entregaStep} DE 4
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
                              {d.tubo?.gas} · {Number(d.cantidadGas)} {d.unidadGas}
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

                {/* Columna derecha: Lógica por pasos */}
                <div>
                  {entregaStep === 1 && (
                    // PASO 1: ESCANEO Y VALIDACIÓN
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-primary)' }}>
                          1. ESCANEAR CILINDROS DE LA ORDEN
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

                      {/* Ingreso manual alternativo */}
                      <div style={{ marginBottom: 16, background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6, color: 'var(--text-secondary)' }}>
                          INGRESO MANUAL (CÓDIGO QR DAÑADO)
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            placeholder="Ej: TUBO-00001..."
                            value={manualTuboId}
                            onChange={e => setManualTuboId(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleManualVerify())}
                            style={{ flex: 1, textTransform: 'uppercase', minHeight: 36, fontSize: 13 }}
                          />
                          <button className="btn btn-secondary btn-sm" onClick={handleManualVerify}>
                            Validar
                          </button>
                        </div>
                      </div>

                      {/* Botón de Siguiente */}
                      <div style={{ marginTop: 24 }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => setEntregaStep(2)}
                          disabled={scannedIds.length === 0}
                          style={{ width: '100%', height: 48, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          Siguiente: Retorno de Cilindros <i className="ti ti-arrow-right" />
                        </button>
                      </div>
                    </>
                  )}

                  {entregaStep === 2 && (
                    // PASO 2: RETORNO DE CILINDROS (RECAMBIO)
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-primary)' }}>
                        2. SELECCIONAR RETORNO DE CILINDROS
                      </div>

                      {/* CALCULADORA / SELECTOR RÁPIDO */}
                      <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 12 }}>
                        {/* Display de selección actual */}
                        <div style={{ 
                          background: 'var(--blue-light)', 
                          border: '1px solid rgba(26, 95, 168, 0.2)', 
                          borderRadius: 6, 
                          padding: '10px 12px', 
                          marginBottom: 12, 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center' 
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue-dark)' }}>SELECCIÓN:</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue-dark)' }}>
                            {calcGas} {calcCapacidad}
                          </span>
                        </div>

                        {/* Teclado - Fila 1: Gases */}
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>1. Seleccionar Gas</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                            {['CO2', 'Oxígeno', 'Argón', 'Nitrógeno', 'Aire comprimido', 'Acetileno', 'Mezcla Ar+CO2', 'Mezcla especial'].map(g => (
                              <button
                                key={g}
                                type="button"
                                onClick={() => {
                                  setCalcGas(g)
                                  const gLower = g.toLowerCase()
                                  if (gLower === 'acetileno') {
                                    setCalcCapacidad('6 kg')
                                  } else if (gLower === 'co2') {
                                    setCalcCapacidad('25 kg')
                                  } else {
                                    setCalcCapacidad('6 m³')
                                  }
                                }}
                                style={{
                                  padding: '8px 4px',
                                  fontSize: 11,
                                  fontWeight: calcGas === g ? 700 : 500,
                                  background: calcGas === g ? 'var(--blue)' : 'var(--surface-1)',
                                  color: calcGas === g ? '#fff' : 'var(--text-secondary)',
                                  border: `1px solid ${calcGas === g ? 'var(--blue)' : 'var(--border)'}`,
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  boxShadow: calcGas === g ? '0 2px 4px rgba(26, 95, 168, 0.2)' : 'none'
                                }}
                              >
                                {g}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Teclado - Fila 2: Capacidad */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>2. Seleccionar Capacidad</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                            {(calcGas === 'Acetileno'
                              ? ['1 kg', '1.2 kg', '1.5 kg', '2 kg', '2.5 kg', '3 kg', '3.5 kg', '4 kg', '4.5 kg', '5 kg', '5.5 kg', '6 kg', '7 kg', '8 kg']
                              : calcGas === 'CO2'
                                ? ['1 kg', '2 kg', '3 kg', '4 kg', '5 kg', '6 kg', '7 kg', '8 kg', '10 kg', '13 kg', '15 kg', '20 kg', '25 kg', '30 kg']
                                : ['1 m³', '1.5 m³', '2.5 m³', '3 m³', '4 m³', '5 m³', '6 m³', '6.5 m³', '7 m³', '7.15 m³', '7.5 m³', '8.5 m³']
                            ).map(cap => (
                              <button
                                key={cap}
                                type="button"
                                onClick={() => setCalcCapacidad(cap)}
                                style={{
                                  padding: '8px 4px',
                                  fontSize: 11,
                                  fontWeight: calcCapacidad === cap ? 700 : 500,
                                  background: calcCapacidad === cap ? 'var(--blue-mid)' : 'var(--surface-1)',
                                  color: calcCapacidad === cap ? '#fff' : 'var(--text-secondary)',
                                  border: `1px solid ${calcCapacidad === cap ? 'var(--blue-mid)' : 'var(--border)'}`,
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  boxShadow: calcCapacidad === cap ? '0 2px 4px rgba(59, 125, 216, 0.2)' : 'none'
                                }}
                              >
                                {cap}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Botón de Acción Principal */}
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            const baseDesc = `${calcGas} ${calcCapacidad}`
                            let desc = baseDesc
                            let suffix = 2
                            while (recambios.includes(desc)) {
                              desc = `${baseDesc} #${suffix}`
                              suffix++
                            }
                            setRecambios(prev => [...prev, desc])
                            toast(`Agregado retorno: ${desc}`, 'success')
                          }}
                          style={{ width: '100%', height: 44, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          <i className="ti ti-plus" /> Agregar Retorno
                        </button>
                      </div>

                      {/* Opción Alternativa: Cargar Código QR o Manual */}
                      <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16 }}>
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
                          <button className="btn btn-secondary btn-sm" onClick={agregarRecambioManual}>
                            Agregar
                          </button>
                          {escaneandoRecambio ? (
                            <button className="btn btn-danger btn-sm" onClick={stopScannerRecambio}>
                              Apagar
                            </button>
                          ) : (
                            <button className="btn btn-secondary btn-sm" onClick={startScannerRecambio} title="Escanear QR">
                              <i className="ti ti-qrcode" />
                            </button>
                          )}
                        </div>

                        {escaneandoRecambio && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', background: '#000', padding: 12, borderRadius: 8, marginTop: 10 }}>
                            <div id={SCANNER_ID} style={{ width: '100%', maxWidth: '320px', overflow: 'hidden' }} />
                          </div>
                        )}
                      </div>

                      {/* Lista de Recambios Agregados */}
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                          CILINDROS RETORNADOS:
                        </div>
                        {recambios.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {recambios.map(rId => (
                              <div key={rId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{rId}</span>
                                <button className="btn-icon btn-sm" onClick={() => setRecambios(prev => prev.filter(x => x !== rId))} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', cursor: 'pointer', borderRadius: 4, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
                            Ningún cilindro agregado para recambio (presiona continuar si no retorna)
                          </div>
                        )}
                      </div>

                      {/* Botones de Navegación */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => setEntregaStep(3)}
                          style={{ width: '100%', height: 48, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          Siguiente: Imprimir Remisión <i className="ti ti-arrow-right" />
                        </button>
                        <button
                          className="btn btn-outline"
                          onClick={() => setEntregaStep(1)}
                          style={{ width: '100%', height: 44, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          <i className="ti ti-arrow-left" /> Volver a Escaneo
                        </button>
                      </div>
                    </>
                  )}

                  {entregaStep === 3 && (
                    // PASO 3: IMPRIMIR REMISIÓN
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-primary)' }}>
                        3. IMPRIMIR REMISIÓN
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 10px', textAlign: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16 }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue-light)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                          <i className="ti ti-printer" style={{ fontSize: 26 }} />
                        </div>
                        <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Impresión del Recibo</h4>
                        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 240 }}>
                          Antes de confirmar la entrega, podés imprimir el comprobante de remisión para el cliente.
                        </p>
                        
                        <button
                          className="btn btn-primary"
                          onClick={() => handlePrintClick(activeEntrega)}
                          style={{ width: '100%', height: 44, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                        >
                          <i className="ti ti-printer" /> Imprimir Remisión (Ticket)
                        </button>
                      </div>

                      {/* Botones de Navegación */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => setEntregaStep(4)}
                          style={{ width: '100%', height: 48, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          Siguiente: Confirmar y Guardar <i className="ti ti-arrow-right" />
                        </button>
                        <button
                          className="btn btn-outline"
                          onClick={() => setEntregaStep(2)}
                          style={{ width: '100%', height: 44, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          <i className="ti ti-arrow-left" /> Volver a Retorno
                        </button>
                      </div>
                    </>
                  )}

                  {entregaStep === 4 && (
                    // PASO 4: CONFIRMAR Y GUARDAR
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-primary)' }}>
                        4. RESUMEN Y CONFIRMACIÓN
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Resumen Entregas */}
                        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '12px 14px', borderRadius: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="ti ti-circle-check-filled" style={{ fontSize: 18 }} />
                            Entregando ({scannedIds.length} tubos):
                          </div>
                          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {activeEntrega.detalles?.filter(d => scannedIds.includes(d.tuboId)).map(d => (
                              <div key={d.id} style={{ fontSize: 12, color: '#047857', fontFamily: 'var(--font-mono)' }}>
                                • {d.tuboId} ({d.tubo?.gas})
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Resumen Retornos */}
                        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '12px 14px', borderRadius: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="ti ti-arrow-back-up" style={{ fontSize: 18, color: 'var(--blue)' }} />
                            Retornando ({recambios.length} tubos):
                          </div>
                          {recambios.length > 0 ? (
                            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {recambios.map(rId => (
                                <div key={rId} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                  • {rId}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>
                              Ningún cilindro retornado
                            </div>
                          )}
                        </div>

                        {/* Botones de Confirmación */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                          <button
                            className={`btn ${todosListos ? 'btn-success' : 'btn-warning'}`}
                            disabled={scannedIds.length === 0}
                            onClick={() => confirmarEntrega(activeEntrega.id)}
                            style={{ width: '100%', height: 50, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          >
                            <i className="ti ti-check" />
                            {todosListos ? 'Confirmar y Finalizar Entrega' : 'Confirmar Entrega Parcial'}
                          </button>

                          <button
                            className="btn btn-outline"
                            onClick={() => rechazarEntrega(activeEntrega.id)}
                            style={{ width: '100%', height: 44, fontSize: 13, borderColor: '#ef4444', color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'transparent' }}
                          >
                            <i className="ti ti-x" />
                            No concretar entrega
                          </button>

                          <button
                            className="btn btn-outline"
                            onClick={() => setEntregaStep(3)}
                            style={{ width: '100%', height: 44, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          >
                            <i className="ti ti-arrow-left" /> Volver a Impresión
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            )
        )}
      </div>

      {(entregaParaImprimir || activeEntrega) && createPortal(
        <div className="print-ticket-container">
          <div className="ticket-header">
            <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 'bold' }}>{(nombre_empresa || 'GasTubos').toUpperCase()}</h3>
            {direccion ? <p style={{ margin: 0, fontSize: '10px' }}>{direccion}</p> : <p style={{ margin: 0, fontSize: '10px' }}>Gestión de Gases Industriales</p>}
            {telefono && <p style={{ margin: '2px 0 0', fontSize: '10px' }}>Tel: {telefono}</p>}
            <p style={{ margin: '4px 0 0', fontSize: '11px', fontWeight: 'bold' }}>REMISIÓN: {(entregaParaImprimir || activeEntrega).numero}</p>
          </div>
          
          <div style={{ margin: '8px 0', fontSize: '11px' }}>
            <strong>Cliente:</strong> {(entregaParaImprimir || activeEntrega).cliente?.nombre}<br />
            <strong>RUC/CI:</strong> {(entregaParaImprimir || activeEntrega).cliente?.ruc || '—'}<br />
            <strong>Dirección:</strong> {(entregaParaImprimir || activeEntrega).direccionEntrega}<br />
            <strong>Fecha:</strong> {new Date((entregaParaImprimir || activeEntrega).fechaEntrega).toLocaleString('es-PY')}<br />
            <strong>Chofer:</strong> {(entregaParaImprimir || activeEntrega).repartidor?.nombre || 'Sin asignar'}<br />
            <strong>Tipo:</strong> {(entregaParaImprimir || activeEntrega).tipoOperacion.replace('_', ' ')}
          </div>
          
          <table className="ticket-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Tubo / Gas</th>
                <th style={{ textAlign: 'center' }}>Cant.</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(entregaParaImprimir || activeEntrega).detalles?.map(d => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.tuboId}</strong><br />
                    <span style={{ fontSize: '10px', color: '#555' }}>
                      {d.tubo?.gas}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {Number(d.cantidadGas)} {d.unidadGas}<br />
                    <span style={{ fontSize: '9px', color: '#888' }}>
                      x {Number(d.precioUnitario).toLocaleString('es-PY')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '500' }}>
                    {Number(d.subtotal).toLocaleString('es-PY')}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px dashed #000' }}>
                <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>DELIVERY:</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>
                  {Number((entregaParaImprimir || activeEntrega).costoDelivery || 0).toLocaleString('es-PY')} GS
                </td>
              </tr>
              <tr>
                <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>TOTAL:</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px', color: 'var(--blue)' }}>
                  {(
                    ((entregaParaImprimir || activeEntrega).detalles?.reduce((acc, d) => acc + Number(d.subtotal), 0) || 0) +
                    Number((entregaParaImprimir || activeEntrega).costoDelivery || 0)
                  ).toLocaleString('es-PY')} GS
                </td>
              </tr>
            </tbody>
          </table>


          
          {recambiosParaImprimir((entregaParaImprimir || activeEntrega)).length > 0 && (
            <div style={{ margin: '8px 0', fontSize: '10px', borderTop: '1px dashed #000', paddingTop: '4px' }}>
              <strong>Recambios Recibidos:</strong>
              <ul style={{ paddingLeft: 14, margin: 0 }}>
                {recambiosParaImprimir((entregaParaImprimir || activeEntrega)).map((desc, i) => (
                  <li key={i}>{desc}</li>
                ))}
              </ul>
            </div>
          )}

          {(entregaParaImprimir || activeEntrega).observaciones && (
            <div style={{ margin: '8px 0', fontSize: '10px', fontStyle: 'italic', borderTop: '1px dashed #000', paddingTop: '4px' }}>
              <strong>Obs:</strong> {(entregaParaImprimir || activeEntrega).observaciones}
            </div>
          )}
          
          <div className="ticket-signatures">
            <div className="signature-line">Firma Chofer</div>
            <div className="signature-line">Firma Cliente (Acuse)</div>
          </div>
          
          <div className="ticket-footer">
            ¡Gracias por su preferencia!
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Detalle / Previsualización de Ticket desde Historial */}
      <Modal
        open={modalDetalle}
        title={`Detalle de Entrega: ${entregaSeleccionada?.numero}`}
        onClose={() => setModalDetalle(false)}
        width={400}
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setModalDetalle(false)}>
              Cerrar
            </button>
            <button 
              className="btn btn-primary" 
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} 
              onClick={() => handlePrintClick(entregaSeleccionada)}
            >
              <i className="ti ti-printer" /> Imprimir Remisión
            </button>
          </div>
        }
      >
        {entregaSeleccionada && (
          <div className="ticket-preview">
            <div className="ticket-header">
              <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 'bold' }}>{(nombre_empresa || 'GasTubos').toUpperCase()}</h3>
              {direccion ? <p style={{ margin: 0, fontSize: '10px', color: '#666' }}>{direccion}</p> : <p style={{ margin: 0, fontSize: '10px', color: '#666' }}>Gestión de Gases Industriales</p>}
              {telefono && <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#666' }}>Tel: {telefono}</p>}
              <p style={{ margin: '6px 0 0', fontSize: '11px', fontWeight: 'bold' }}>REMISIÓN: {entregaSeleccionada.numero}</p>
            </div>
            
            <div style={{ margin: '10px 0', fontSize: '11px', borderBottom: '1px dashed #ddd', paddingBottom: '8px' }}>
              <strong>Cliente:</strong> {entregaSeleccionada.cliente?.nombre}<br />
              <strong>RUC/CI:</strong> {entregaSeleccionada.cliente?.ruc || '—'}<br />
              <strong>Dirección:</strong> {entregaSeleccionada.direccionEntrega}<br />
              <strong>Fecha:</strong> {new Date(entregaSeleccionada.fechaEntrega).toLocaleString('es-PY')}<br />
              <strong>Chofer:</strong> {entregaSeleccionada.repartidor?.nombre || 'Sin asignar'}<br />
              <strong>Tipo:</strong> {(entregaSeleccionada.tipoOperacion || '').replace('_', ' ')}
            </div>
            
            <table className="ticket-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ borderBottom: '1px dashed #000' }}>
                  <th style={{ textAlign: 'left', paddingBottom: '4px' }}>Tubo / Gas</th>
                  <th style={{ textAlign: 'center', paddingBottom: '4px' }}>Cant.</th>
                  <th style={{ textAlign: 'right', paddingBottom: '4px' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {entregaSeleccionada.detalles?.map(d => (
                  <tr key={d.id}>
                    <td style={{ paddingTop: '6px', paddingBottom: '4px' }}>
                      <strong>{d.tuboId}</strong><br />
                      <span style={{ fontSize: '10px', color: '#555' }}>
                        {d.tubo?.gas}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', paddingTop: '6px', paddingBottom: '4px' }}>
                      {Number(d.cantidadGas)} {d.unidadGas}<br />
                      <span style={{ fontSize: '9px', color: '#888' }}>
                        x {Number(d.precioUnitario).toLocaleString('es-PY')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '500', paddingTop: '6px', paddingBottom: '4px' }}>
                      {Number(d.subtotal).toLocaleString('es-PY')} GS
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1px dashed #000' }}>
                  <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>DELIVERY:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>
                    {Number(entregaSeleccionada.costoDelivery || 0).toLocaleString('es-PY')} GS
                  </td>
                </tr>
                <tr>
                  <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>TOTAL:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px', color: 'var(--blue)' }}>
                    {(
                      (entregaSeleccionada.detalles?.reduce((acc, d) => acc + Number(d.subtotal), 0) || 0) +
                      Number(entregaSeleccionada.costoDelivery || 0)
                    ).toLocaleString('es-PY')} GS
                  </td>
                </tr>
              </tbody>
            </table>


            
            {entregaSeleccionada.recambios && entregaSeleccionada.recambios.length > 0 && (
              <div style={{ margin: '8px 0', fontSize: '10px', borderTop: '1px dashed #ddd', paddingTop: '6px' }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>Recambios Recibidos:</strong>
                <ul style={{ paddingLeft: 14, margin: 0, color: '#555' }}>
                  {entregaSeleccionada.recambios.map(r => {
                    const tubo = r.tuboEntregado
                    const desc = tubo.observaciones && (tubo.observaciones.includes(' ') || tubo.observaciones.length > 15)
                      ? tubo.observaciones 
                      : `${tubo.id} (${tubo.gas})`
                    return <li key={r.id}>{desc}</li>
                  })}
                </ul>
              </div>
            )}

            {entregaSeleccionada.observaciones && (
              <div style={{ margin: '8px 0', fontSize: '10px', fontStyle: 'italic', borderTop: '1px dashed #ddd', paddingTop: '6px', color: '#555' }}>
                <strong>Obs:</strong> {entregaSeleccionada.observaciones}
              </div>
            )}
            
            <div className="ticket-signatures" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', paddingTop: '10px' }}>
              <div className="signature-line" style={{ width: '45%', borderTop: '1px solid #000', textAlign: 'center', fontSize: '10px', paddingTop: '4px' }}>Firma Chofer</div>
              <div className="signature-line" style={{ width: '45%', borderTop: '1px solid #000', textAlign: 'center', fontSize: '10px', paddingTop: '4px' }}>Firma Cliente</div>
            </div>
            
            <div className="ticket-footer" style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '8px', marginTop: '16px', fontSize: '10px' }}>
              ¡Gracias por su preferencia!
            </div>
          </div>
        )}
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
              onClick={() => imprimirBluetooth(entregaParaImprimir || activeEntrega, selectedDeviceAddress)}
              disabled={connectingPrinter || !selectedDeviceAddress}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {connectingPrinter ? <Spinner size="sm" /> : <i className="ti ti-printer" />}
              Imprimir
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Asegúrate de que tu impresora Bluetooth (ej. <strong>FTX TDR058BT</strong> o <strong>HM-A300E</strong>) esté encendida y vinculada (emparejada) en la configuración de tu celular.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-secondary)' }}>Ancho del papel / Formato:</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${paperWidth === 32 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => {
                  setPaperWidth(32)
                  localStorage.setItem('printer_paper_width', '32')
                }}
              >
                58 mm (ftx TDR058BT)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${paperWidth === 48 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => {
                  setPaperWidth(48)
                  localStorage.setItem('printer_paper_width', '48')
                }}
              >
                80 mm (HM-A300E)
              </button>
            </div>
          </div>

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
                const esTDR = device.name && (device.name.toUpperCase().includes('TDR058') || device.name.toUpperCase().includes('FTX') || device.name.toUpperCase().includes('BLUETOOTH') || device.name.toUpperCase().includes('PRINTER'))
                const esSeleccionado = selectedDeviceAddress === (device.address || device.id)
                return (
                  <div
                    key={device.address || device.id}
                    onClick={() => {
                      setSelectedDeviceAddress(device.address || device.id)
                      const name = (device.name || '').toUpperCase()
                      const detectedWidth = (name.includes('58') || name.includes('TDR') || name.includes('FTX') || name.includes('BLUETOOTH') || name.includes('PRINTER')) ? 32 : 48
                      setPaperWidth(detectedWidth)
                      localStorage.setItem('printer_paper_width', String(detectedWidth))
                    }}
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
                        <i className="ti ti-bluetooth" style={{ color: (esHMA300 || esTDR) ? 'var(--blue)' : 'var(--text-muted)' }} />
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
