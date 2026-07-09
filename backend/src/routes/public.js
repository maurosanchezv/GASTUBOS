// gastubos/backend/src/routes/public.js
// Ruta pública: /tubos/TUBO-000001 — sin autenticación
import { Router } from 'express'
import { prisma } from '../utils/prisma.js'

const router = Router()

router.get('/:id', async (req, res, next) => {
  try {
    const [tubo, configs] = await Promise.all([
      prisma.tubo.findUnique({
        where: { id: req.params.id, activo: true },
        select: {
          id: true, gas: true, talla: true, capacidadLitros: true,
          estado: true, ubicacion: true, propietario: true,
          cliente: { select: { nombre: true, telefono: true } },
          updatedAt: true,
        },
      }),
      prisma.config.findMany()
    ])
    if (!tubo) return res.status(404).json({ error: 'Tubo no encontrado' })

    const configMap = {
      nombre_empresa: 'Propio',
    }
    configs.forEach(c => {
      configMap[c.key] = c.value
    })

    res.json({
      ...tubo,
      nombre_empresa: configMap.nombre_empresa,
    })
  } catch (err) { next(err) }
})

export default router
