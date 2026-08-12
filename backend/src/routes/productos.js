// gastubos/backend/src/routes/productos.js
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

const productoSchema = z.object({
  codigo:          z.string().min(1, 'El código es obligatorio'),
  nombre:          z.string().min(1, 'El nombre es obligatorio'),
  descripcion:     z.string().optional().nullable(),
  categoria:       z.string().min(1, 'La categoría es obligatoria'),
  categoriaNombre: z.string().optional().nullable(),
  precio:          z.coerce.number().nonnegative(),
  unidad:          z.string().optional().default('unidades'),
  stock:           z.coerce.number().int().optional().nullable(),
  stockMinimo:     z.coerce.number().int().optional().nullable(),
  activo:          z.boolean().optional().default(true),
})

// ─── GET /api/productos ────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { categoria, search, activo } = req.query
    const where = {}
    if (activo === 'false')      where.activo = false
    else if (activo !== 'all')   where.activo = true
    if (categoria) where.categoria = categoria
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { codigo: { contains: search, mode: 'insensitive' } },
      ]
    }
    const productos = await prisma.producto.findMany({
      where,
      orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
    })
    res.json(productos)
  } catch (err) { next(err) }
})

// ─── GET /api/productos/categorias ─────────────────────────────────────────────
router.get('/categorias', async (req, res, next) => {
  try {
    const categorias = await prisma.producto.findMany({
      where: { activo: true },
      select: { categoria: true, categoriaNombre: true },
      distinct: ['categoria'],
      orderBy: { categoria: 'asc' },
    })
    res.json(categorias)
  } catch (err) { next(err) }
})

// ─── GET /api/productos/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const producto = await prisma.producto.findUnique({ where: { id: req.params.id } })
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(producto)
  } catch (err) { next(err) }
})

// ─── POST /api/productos ───────────────────────────────────────────────────────
router.post('/', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = productoSchema.parse(req.body)

    const existente = await prisma.producto.findUnique({ where: { codigo: data.codigo } })
    if (existente) {
      return res.status(400).json({ error: 'Ya existe un producto con ese código' })
    }

    const producto = await prisma.producto.create({ data })
    res.status(201).json(producto)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

// ─── PATCH /api/productos/:id ──────────────────────────────────────────────────
router.patch('/:id', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = productoSchema.partial().parse(req.body)

    if (data.codigo) {
      const existente = await prisma.producto.findFirst({
        where: { codigo: data.codigo, NOT: { id: req.params.id } }
      })
      if (existente) {
        return res.status(400).json({ error: 'Ya existe otro producto con ese código' })
      }
    }

    const producto = await prisma.producto.update({
      where: { id: req.params.id },
      data,
    })
    res.json(producto)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    if (err.code === 'P2025') return res.status(404).json({ error: 'Producto no encontrado' })
    next(err)
  }
})

export default router
