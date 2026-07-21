import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

export default function MiniMapaPicker({ latitud, longitud, onChange, height = 180 }) {
  const containerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)

  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`)
      const data = await res.json()
      if (data.display_name && onChange) {
        onChange({ latitud: lat, longitud: lng, direccion: data.display_name })
      } else if (onChange) {
        onChange({ latitud: lat, longitud: lng })
      }
    } catch {
      if (onChange) onChange({ latitud: lat, longitud: lng })
    }
  }, [onChange])

  useEffect(() => {
    if (!containerRef.current || mapInstanceRef.current) return

    const lat = latitud ? Number(latitud) : -25.2867
    const lng = longitud ? Number(longitud) : -57.6474
    const zoom = (latitud && longitud) ? 15 : 12

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: zoom,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map)

    let marker = null
    if (latitud && longitud) {
      marker = L.marker([Number(latitud), Number(longitud)], { draggable: true }).addTo(map)
      marker.on('dragend', ev => {
        const { lat: dragLa, lng: dragLo } = ev.target.getLatLng()
        const latD = parseFloat(dragLa.toFixed(6))
        const lngD = parseFloat(dragLo.toFixed(6))
        reverseGeocode(latD, lngD)
      })
    }

    map.on('click', e => {
      const { lat: la, lng: lo } = e.latlng
      const latR = parseFloat(la.toFixed(6))
      const lngR = parseFloat(lo.toFixed(6))

      if (markerRef.current) {
        markerRef.current.setLatLng([latR, lngR])
      } else {
        const m = L.marker([latR, lngR], { draggable: true }).addTo(map)
        m.on('dragend', ev => {
          const { lat: dragLa, lng: dragLo } = ev.target.getLatLng()
          const latD = parseFloat(dragLa.toFixed(6))
          const lngD = parseFloat(dragLo.toFixed(6))
          reverseGeocode(latD, lngD)
        })
        markerRef.current = m
      }
      reverseGeocode(latR, lngR)
    })

    mapInstanceRef.current = map
    markerRef.current = marker

    // Forzar render de tiles al cargarse dentro de un modal
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize()
      }
    }, 250)

    return () => {
      clearTimeout(timer)
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        markerRef.current = null
      }
    }
  }, [latitud, longitud, reverseGeocode])

  useEffect(() => {
    if (mapInstanceRef.current && latitud && longitud) {
      const lat = Number(latitud)
      const lng = Number(longitud)
      mapInstanceRef.current.setView([lat, lng], 15)

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng])
      } else {
        const m = L.marker([lat, lng], { draggable: true }).addTo(mapInstanceRef.current)
        m.on('dragend', ev => {
          const { lat: dragLa, lng: dragLo } = ev.target.getLatLng()
          const latD = parseFloat(dragLa.toFixed(6))
          const lngD = parseFloat(dragLo.toFixed(6))
          reverseGeocode(latD, lngD)
        })
        markerRef.current = m
      }

      setTimeout(() => {
        if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize()
      }, 100)
    }
  }, [latitud, longitud, reverseGeocode])

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 8,
          border: '1px solid var(--border)',
          overflow: 'hidden',
          zIndex: 1,
        }}
      />
    </div>
  )
}
