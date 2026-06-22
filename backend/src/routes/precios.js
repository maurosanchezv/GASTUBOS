// gastubos/backend/src/routes/precios.js
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

const updatePrecioSchema = z.object({
  gas: z.enum(['CO2', 'OXIGENO', 'ARGON', 'NITROGENO', 'AIRE_COMPRIMIDO', 'MEZCLA_CO2_ARGON', 'ACETILENO']),
  unidad: z.enum(['KG', 'M3']),
  precioUnitario: z.coerce.number().nonnegative(),
})

// GET /api/precios - Obtiene la lista completa de precios vigentes
router.get('/', async (req, res, next) => {
  try {
    const precios = await prisma.precioGas.findMany({
      orderBy: { gas: 'asc' },
    })
    res.json(precios)
  } catch (err) {
    next(err)
  }
})

// PUT /api/precios - Actualiza o crea el precio de un gas específico
router.put('/', requireRol('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const data = updatePrecioSchema.parse(req.body)
    const precio = await prisma.precioGas.upsert({
      where: { gas: data.gas },
      update: {
        unidad: data.unidad,
        precioUnitario: data.precioUnitario,
        actualizadoPor: req.user.username,
      },
      create: {
        gas: data.gas,
        unidad: data.unidad,
        precioUnitario: data.precioUnitario,
        actualizadoPor: req.user.username,
      },
    })
    res.json(precio)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

export default router
