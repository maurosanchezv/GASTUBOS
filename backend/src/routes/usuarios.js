// gastubos/backend/src/routes/usuarios.js
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth, requireRol('ADMIN'))

const usuarioSchema = z.object({
  username: z.string().min(3),
  email:    z.string().email(),
  nombre:   z.string().min(1),
  rol:      z.enum(['ADMIN','SUPERVISOR','OPERADOR']),
  password: z.string().min(8),
})

router.get('/', async (req, res, next) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: { id: true, username: true, nombre: true, email: true, rol: true, avatar: true, activo: true, createdAt: true },
    })
    res.json(usuarios)
  } catch (err) { next(err) }
})

router.post('/', async (req, res, next) => {
  try {
    const data = usuarioSchema.parse(req.body)
    const passwordHash = await bcrypt.hash(data.password, 12)
    const { password, ...rest } = data
    const usuario = await prisma.usuario.create({ data: { ...rest, passwordHash } })
    res.status(201).json({ id: usuario.id, username: usuario.username, rol: usuario.rol })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const { password, ...rest } = req.body
    const data = { ...rest }
    if (password) data.passwordHash = await bcrypt.hash(password, 12)
    const usuario = await prisma.usuario.update({ where: { id: req.params.id }, data })
    res.json({ id: usuario.id, username: usuario.username, rol: usuario.rol, activo: usuario.activo })
  } catch (err) { next(err) }
})

export default router
