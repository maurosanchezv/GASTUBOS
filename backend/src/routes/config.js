// gastubos/backend/src/routes/config.js

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

const configUpdateSchema = z.object({
  nombre_empresa: z.string().min(1).default('Propio'),
  direccion:      z.string().optional().default(''),
  telefono:       z.string().optional().default(''),
})

// GET /api/config
router.get('/', async (req, res, next) => {
  try {
    const configs = await prisma.config.findMany()
    const configMap = {
      nombre_empresa: 'Propio',
      direccion: '',
      telefono: '',
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
