// gastubos/backend/src/routes/auth.js

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const JWT_SECRET  = process.env.JWT_SECRET  || 'cambiar-en-produccion'
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body)

    const user = await prisma.usuario.findFirst({
      where: {
        OR: [{ username }, { email: username }],
        activo: true,
      },
    })

    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' })

    const token = jwt.sign(
      { id: user.id, username: user.username, nombre: user.nombre, rol: user.rol },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    )

    res.json({
      token,
      user: { id: user.id, username: user.username, nombre: user.nombre, rol: user.rol },
    })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Datos inválidos' })
    next(err)
  }
})

// GET /api/auth/me  — devuelve el usuario autenticado
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, nombre: true, email: true, rol: true },
    })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json(user)
  } catch (err) { next(err) }
})

export default router
