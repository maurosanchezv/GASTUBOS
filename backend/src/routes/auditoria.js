// gastubos/backend/src/routes/auditoria.js
import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res, next) => {
  try {
    const { tuboId, usuarioId, page = 1, limit = 50 } = req.query
    const where = {}
    if (tuboId)    where.tuboId    = tuboId
    if (usuarioId) where.usuarioId = usuarioId

    const [registros, total] = await Promise.all([
      prisma.auditoria.findMany({
        where,
        include: {
          tubo:    { select: { id: true, gas: true } },
          usuario: { select: { username: true, nombre: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.auditoria.count({ where }),
    ])
    res.json({ registros, total })
  } catch (err) { next(err) }
})

export default router
