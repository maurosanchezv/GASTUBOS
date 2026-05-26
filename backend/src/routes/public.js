// gastubos/backend/src/routes/public.js
// Ruta pública: /tubos/TUBO-000001 — sin autenticación
import { Router } from 'express'
import { prisma } from '../utils/prisma.js'

const router = Router()

router.get('/:id', async (req, res, next) => {
  try {
    const tubo = await prisma.tubo.findUnique({
      where: { id: req.params.id, activo: true },
      select: {
        id: true, gas: true, talla: true, capacidadLitros: true,
        estado: true, ubicacion: true, propietario: true,
        cliente: { select: { nombre: true, telefono: true } },
        updatedAt: true,
      },
    })
    if (!tubo) return res.status(404).json({ error: 'Tubo no encontrado' })
    res.json(tubo)
  } catch (err) { next(err) }
})

export default router
