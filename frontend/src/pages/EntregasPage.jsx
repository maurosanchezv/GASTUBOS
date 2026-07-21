// gastubos/frontend/src/pages/EntregasPage.jsx
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import api from '../services/api.js'
import { PageHeader, StateBadge, Spinner, GasDot, EmptyState, Modal, formatCapacidad } from '../components/ui.jsx'
import { useToast } from '../components/ui.jsx'
import { useConfigStore } from '../store/configStore.js'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { LOGO_TUBOS_SVG, LOGO_PMS_SVG } from '../utils/logosSvg.js'

// ... (EMPTY y fixes de Leaflet se mantienen arriba)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

const EMPTY = {
  clienteId: '', sucursalId: '', direccionEntrega: '', tipoOperacion: 'ENTREGA_SIMPLE',
  repartidorId: '', observaciones: '', tubosIds: [],
  tubosDetalles: [],
  fechaVencimiento: '', referencia: '',
  latitud: null, longitud: null,
  costoDelivery: '',
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

const formatNumberSpanish = (val) => {
  const num = Number(val)
  if (isNaN(num)) return '0'
  const rounded = Math.round(num * 1000) / 1000
  if (Number.isInteger(rounded)) {
    return rounded.toString()
  }
  return rounded.toFixed(3).replace('.', ',')
}

// URL pública de la remisión que codifica el QR del ticket. Al escanearla (con
// login) abre la página de detalle /remision/:numero. Misma lógica que en la app
// del repartidor, para que ambos QR abran la misma página.
function getRemisionUrl(numero) {
  const apiUrl = import.meta.env.VITE_API_URL || ''
  const base = apiUrl.startsWith('http') ? apiUrl.replace('/api', '') : window.location.origin
  return `${base}/remision/${numero}`
}

export default function EntregasPage() {
  const { nombre_empresa, direccion, telefono } = useConfigStore()
  const [params] = useSearchParams()
  const { toast } = useToast()

  const [tab, setTab]           = useState(params.get('tab') || 'nueva')
  const [form, setForm]         = useState(EMPTY)
  const [clientes, setClientes] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [precios, setPrecios]   = useState([])

  // Búsqueda de tubos mejorada
  const [tuboBusq, setTuboBusq]       = useState('')
  const [tuboSugs, setTuboSugs]       = useState([])
  const [tuboBuscando, setTuboBuscando] = useState(false)
  const busqRef = useRef(null)

  // Sugerencias de dirección (OpenStreetMap Nominatim)
  const [addrSugs, setAddrSugs] = useState([])
  const [addrBuscando, setAddrBuscando] = useState(false)
  const addrRef = useRef(null)
  const lastSelectedAddress = useRef('')

  // Función para buscar direcciones con Photon (Komoot) + Nominatim (Paraguay)
  const fetchDirecciones = async (query) => {
    if (!query || query.trim().length < 2) {
      setAddrSugs([])
      return
    }
    setAddrBuscando(true)
    try {
      // 1. Intentar Photon (Komoot) centrado prioritariamente en Paraguay (-25.2867, -57.6474)
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

      // 2. Si Photon trajo pocas opciones, buscar también en Nominatim delimitado a Paraguay
      if (sugs.length < 3) {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=py&viewbox=-58.5,-27.5,-54.0,-19.3`
        const resNom = await fetch(nomUrl, {
          headers: { 'Accept-Language': 'es' }
        })
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
    } catch (err) {
      console.error('Error fetching address suggestions', err)
      setAddrSugs([])
    } finally {
      setAddrBuscando(false)
    }
  }

  // Debounce para dirección de entrega (300ms)
  useEffect(() => {
    const q = form.direccionEntrega || ''
    if (q === lastSelectedAddress.current) {
      return
    }
    if (q.trim().length < 2) {
      setAddrSugs([])
      return
    }
    const t = setTimeout(() => {
      fetchDirecciones(q)
    }, 300)
    return () => clearTimeout(t)
  }, [form.direccionEntrega])

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

  // Detalle de entrega y control de ticket
  const [modalDetalle, setModalDetalle] = useState(false)
  const [entregaSeleccionada, setEntregaSeleccionada] = useState(null)

  const verDetalle = (entrega) => {
    setEntregaSeleccionada(entrega)
    setModalDetalle(true)
  }

  const handlePrintTicket = () => {
    window.print()
  }

  useEffect(() => {
    api.get('/clientes').then(r => setClientes(r.data)).catch(() => {})
    api.get('/usuarios').then(r => setUsuarios(r.data)).catch(() => {})
    api.get('/precios').then(r => setPrecios(r.data)).catch(() => {})
    if (params.get('tubo')) agregarTubo(params.get('tubo'))
    if (params.get('tab')) setTab(params.get('tab'))
  }, [])

  useEffect(() => {
    if (tab === 'historial') loadEntregas()
  }, [tab])

  // Función para buscar sugerencias
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

  // Búsqueda debounced de tubos
  useEffect(() => {
    if (!tuboBusq.trim()) {
      setTuboSugs([]) // No buscar automáticamente si está vacío (esperar al Focus)
      return
    }
    const t = setTimeout(() => {
      fetchSugerencias(tuboBusq)
    }, 350)
    return () => clearTimeout(t)
  }, [tuboBusq])

  // Exportar reportes
  const [exportMenuAbierto, setExportMenuAbierto] = useState(false)
  const exportRef = useRef(null)

  const generateCSV = (data, filename) => {
    const headers = ['Numero', 'Fecha', 'Cliente', 'Tipo', 'Direccion', 'Tubos', 'Repartidor']
    const rows = data.map(e => [
      e.numero,
      new Date(e.fechaEntrega).toLocaleDateString('es-PY'),
      e.cliente?.nombre,
      e.tipoOperacion,
      e.direccionEntrega,
      e.detalles?.length || 0,
      e.repartidor?.nombre || '—'
    ])
    const csvContent = "\uFEFF" + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}.csv`
    link.click()
  }

  const generatePDF = (data, title, filename) => {
    const doc = new jsPDF()
    doc.text(title, 14, 15)
    doc.setFontSize(10)
    doc.text(`Generado el: ${new Date().toLocaleString('es-PY')}`, 14, 22)
    
    const tableData = data.map(e => [
      e.numero,
      new Date(e.fechaEntrega).toLocaleDateString('es-PY'),
      e.cliente?.nombre,
      e.tipoOperacion,
      e.detalles?.length || 0,
      e.repartidor?.nombre || '—'
    ])

    autoTable(doc, {
      startY: 28,
      head: [['Nro', 'Fecha', 'Cliente', 'Tipo', 'Cant.', 'Repartidor']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [26, 95, 168] }
    })
    doc.save(`${filename}.pdf`)
  }

  const handleExport = async (tipo, formato, id = null) => {
    setExportMenuAbierto(false)
    let dataToExport = []
    let title = ""
    let filename = `reporte_${tipo}_${new Date().toISOString().slice(0, 10)}`

    try {
      if (tipo === 'individual' && id) {
        const e = entregas.find(x => x.id === id)
        if (!e) return toast('No se encontró la entrega', 'error')
        
        if (formato === 'pdf') {
          const doc = new jsPDF()
          doc.setFontSize(18)
          doc.setTextColor(26, 95, 168)
          doc.text(`COMPROBANTE DE ENTREGA: ${e.numero}`, 14, 20)
          
          doc.setFontSize(11)
          doc.setTextColor(0)
          doc.text(`Cliente: ${e.cliente?.nombre}`, 14, 30)
          doc.text(`Fecha: ${new Date(e.fechaEntrega).toLocaleString('es-PY')}`, 14, 37)
          doc.text(`Tipo Operación: ${e.tipoOperacion}`, 14, 44)
          doc.text(`Dirección: ${e.direccionEntrega}`, 14, 51)
          doc.text(`Repartidor: ${e.repartidor?.nombre || '—'}`, 14, 58)

          autoTable(doc, {
            startY: 65,
            head: [['Código Tubo', 'Gas']],
            body: e.detalles.map(d => [d.tuboId, `${d.tubo?.gas || ''}`]),
            headStyles: { fillColor: [26, 95, 168] }
          })
          doc.save(`Entrega_${e.numero}.pdf`)
        } else {
          generateCSV([e], `Entrega_${e.numero}`)
        }
        return toast('Reporte generado', 'success')
      }

      if (tipo === 'mes' || tipo === 'anio') {
        const ahora = new Date()
        const desde = new Date(ahora.getFullYear(), tipo === 'mes' ? ahora.getMonth() : 0, 1)
        const r = await api.get(`/entregas?desde=${desde.toISOString()}&limit=1000`)
        dataToExport = r.data.entregas
        title = tipo === 'mes' ? "REPORTE MENSUAL DE ENTREGAS" : "REPORTE ANUAL DE ENTREGAS"
      } else {
        dataToExport = entregas
        title = "HISTORIAL DE ENTREGAS"
      }

      if (dataToExport.length === 0) return toast('No hay datos para exportar', 'info')

      if (formato === 'pdf') {
        generatePDF(dataToExport, title, filename)
      } else {
        generateCSV(dataToExport, filename)
      }
      toast('Reporte generado correctamente', 'success')
    } catch (err) {
      toast('Error al generar reporte', 'error')
    }
  }

  // Cerrar menus al hacer clic afuera
  useEffect(() => {
    const handler = e => {
      if (busqRef.current && !busqRef.current.contains(e.target)) setTuboSugs([])
      if (addrRef.current && !addrRef.current.contains(e.target)) setAddrSugs([])
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportMenuAbierto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
      const data = await res.json()
      if (data.display_name) {
        lastSelectedAddress.current = data.display_name
        setForm(f => ({ ...f, direccionEntrega: data.display_name }))
      }
    } catch (err) {
      console.error('Error reverse geocoding', err)
    }
  }

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
      reverseGeocode(latR, lngR)
    })

    mapaPickerInstance.current = { map, marker }
    setTimeout(() => {
      if (mapaPickerInstance.current?.map) {
        mapaPickerInstance.current.map.invalidateSize()
      }
    }, 200)
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

    const conCoords = entregas.filter(e => e.latitud && e.longitud && e.confirmada && !e.cancelada)
    const center = conCoords.length > 0
      ? [conCoords[0].latitud, conCoords[0].longitud]
      : [-25.2867, -57.6474]

    const map = L.map(mapaHistRef.current).setView(center, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    }).addTo(map)

    // Agrupar entregas por coordenada exacta (6 decimales)
    const groups = {}
    conCoords.forEach(e => {
      const key = `${Number(e.latitud).toFixed(6)},${Number(e.longitud).toFixed(6)}`
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(e)
    })

    Object.keys(groups).forEach(key => {
      const groupDeliveries = groups[key]
      const first = groupDeliveries[0]
      const lat = Number(first.latitud)
      const lng = Number(first.longitud)

      let popupContent = `<div style="font-family:sans-serif;font-size:13px;min-width:200px;max-height:280px;overflow-y:auto;padding-right:4px;">`

      if (groupDeliveries.length === 1) {
        // Un solo pedido en esta ubicación
        const e = first
        const tubosList = e.detalles && e.detalles.length > 0
          ? `<div style="margin-top:6px; border-top:1px solid #E4E4E7; padding-top:6px;">
              <b style="font-size:11px; color:#52525B">Tubos entregados (${e.detalles.length}):</b>
              <ul style="margin:4px 0 0; padding-left:14px; font-size:11px; color:#3F3F46; line-height:1.4">
                ${e.detalles.map(d => `
                  <li>
                    <strong style="font-family:monospace; color:#18181B">${d.tuboId}</strong> 
                    (${d.tubo?.gas || 'N/A'})
                  </li>
                `).join('')}
              </ul>
             </div>`
          : '';

        popupContent += `
          <b style="color:#1A5FA8">${e.numero}</b><br/>
          <b>${e.cliente?.nombre}</b><br/>
          <span style="color:#52525B">${e.direccionEntrega}</span><br/>
          <small style="color:#A1A1AA">${new Date(e.fechaEntrega).toLocaleDateString('es-PY')}</small><br/>
          ${tubosList}
        `
      } else {
        // Múltiples pedidos en esta misma ubicación (encimados)
        popupContent += `
          <div style="margin-bottom:8px; border-bottom:1px solid #E4E4E7; padding-bottom:6px;">
            <b style="color:#1A5FA8; font-size:14px;">${first.cliente?.nombre || 'Cliente'}</b><br/>
            <span style="color:#52525B; font-size:11px;">${first.direccionEntrega}</span>
          </div>
          <div style="font-size:11px; font-weight:700; color:#71717A; margin-bottom:6px;">
            Historial de entregas en este punto (${groupDeliveries.length}):
          </div>
        `

        groupDeliveries.forEach((e, idx) => {
          const tubosList = e.detalles && e.detalles.length > 0
            ? `<ul style="margin:2px 0 0; padding-left:12px; font-size:11px; color:#52525B; list-style-type:circle;">
                ${e.detalles.map(d => `
                  <li>
                    <span style="font-family:monospace; font-weight:600">${d.tuboId}</span> 
                    (${d.tubo?.gas || 'N/A'})
                  </li>
                `).join('')}
              </ul>`
            : '<span style="font-style:italic;color:#A1A1AA">Sin tubos</span>';

          popupContent += `
            <div style="padding:6px 0; border-bottom:${idx === groupDeliveries.length - 1 ? 'none' : '1px dashed #E4E4E7'}">
              <div style="display:flex; justify-content:space-between; font-weight:600; font-size:11px;">
                <span style="color:#1A5FA8">${e.numero}</span>
                <span style="color:#71717A">${new Date(e.fechaEntrega).toLocaleDateString('es-PY')}</span>
              </div>
              ${tubosList}
            </div>
          `
        })
      }

      popupContent += `
        <div style="margin-top:10px; border-top:1px solid #E4E4E7; padding-top:6px; text-align:right;">
          <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank"
             style="color:#1A5FA8;font-size:11px;font-weight:600;text-decoration:none;">Abrir en Google Maps ↗</a>
        </div>
      </div>`

      L.marker([lat, lng]).addTo(map).bindPopup(popupContent)
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

  async function cancelarEntrega(id, numero) {
    if (!window.confirm(`¿Estás seguro de que deseas marcar la entrega ${numero} como NO CONCRETADA/CANCELADA? Esto devolverá los cilindros al depósito con su estado anterior.`)) return
    const motivo = window.prompt("Ingrese el motivo de cancelación (ej. Cliente no responde, Dirección incorrecta, etc.):")
    if (motivo === null) return
    try {
      await api.put(`/entregas/${id}/cancelar`, { motivo: motivo || 'Cancelada en oficina' })
      toast('Entrega cancelada e inventario devuelto correctamente', 'success')
      loadEntregas()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al cancelar la entrega', 'error')
    }
  }

  async function agregarTubo(id) {
    if (form.tubosIds.includes(id)) return toast('El tubo ya está en la lista')
    try {
      const r = await api.get(`/tubos/${id}`)
      if (!['DISPONIBLE', 'CARGADO', 'RESERVADO'].includes(r.data.estado)) {
        return toast(`Tubo en estado ${r.data.estado}, no disponible para entrega`, 'error')
      }
      
      let defaultCant = 0
      let defaultUnidad = 'KG'
      let defaultPrecio = 0

      if (r.data.estado === 'DISPONIBLE') {
        // Para un tubo DISPONIBLE (envase en depósito sin carga), la cantidad de gas es 0
        defaultCant = 0
        const gasNorm = r.data.gas?.toLowerCase() || ''
        defaultUnidad = (gasNorm.includes('oxigeno') || gasNorm.includes('argon') || gasNorm.includes('nitrogeno') || gasNorm.includes('aire') || gasNorm.includes('mezcla')) ? 'M3' : 'KG'
        defaultPrecio = 0
      } else if (r.data.cargas && r.data.cargas.length > 0) {
        const ultimaCarga = r.data.cargas[0]
        defaultCant = Number(ultimaCarga.cantidad)
        defaultUnidad = ultimaCarga.unidad
        defaultPrecio = Number(ultimaCarga.precioUnitario || 0)
      } else {
        defaultCant = r.data.capacidadKg ? Number(r.data.capacidadKg) : (Number(r.data.capacidadLitros) || 0)
        const gasNorm = r.data.gas?.toLowerCase() || ''
        defaultUnidad = (gasNorm.includes('oxigeno') || gasNorm.includes('argon') || gasNorm.includes('nitrogeno') || gasNorm.includes('aire') || gasNorm.includes('mezcla')) ? 'M3' : 'KG'
        
        // Buscar precio sugerido para el tipo de gas
        const gasEnum = GAS_STRING_TO_ENUM[r.data.gas] || ''
        try {
          const pr = precios.length > 0 ? precios : (await api.get('/precios')).data
          const priceInfo = pr.find(p => p.gas === gasEnum)
          defaultPrecio = priceInfo ? Number(priceInfo.precioUnitario) : 0
        } catch {}
      }

      setForm(f => ({ 
        ...f, 
        tubosIds: [...f.tubosIds, id],
        tubosDetalles: [...(f.tubosDetalles || []), { tuboId: id, cantidadGas: defaultCant, unidadGas: defaultUnidad, precioUnitario: defaultPrecio }]
      }))
      setTuboSugs([])
      setTuboBusq('')
    } catch { toast('Tubo no encontrado', 'error') }
  }

  function quitarTubo(id) {
    setForm(f => ({ 
      ...f, 
      tubosIds: f.tubosIds.filter(x => x !== id),
      tubosDetalles: (f.tubosDetalles || []).filter(x => x.tuboId !== id)
    }))
  }

  function updateTuboDetail(tuboId, key, value) {
    setForm(f => ({
      ...f,
      tubosDetalles: (f.tubosDetalles || []).map(d => 
        d.tuboId === tuboId ? { ...d, [key]: value } : d
      )
    }))
  }

  function handleGPS() {
    if (!navigator.geolocation) return toast('Geolocalización no disponible en este navegador', 'error')
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6))
        const lng = parseFloat(pos.coords.longitude.toFixed(6))
        setForm(f => ({ ...f, latitud: lat, longitud: lng }))
        reverseGeocode(lat, lng)
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
        costoDelivery:    Number(form.costoDelivery) || 0,
      })
      toast('Entrega registrada correctamente', 'success')
      setForm(EMPTY)
      setMapaPickerAbierto(false)
      loadEntregas()
    } catch (err) {
      toast(err.response?.data?.error || 'Error al registrar entrega', 'error')
    } finally { setSaving(false) }
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const clienteSeleccionado = clientes.find(c => c.id === form.clienteId)
  const entregasConCoords = entregas.filter(e => e.latitud && e.longitud && e.confirmada && !e.cancelada)

  const handleClienteChange = (e) => {
    const cid = e.target.value
    const c = clientes.find(x => x.id === cid)
    if (!c) {
      setForm(f => ({ ...f, clienteId: '', sucursalId: '', direccionEntrega: '', latitud: null, longitud: null }))
      return
    }

    const sucs = c.sucursales || []
    if (sucs.length > 0) {
      const principal = sucs.find(s => s.esPrincipal) || sucs[0]
      lastSelectedAddress.current = principal.direccion
      setForm(f => ({
        ...f,
        clienteId: cid,
        sucursalId: principal.id,
        direccionEntrega: principal.direccion,
        latitud: principal.latitud || null,
        longitud: principal.longitud || null,
      }))
    } else {
      lastSelectedAddress.current = c.direccion || ''
      setForm(f => ({
        ...f,
        clienteId: cid,
        sucursalId: '',
        direccionEntrega: c.direccion || '',
        latitud: c.latitud || null,
        longitud: c.longitud || null,
      }))
    }
  }

  const handleSucursalChange = (e) => {
    const sid = e.target.value
    if (!clienteSeleccionado) return
    const suc = (clienteSeleccionado.sucursales || []).find(s => s.id === sid)
    if (suc) {
      lastSelectedAddress.current = suc.direccion
      setForm(f => ({
        ...f,
        sucursalId: suc.id,
        direccionEntrega: suc.direccion,
        latitud: suc.latitud || null,
        longitud: suc.longitud || null,
      }))
    } else {
      setForm(f => ({ ...f, sucursalId: '' }))
    }
  }

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
            <div className="entregas-grid">
              <div>
                {/* Datos de la entrega */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-title" style={{ marginBottom: 14 }}>Datos de la entrega</div>
                  <div className="form-grid">

                    <div className="form-group">
                      <label className="form-label">Cliente <span className="form-required">*</span></label>
                      <select value={form.clienteId} onChange={handleClienteChange} required>
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

                    {/* Selector de Sucursal / Local si el cliente tiene múltiples */}
                    {clienteSeleccionado?.sucursales?.length > 0 && (
                      <div className="form-group col-span-2" style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <label className="form-label" style={{ margin: 0, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="ti ti-building-store" style={{ color: 'var(--blue)' }} />
                          Local / Sucursal de Destino <span className="form-required">*</span>
                        </label>
                        <select value={form.sucursalId || ''} onChange={handleSucursalChange} required>
                          <option value="">-- Seleccionar local de destino --</option>
                          {clienteSeleccionado.sucursales.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.nombre} {s.esPrincipal ? '(Matriz)' : ''} — {s.direccion} {s.ciudad ? `(${s.ciudad})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Dirección + Geolocalización */}
                    <div className="form-group col-span-2">
                      <div style={{ marginBottom: 4 }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          Dirección de entrega <span className="form-required">*</span>
                        </label>
                      </div>
                      <div ref={addrRef} style={{ position: 'relative' }}>
                        <input type="text" value={form.direccionEntrega} onChange={f('direccionEntrega')}
                          placeholder={clienteSeleccionado?.direccion || 'Ej: Av. San Martín, Asunción...'} required
                          style={{ paddingRight: addrBuscando ? '30px' : '10px' }}
                          onKeyDown={e => {
                            if (e.key === 'Escape') setAddrSugs([])
                          }}
                        />

                        {addrBuscando && (
                          <div style={{
                            position: 'absolute', right: 10, top: '50%',
                            transform: 'translateY(-50%)', zIndex: 10,
                            display: 'flex', alignItems: 'center'
                          }}>
                            <span className="spinner" style={{ width: 14, height: 14 }} />
                          </div>
                        )}

                        {/* Dropdown de sugerencias de dirección */}
                        {addrSugs.length > 0 && (
                          <div className="address-autocomplete-dropdown" style={{
                            position: 'absolute', top: '100%', left: 0, right: 0,
                            zIndex: 1000, background: 'var(--bg-card, #fff)',
                            border: '1px solid var(--border)', borderRadius: 8,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.15)', marginTop: 4,
                            maxHeight: 260, overflowY: 'auto'
                          }}>
                            {addrSugs.map((item, i) => (
                              <div key={i}
                                onClick={() => {
                                  lastSelectedAddress.current = item.display_name;
                                  setForm(f => ({
                                    ...f,
                                    direccionEntrega: item.display_name,
                                    latitud: item.lat,
                                    longitud: item.lon
                                  }));
                                  setAddrSugs([]);
                                }}
                                style={{
                                  padding: '10px 12px',
                                  cursor: 'pointer',
                                  borderBottom: i < addrSugs.length - 1 ? '1px solid var(--border-light, #eee)' : 'none',
                                  fontSize: 12,
                                  color: 'var(--text)',
                                  transition: 'background .12s',
                                  whiteSpace: 'normal',
                                  wordBreak: 'break-word',
                                  textAlign: 'left',
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 8
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2, #f5f5f5)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <i className="ti ti-map-pin" style={{ color: 'var(--blue)', marginTop: 2, flexShrink: 0, fontSize: 14 }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{item.display_name}</div>
                                  {item.lat && item.lon && (
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                      GPS vinculado ({item.lat.toFixed(4)}, {item.lon.toFixed(4)})
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

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
                    <div className="form-group">
                      <label className="form-label">Costo de Delivery (GS)</label>
                      <input type="number" min="0" value={form.costoDelivery} onChange={f('costoDelivery')} placeholder="0" />
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
                    <div className="search-bar" style={{ marginBottom: 0 }}>
                      <i className="ti ti-search" />
                      <input
                        placeholder="Buscar código, gas o serie…"
                        value={tuboBusq}
                        onChange={e => setTuboBusq(e.target.value)}
                        onFocus={() => {
                          if (!tuboBusq.trim()) fetchSugerencias('')
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Escape') { setTuboSugs([]); setTuboBusq('') }
                        }}
                      />
                      {tuboBuscando && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          ...
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
                                  {t.gas} · {formatCapacidad(t)}
                                  {t.cliente ? <span style={{ color: 'var(--text-muted)' }}> · {t.cliente.nombre}</span> : ''}
                                  {t.camion ? <span style={{ color: 'var(--orange)', fontWeight: 500 }}> · 🚚 {t.camion.placa}</span> : ''}
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
                    form.tubosIds.map(tuboId => {
                      const detail = form.tubosDetalles?.find(d => d.tuboId === tuboId)
                      return (
                        <TuboChip 
                          key={tuboId} 
                          tuboId={tuboId} 
                          detail={detail}
                          onChange={updateTuboDetail}
                          onRemove={quitarTubo} 
                        />
                      )
                    })
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
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--blue)' }}>{form.tubosIds.length}</div>
                  </div>

                  {/* Cálculo del Total Estimado de Entrega */}
                  {(() => {
                    const subtotalTubosCalculado = (form.tubosDetalles || []).reduce((acc, d) => {
                      const cant = Number(d.cantidadGas || 0)
                      const prec = Number(d.precioUnitario || 0)
                      return acc + (cant > 0 ? (cant * prec) : prec)
                    }, 0)
                    const costoDeliv = Number(form.costoDelivery || 0)
                    const totalGral = subtotalTubosCalculado + costoDeliv

                    return (
                      <>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>SUBTOTAL GAS</div>
                          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                            {subtotalTubosCalculado.toLocaleString('es-PY')} Gs
                          </div>
                        </div>
                        {costoDeliv > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>DELIVERY</div>
                            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                              {costoDeliv.toLocaleString('es-PY')} Gs
                            </div>
                          </div>
                        )}
                        <div style={{ marginBottom: 14, borderTop: '1px solid var(--border-mid)', paddingTop: 10 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>TOTAL REMISIÓN</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>
                            {totalGral.toLocaleString('es-PY')} Gs
                          </div>
                        </div>
                      </>
                    )
                  })()}

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
                    {saving ? 'Registrando...' : <><i className="ti ti-check" /> Crear entrega</>}
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
              {/* Botones de acción historial */}
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn" onClick={loadEntregas} disabled={loadingH}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 auto', justifyContent: 'center', maxWidth: '200px' }}>
                  <i className={`ti ti-refresh ${loadingH ? 'ti-spin' : ''}`} />
                  {loadingH ? 'Actualizando...' : 'Actualizar'}
                </button>

                {entregasConCoords.length > 0 && (
                  <button className="btn" onClick={() => setMapaHistAbierto(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 auto', justifyContent: 'center', maxWidth: '200px' }}>
                    <i className="ti ti-map" />
                    {mapaHistAbierto
                      ? 'Ocultar mapa'
                      : `Mapa (${entregasConCoords.length})`}
                  </button>
                )}
                
                <div ref={exportRef} style={{ position: 'relative', flex: '1 1 auto', maxWidth: '200px' }}>
                  <button className="btn btn-primary" onClick={() => setExportMenuAbierto(!exportMenuAbierto)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}>
                    <i className="ti ti-download" />
                    Exportar
                  </button>
                  {exportMenuAbierto && (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: 4,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      zIndex: 100, minWidth: 220, overflow: 'hidden'
                    }}>
                      <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', fontWeight: 600 }}>REPORTE MENSUAL</div>
                      <div className="export-item" onClick={() => handleExport('mes', 'pdf')}
                        style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} /> Descargar PDF
                      </div>
                      <div className="export-item" onClick={() => handleExport('mes', 'csv')}
                        style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} /> Descargar Planilla (Excel)
                      </div>

                      <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', fontWeight: 600, borderTop: '1px solid var(--border)' }}>REPORTE ANUAL</div>
                      <div className="export-item" onClick={() => handleExport('anio', 'pdf')}
                        style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} /> Descargar PDF
                      </div>
                      <div className="export-item" onClick={() => handleExport('anio', 'csv')}
                        style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} /> Descargar Planilla (Excel)
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Mapa de historial */}
              {mapaHistAbierto && (
                <div className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
                  <div ref={mapaHistRef} style={{ height: 380 }} />
                </div>
              )}

              {/* Vista Tabla (Desktop) */}
              <div className="card table-wrap hide-mobile" style={{ padding: 0 }}>
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
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entregas.map(e => (
                            <tr key={e.id}>
                              <td className="td-code">
                                {e.numero}
                                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {e.confirmada && <span style={{ background: '#DEF7EC', color: '#03543F', fontSize: 9, padding: '2px 6px', borderRadius: 4, width: 'fit-content', fontWeight: 600 }}>Entregado</span>}
                                  {e.cancelada && <span style={{ background: '#FDE8E8', color: '#9B1C1C', fontSize: 9, padding: '2px 6px', borderRadius: 4, width: 'fit-content', fontWeight: 600 }} title={e.motivoCancelacion}>No Concretado</span>}
                                  {!e.confirmada && !e.cancelada && <span style={{ background: '#FEF08A', color: '#713F12', fontSize: 9, padding: '2px 6px', borderRadius: 4, width: 'fit-content', fontWeight: 600 }}>Pendiente</span>}
                                </div>
                                {e.cancelada && e.motivoCancelacion && (
                                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.motivoCancelacion}>
                                    Motivo: {e.motivoCancelacion}
                                  </div>
                                )}
                              </td>
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
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'flex-start' }}>
                                  {e.latitud && e.longitud && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                      <a href={`https://www.google.com/maps?q=${e.latitud},${e.longitud}`}
                                        target="_blank" rel="noopener noreferrer" className="btn-icon"
                                        title="Ver en mapa">
                                        <i className="ti ti-map-pin" />
                                      </a>
                                      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>Mapa</span>
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <button className="btn-icon" title="Ver Ticket / Imprimir"
                                      onClick={() => verDetalle(e)}>
                                      <i className="ti ti-printer" style={{ color: 'var(--blue)' }} />
                                    </button>
                                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>Ticket</span>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <button className="btn-icon" title="Descargar PDF"
                                      onClick={() => handleExport('individual', 'pdf', e.id)}>
                                      <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} />
                                    </button>
                                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>PDF</span>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <button className="btn-icon" title="Descargar Planilla"
                                      onClick={() => handleExport('individual', 'csv', e.id)}>
                                      <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} />
                                    </button>
                                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>Excel</span>
                                  </div>
                                  {!e.confirmada && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                      <button className="btn-icon" title="Cancelar entrega"
                                        onClick={() => cancelarEntrega(e.id, e.numero)}>
                                        <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                                      </button>
                                      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>Cancelar</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>

              {/* Vista Mobile (Cards) — Se muestra solo en mobile vía CSS */}
              <div className="mobile-list">
                {entregas.length === 0 ? (
                  <EmptyState icon="ti-truck-delivery" message="Sin entregas registradas" />
                ) : (
                  entregas.map(e => (
                    <div key={e.id} className="list-card">
                      <div className="list-card-header">
                        <div className="list-card-title">
                          {e.numero}
                          <div style={{ fontSize: 10, fontWeight: 500, marginTop: 4, display: 'flex', gap: 6 }}>
                            {e.confirmada && <span style={{ background: '#DEF7EC', color: '#03543F', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Entregado</span>}
                            {e.cancelada && <span style={{ background: '#FDE8E8', color: '#9B1C1C', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>No Concretado</span>}
                            {!e.confirmada && !e.cancelada && <span style={{ background: '#FEF08A', color: '#713F12', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Pendiente</span>}
                          </div>
                        </div>
                        <span className={`badge badge-${e.tipoOperacion === 'ALQUILER' ? 'ALQUILADO' : e.tipoOperacion === 'VENTA' ? 'VENDIDO' : 'ENTREGADO'}`}>
                          {e.tipoOperacion.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="list-card-body">
                        {e.cancelada && e.motivoCancelacion && (
                          <div className="list-card-item col-span-2" style={{ background: '#FDF2F2', border: '1px solid #FDE8E8', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                            <span className="list-card-label" style={{ color: '#9B1C1C', fontWeight: 600 }}>Motivo de no entrega:</span>
                            <span className="list-card-value" style={{ fontStyle: 'italic', color: '#9B1C1C' }}>{e.motivoCancelacion}</span>
                          </div>
                        )}
                        <div className="list-card-item col-span-2">
                          <span className="list-card-label">Cliente</span>
                          <span className="list-card-value">{e.cliente?.nombre}</span>
                        </div>
                        <div className="list-card-item col-span-2">
                          <span className="list-card-label">Dirección</span>
                          <span className="list-card-value" style={{ whiteSpace: 'normal' }}>{e.direccionEntrega}</span>
                        </div>
                        <div className="list-card-item">
                          <span className="list-card-label">Fecha</span>
                          <span className="list-card-value">{new Date(e.fechaEntrega).toLocaleDateString('es-PY')}</span>
                        </div>
                        <div className="list-card-item">
                          <span className="list-card-label">Tubos</span>
                          <span className="list-card-value">{e.detalles?.length ?? 0}</span>
                        </div>
                      </div>

                      <div className="list-card-actions" style={{ justifyContent: 'flex-end', gap: 16, paddingTop: 12 }}>
                        {e.latitud && e.longitud && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <a href={`https://www.google.com/maps?q=${e.latitud},${e.longitud}`}
                              target="_blank" rel="noopener noreferrer" className="btn-icon" 
                              style={{ width: 44, height: 44, fontSize: 20 }}>
                              <i className="ti ti-map-pin" />
                            </a>
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Mapa</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <button className="btn-icon" onClick={() => verDetalle(e)}
                            style={{ width: 44, height: 44, fontSize: 20 }}>
                            <i className="ti ti-printer" style={{ color: 'var(--blue)' }} />
                          </button>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Ticket</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <button className="btn-icon" onClick={() => handleExport('individual', 'pdf', e.id)}
                            style={{ width: 44, height: 44, fontSize: 20 }}>
                            <i className="ti ti-file-type-pdf" style={{ color: '#e11d48' }} />
                          </button>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>PDF</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <button className="btn-icon" onClick={() => handleExport('individual', 'csv', e.id)}
                            style={{ width: 44, height: 44, fontSize: 20 }}>
                            <i className="ti ti-file-spreadsheet" style={{ color: '#16a34a' }} />
                          </button>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Excel</span>
                        </div>
                        {!e.confirmada && !e.cancelada && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <button className="btn-icon" onClick={() => cancelarEntrega(e.id, e.numero)}
                              style={{ width: 44, height: 44, fontSize: 20 }}>
                              <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                            </button>
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Cancelar</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* Modal de Detalle / Previsualización del Ticket */}
      <Modal
        open={modalDetalle}
        title={`Detalle de Entrega: ${entregaSeleccionada?.numero}`}
        onClose={() => setModalDetalle(false)}
        width={400}
        footer={
          <>
            <button className="btn" onClick={() => setModalDetalle(false)}>
              Cerrar
            </button>
            <button className="btn btn-primary" onClick={handlePrintTicket} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-printer" /> Imprimir Remisión
            </button>
          </>
        }
      >
        {entregaSeleccionada && (
          <div className="ticket-preview">
            <div className="ticket-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '10px' }}>
                <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center' }} dangerouslySetInnerHTML={{ __html: LOGO_TUBOS_SVG }} />
                <div style={{ width: '108px', height: '40px', display: 'flex', alignItems: 'center' }} dangerouslySetInnerHTML={{ __html: LOGO_PMS_SVG }} />
              </div>
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
              <strong>Tipo:</strong> {entregaSeleccionada.tipoOperacion.replace('_', ' ')}
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
                {entregaSeleccionada.detalles?.map(d => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.tuboId}</strong><br />
                      <span style={{ fontSize: '10px', color: '#666' }}>
                        {d.tubo?.gas}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {Number(d.cantidadGas) > 0 ? (
                        <>
                          {formatNumberSpanish(d.cantidadGas)} {d.unidadGas}<br />
                          <span style={{ fontSize: '9px', color: '#888' }}>
                            x {Number(d.precioUnitario).toLocaleString('es-PY')}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#666', fontWeight: 500 }}>
                          Envase Vacío
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '500' }}>
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
            
            <div className="ticket-signatures">
              <div className="signature-line">Firma Chofer</div>
              <div className="signature-line">Firma Cliente</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Elemento que solo se muestra para la impresión física (80mm) */}
      {entregaSeleccionada && createPortal(
        <div className="print-ticket-container">
          <div className="ticket-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '10px' }}>
              <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center' }} dangerouslySetInnerHTML={{ __html: LOGO_TUBOS_SVG }} />
              <div style={{ width: '108px', height: '40px', display: 'flex', alignItems: 'center' }} dangerouslySetInnerHTML={{ __html: LOGO_PMS_SVG }} />
            </div>
            {direccion ? <p style={{ margin: 0, fontSize: '10px' }}>{direccion}</p> : <p style={{ margin: 0, fontSize: '10px' }}>Gestión de Gases Industriales</p>}
            {telefono && <p style={{ margin: '2px 0 0', fontSize: '10px' }}>Tel: {telefono}</p>}
            <p style={{ margin: '4px 0 0', fontSize: '11px', fontWeight: 'bold' }}>REMISIÓN: {entregaSeleccionada.numero}</p>
          </div>
          
          <div style={{ margin: '8px 0', fontSize: '11px' }}>
            <strong>Cliente:</strong> {entregaSeleccionada.cliente?.nombre}<br />
            <strong>RUC/CI:</strong> {entregaSeleccionada.cliente?.ruc || '—'}<br />
            <strong>Dirección:</strong> {entregaSeleccionada.direccionEntrega}<br />
            <strong>Fecha:</strong> {new Date(entregaSeleccionada.fechaEntrega).toLocaleString('es-PY')}<br />
            <strong>Chofer:</strong> {entregaSeleccionada.repartidor?.nombre || 'Sin asignar'}<br />
            <strong>Tipo:</strong> {entregaSeleccionada.tipoOperacion.replace('_', ' ')}
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
              {entregaSeleccionada.detalles?.map(d => {
                const capStr = d.tubo ? ` (${formatCapacidad(d.tubo)})` : '';
                const showSerie = d.tubo?.serie && d.tubo?.serie !== d.tuboId;
                return (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.tuboId}</strong>
                      {showSerie && <span style={{ fontSize: '10px', color: '#555', display: 'block' }}>Nro: {d.tubo.serie}</span>}
                      <span style={{ fontSize: '10px', color: '#555', display: 'block' }}>
                        {d.tubo?.gas}{capStr}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {Number(d.cantidadGas) > 0 ? (
                        <>
                          {formatNumberSpanish(d.cantidadGas)} {d.unidadGas}<br />
                          <span style={{ fontSize: '9px', color: '#888' }}>
                            x {Number(d.precioUnitario).toLocaleString('es-PY')}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#555', fontWeight: 500 }}>
                          Envase Vacío
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '500' }}>
                      {Number(d.subtotal).toLocaleString('es-PY')} GS
                    </td>
                  </tr>
                );
              })}
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
            <div style={{ margin: '8px 0', fontSize: '10px', borderTop: '1px dashed #000', paddingTop: '4px' }}>
              <strong>Recambios Recibidos:</strong>
              <ul style={{ paddingLeft: 14, margin: 0 }}>
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
            <div style={{ margin: '8px 0', fontSize: '10px', fontStyle: 'italic', borderTop: '1px dashed #000', paddingTop: '4px' }}>
              <strong>Obs:</strong> {entregaSeleccionada.observaciones}
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
    </>
  )
}

function TuboChip({ tuboId, detail, onChange, onRemove }) {
  const [tubo, setTubo] = useState(null)
  useEffect(() => {
    api.get(`/tubos/${tuboId}`).then(r => setTubo(r.data)).catch(() => {})
  }, [tuboId])
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
      padding: '10px 14px', background: 'var(--surface-2)',
      borderRadius: 8, marginBottom: 8, fontSize: 12,
      border: '1px solid var(--border)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px' }}>
        {tubo && <GasDot gas={tubo.gas} />}
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--blue)' }}>{tuboId}</span>
        {tubo && (
          <>
            <span style={{ color: 'var(--text-secondary)' }}>{tubo.gas}</span>
            <StateBadge estado={tubo.estado} />
            {tubo.camion && (
              <span className="badge badge-orange" style={{ fontWeight: 500 }} title={`En camión ${tubo.camion.placa}`}>
                🚚 {tubo.camion.placa}
              </span>
            )}
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>CANTIDAD:</label>
          <input 
            type="number" 
            min="0" 
            step="0.001"
            value={detail?.cantidadGas ?? ''} 
            onChange={e => onChange(tuboId, 'cantidadGas', e.target.value)}
            style={{ width: 80, minHeight: 32, padding: '4px 8px', fontSize: 13 }}
          />
        </div>
        <select 
          value={detail?.unidadGas ?? 'KG'} 
          onChange={e => onChange(tuboId, 'unidadGas', e.target.value)}
          style={{ width: 68, minHeight: 32, padding: '4px 6px', fontSize: 13 }}
        >
          <option value="KG">KG</option>
          <option value="M3">M³</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>PRECIO (Gs):</label>
          <input 
            type="number" 
            min="0" 
            step="500"
            placeholder="0"
            value={detail?.precioUnitario ?? ''} 
            onChange={e => onChange(tuboId, 'precioUnitario', e.target.value)}
            style={{ width: 95, minHeight: 32, padding: '4px 8px', fontSize: 13, fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>SUBTOTAL:</span>
          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--blue)' }}>
            {(() => {
              const cant = Number(detail?.cantidadGas || 0)
              const prec = Number(detail?.precioUnitario || 0)
              const sub = cant > 0 ? (cant * prec) : prec
              return sub.toLocaleString('es-PY')
            })()} Gs
          </span>
        </div>
        <button type="button" className="btn-icon" onClick={() => onRemove(tuboId)} title="Quitar">
          <i className="ti ti-x" />
        </button>
      </div>
    </div>
  )
}
