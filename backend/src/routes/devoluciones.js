// gastubos/backend/src/routes/devoluciones.js

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import { registrarAuditoria } from '../utils/auditoria.js'

const router = Router()
router.use(requireAuth)

const devolucionSchema = z.object({
  tuboId:        z.string(),
  estadoDestino: z.enum(['DEVUELTO', 'VACIO', 'EN_REVISION']).default('DEVUELTO'),
  observaciones: z.string().optional(),
})

// POST /api/devoluciones
router.post('/', requireRol('ADMIN', 'OPERADOR', 'REPARTIDOR'), async (req, res, next) => {
  try {
    const { tuboId, estadoDestino, observaciones } = devolucionSchema.parse(req.body)

    const tubo = await prisma.tubo.findUnique({
      where: { id: tuboId },
      include: { cliente: true },
    })
    if (!tubo) return res.status(404).json({ error: 'Tubo no encontrado' })

    const estadosPermitidos = ['ENTREGADO', 'ALQUILADO']
    if (!estadosPermitidos.includes(tubo.estado)) {
      return res.status(400).json({
        error: `El tubo está en estado ${tubo.estado}, no puede registrarse como devuelto`,
      })
    }

    await prisma.$transaction(async (tx) => {
      // Actualizar tubo
      await tx.tubo.update({
        where: { id: tuboId },
        data: {
          estado:    estadoDestino,
          clienteId: null,
          ubicacion: 'Depósito',
        },
      })

      // Si tenía alquiler activo, cerrarlo
      await tx.alquiler.updateMany({
        where: { tuboId, estado: { in: ['ACTIVO', 'VENCIDO'] } },
        data:  { estado: 'FINALIZADO', fechaDevolucion: new Date() },
      })

      // Auditoría
      await tx.auditoria.create({
        data: {
          tuboId,
          usuarioId:      req.user.id,
          accion:         'Devolución registrada',
          estadoAnterior: tubo.estado,
          estadoNuevo:    estadoDestino,
          observaciones,
        },
      })
    })

    res.json({ ok: true, tuboId, estadoNuevo: estadoDestino })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

export default router
