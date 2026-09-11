// gastubos/backend/src/routes/devoluciones.js

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import { registrarAuditoria } from '../utils/auditoria.js'
import { cerrarTuboActivo } from '../utils/alquilerTubos.js'

const router = Router()
router.use(requireAuth)

const devolucionSchema = z.object({
  tuboId:        z.string(),
  estadoDestino: z.enum(['DEVUELTO', 'VACIO', 'EN_REVISION']).default('DEVUELTO'),
  observaciones: z.string().optional(),
})

// POST /api/devoluciones
router.post('/', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR', 'REPARTIDOR'), async (req, res, next) => {
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

      // Si tenía alquiler activo, cerrarlo: el contrato pasa a FINALIZADO y
      // además hay que cerrar su AlquilerTubo abierto, si no ese tubo queda
      // trabado para futuros alquileres (índice único parcial por tubo activo).
      const fechaDevolucion = new Date()
      const alquileresActivos = await tx.alquiler.findMany({
        where: { tuboId, estado: { in: ['ACTIVO', 'VENCIDO'] } },
        select: { id: true },
      })
      for (const { id: alquilerId } of alquileresActivos) {
        await tx.alquiler.update({
          where: { id: alquilerId },
          data:  { estado: 'FINALIZADO', fechaDevolucion },
        })
        await cerrarTuboActivo(tx, { alquilerId, fecha: fechaDevolucion })
      }

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
