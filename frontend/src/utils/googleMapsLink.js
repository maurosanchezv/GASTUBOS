// gastubos/frontend/src/utils/googleMapsLink.js
// Extrae coordenadas de un link de Google Maps (los que WhatsApp comparte al
// tocar "Compartir ubicación" y luego "Copiar enlace").

// Orden importa: !3d!4d es la coordenada exacta del pin/lugar, mientras que
// @lat,lon es el centro del viewport (la cámara del mapa) y puede quedar
// corrido del pin real cuando el link trae ambos. Por eso !3d!4d se revisa
// primero.
const COORD_PATTERNS = [
  /[?&](?:q|query)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,  // ?q=lat,lon
  /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,                 // data=...!3dlat!4dlon (pin exacto)
  /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,                     // /@lat,lon,17z (centro del viewport)
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
// Para links cortos (maps.app.goo.gl) o de "lugar" sin coordenadas visibles,
// devuelve null: hay que resolverlos primero (ver resolveGoogleMapsLocation).
export function parseGoogleMapsLink(text) {
  if (!text) return null
  const trimmed = text.trim()
  // La coma entre lat/lon suele venir codificada (%2C) al copiar desde la
  // barra de direcciones o compartir desde WhatsApp.
  let decoded = trimmed
  try { decoded = decodeURIComponent(trimmed) } catch { /* texto no codificado, se usa tal cual */ }
  return coordsFromText(decoded) || coordsFromText(trimmed)
}

// Los links de un "lugar" (un negocio compartido por nombre, ej. desde la
// app de Maps) no traen coordenadas en la URL, solo un ID de lugar interno
// de Google (.../maps/place/<nombre>/data=!...!1s<cid>...). Como último
// recurso extraemos el nombre del lugar para geocodificarlo.
function placeQueryFromUrl(url) {
  if (!url) return null
  const place = url.match(/\/maps\/place\/([^/]+)/)
  const raw = place ? place[1] : (url.match(/[?&]q=([^&]+)/) || [])[1]
  if (!raw) return null
  let q = raw.replace(/\+/g, ' ')
  try { q = decodeURIComponent(q) } catch { /* texto no codificado, se usa tal cual */ }
  return q.trim() || null
}

async function searchNominatim(query) {
  // Restringido a Paraguay (mismo bias que usa el resto de la app al
  // buscar direcciones) para evitar que un nombre de negocio ambiguo
  // caiga en un resultado de otro país.
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=py&viewbox=-58.5,-27.5,-54.0,-19.3&q=${encodeURIComponent(query)}`)
  const data = await res.json()
  if (Array.isArray(data) && data[0]) {
    const lat = parseFloat(data[0].lat)
    const lon = parseFloat(data[0].lon)
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon }
  }
  return null
}

// Geocodifica un texto libre (nombre/dirección de un lugar) contra Nominatim.
// Se usa como último recurso cuando el link de Google Maps no trae
// coordenadas explícitas (links de "lugar"). Muchos negocios pequeños no
// están cargados en OpenStreetMap con ese nombre, así que si la búsqueda
// completa no encuentra nada reintentamos solo con la dirección (sin el
// nombre del negocio, que suele ser el primer segmento separado por coma).
export async function geocodePlaceQuery(query) {
  if (!query) return null
  try {
    const found = await searchNominatim(query)
    if (found) return found
    const withoutName = query.split(',').slice(1).join(',').trim()
    if (withoutName) return await searchNominatim(withoutName)
  } catch { /* sin conexión o sin resultados, se resuelve como no encontrado */ }
  return null
}

// Resuelve cualquier link de Google Maps (largo o corto) a { lat, lon, approximate }.
// 1) si la URL ya trae coordenadas, las usa directo (approximate: false).
// 2) si es un link corto (maps.app.goo.gl), lo resuelve contra el backend
//    para leer el destino real (el navegador no puede leer la URL final de
//    un redirect cross-origin). Google solo agrega @lat,lon/!3d!4d al link
//    del lado del cliente (vía JS), así que un redirect resuelto por el
//    backend casi siempre llega "pelado", sin coordenadas.
// 3) si el destino es un link de "lugar" sin coordenadas, geocodifica el
//    nombre del lugar como último recurso: es una búsqueda por texto, no la
//    coordenada real del pin, así que puede caer en la calle más cercana en
//    vez del comercio exacto — se marca approximate: true para que la UI
//    avise y el usuario verifique/ajuste el pin en el mapa.
export async function resolveGoogleMapsLocation(api, url) {
  const trimmed = (url || '').trim()
  const direct = parseGoogleMapsLink(trimmed)
  if (direct) return { ...direct, approximate: false }

  let finalUrl = trimmed
  if (isShortGoogleMapsLink(trimmed)) {
    const { data } = await api.get('/maps/resolve', { params: { url: trimmed } })
    finalUrl = data.finalUrl || ''
    const resolved = parseGoogleMapsLink(finalUrl)
    if (resolved) return { ...resolved, approximate: false }
  }
  const geocoded = await geocodePlaceQuery(placeQueryFromUrl(finalUrl))
  return geocoded ? { ...geocoded, approximate: true } : null
}
