// gastubos/backend/src/routes/clientes.js
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

const clienteSchema = z.object({
  nombre:   z.string().min(1),
  ruc:      z.string().min(1),
  telefono: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
  latitud:  z.coerce.number().optional().nullable(),
  longitud: z.coerce.number().optional().nullable(),
  contacto: z.string().optional().nullable(),
  tipo:     z.enum(['EMPRESA','PYME','PARTICULAR']).default('EMPRESA'),
})

router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query
    const where = { activo: true }
    if (q) where.OR = [
      { nombre: { contains: q, mode: 'insensitive' } },
      { ruc:    { contains: q, mode: 'insensitive' } },
    ]
    const clientes = await prisma.cliente.findMany({
      where,
      include: { _count: { select: { tubos: true } } },
      orderBy: { nombre: 'asc' },
    })
    res.json(clientes)
  } catch (err) { next(err) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: req.params.id },
      include: {
        tubos:     true,
        alquileres: { where: { estado: { in: ['ACTIVO','VENCIDO'] } }, include: { tubo: true } },
      },
    })
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })
    res.json(cliente)
  } catch (err) { next(err) }
})

router.post('/', requireRol('ADMIN','OPERADOR'), async (req, res, next) => {
  try {
    const data = clienteSchema.parse(req.body)
    const cliente = await prisma.cliente.create({ data })
    res.status(201).json(cliente)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

router.patch('/:id', requireRol('ADMIN','OPERADOR'), async (req, res, next) => {
  try {
    const data = clienteSchema.partial().parse(req.body)
    const cliente = await prisma.cliente.update({ where: { id: req.params.id }, data })
    res.json(cliente)
  } catch (err) { next(err) }
})

export default router
