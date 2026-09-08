// gastubos/frontend/src/utils/googleMapsLink.js
// Extrae coordenadas de un link de Google Maps (los que WhatsApp comparte al
// tocar "Compartir ubicación" y luego "Copiar enlace").

const COORD_PATTERNS = [
  /[?&](?:q|query)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,  // ?q=lat,lon
  /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,                     // /@lat,lon,17z
  /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,                 // data=...!3dlat!4dlon
  /[?&]ll=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,               // ?ll=lat,lon
]

const SHORT_LINK_RE = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i
const MAPS_URL_RE = /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i

function coordsFromText(text) {
  for (const re of COORD_PATTERNS) {
    const m = text.match(re)
    if (m) {
      const lat = parseFloat(m[1])
      const lon = parseFloat(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon }
    }
  }
  // Texto plano "lat, lon" (por si pegan solo las coordenadas)
  const plain = text.trim().match(/^(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/)
  if (plain) {
    const lat = parseFloat(plain[1])
    const lon = parseFloat(plain[2])
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon }
  }
  return null
}

export function isGoogleMapsLink(text) {
  return MAPS_URL_RE.test((text || '').trim())
}

export function isShortGoogleMapsLink(text) {
  return SHORT_LINK_RE.test((text || '').trim())
}

// Intenta extraer { lat, lon } de un texto pegado (link o coordenadas).
// Para links cortos (maps.app.goo.gl) sin coordenadas visibles, devuelve null:
// hay que resolverlos primero contra el backend (ver resolveShortMapsLink).
export function parseGoogleMapsLink(text) {
  if (!text) return null
  const trimmed = text.trim()
  // La coma entre lat/lon suele venir codificada (%2C) al copiar desde la
  // barra de direcciones o compartir desde WhatsApp.
  let decoded = trimmed
  try { decoded = decodeURIComponent(trimmed) } catch { /* texto no codificado, se usa tal cual */ }
  return coordsFromText(decoded) || coordsFromText(trimmed)
}

// Resuelve un link corto de Google Maps siguiendo el redirect en el backend
// (el navegador no puede leer la URL final de un redirect cross-origin).
export async function resolveShortMapsLink(api, url) {
  const { data } = await api.get('/maps/resolve', { params: { url } })
  return parseGoogleMapsLink(data.finalUrl || '')
}
