// gastubos/backend/src/routes/config.js

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()

const brandingDefaults = {
  nombre_empresa: 'Propio',
  isotipo_empresa: '',
  logo_empresa: '',
}

const imagenSchema = z.string()
  .max(1_500_000, 'La imagen no puede superar 1.5 MB')
  .refine(
    val => val === '' || /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/i.test(val) || val.startsWith('data:image/'),
    'Formato de imagen no permitido'
  )

const configUpdateSchema = z.object({
  nombre_empresa:  z.string().min(1).default('Propio'),
  direccion:       z.string().optional().default(''),
  telefono:        z.string().optional().default(''),
  isotipo_empresa: imagenSchema.optional().default(''),
  logo_empresa:    imagenSchema.optional().default(''),
})

// GET /api/config/public — Endpoint público para inicio de sesión sin autenticación
router.get('/public', async (req, res, next) => {
  try {
    const configs = await prisma.config.findMany({
      where: {
        key: { in: Object.keys(brandingDefaults) }
      }
    })
    const branding = { ...brandingDefaults }
    configs.forEach(c => {
      branding[c.key] = c.value
    })
    res.json(branding)
  } catch (err) {
    next(err)
  }
})

// Middleware de autenticación para las rutas administrativas
router.use(requireAuth)

// GET /api/config (Autenticado)
router.get('/', async (req, res, next) => {
  try {
    const configs = await prisma.config.findMany()
    const configMap = {
      nombre_empresa: 'Propio',
      direccion: '',
      telefono: '',
      isotipo_empresa: '',
      logo_empresa: '',
    }
    configs.forEach(c => {
      configMap[c.key] = c.value
    })
    res.json(configMap)
  } catch (err) {
    next(err)
  }
})

// POST /api/config (Restringido a ADMIN)
router.post('/', requireRol('ADMIN'), async (req, res, next) => {
  try {
    const data = configUpdateSchema.parse(req.body)

    await prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(data)) {
        await tx.config.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      }
    })

    res.json({ ok: true, config: data })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

export default router
