// gastubos/backend/src/routes/maps.js

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// Solo dominios de Google Maps: evita que este endpoint se use como proxy
// abierto hacia cualquier URL (SSRF).
const ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'google.com',
  'www.google.com',
  'maps.google.com',
])

// GET /api/maps/resolve?url=... — sigue el redirect de un link corto de
// Google Maps (los que WhatsApp genera al compartir ubicación) y devuelve
// la URL final, de donde el frontend extrae lat/lon.
router.get('/resolve', requireAuth, async (req, res, next) => {
  try {
    const { url } = req.query
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Falta el parámetro url' })
    }

    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return res.status(400).json({ error: 'URL inválida' })
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return res.status(400).json({ error: 'URL inválida' })
    }
    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return res.status(400).json({ error: 'Dominio no permitido' })
    }

    const response = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    })
    await response.text().catch(() => {}) // descartar body, solo interesa la URL final

    res.json({ finalUrl: response.url })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'Tiempo de espera agotado al resolver el link' })
    }
    next(err)
  }
})

export default router
