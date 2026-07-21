// gastubos/backend/src/routes/clientes.js
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

const sucursalSchema = z.object({
  nombre:      z.string().min(1, 'El nombre de la sucursal es obligatorio'),
  direccion:   z.string().min(1, 'La dirección es obligatoria'),
  ciudad:      z.string().optional().nullable(),
  telefono:    z.string().optional().nullable(),
  contacto:    z.string().optional().nullable(),
  latitud:     z.coerce.number().optional().nullable(),
  longitud:    z.coerce.number().optional().nullable(),
  esPrincipal: z.boolean().optional().default(false),
})

const clienteSchema = z.object({
  nombre:     z.string().min(1),
  ruc:        z.string().min(1),
  telefono:   z.string().optional().nullable(),
  direccion:  z.string().optional().nullable(),
  latitud:    z.coerce.number().optional().nullable(),
  longitud:   z.coerce.number().optional().nullable(),
  contacto:   z.string().optional().nullable(),
  tipo:       z.enum(['EMPRESA','PYME','PARTICULAR']).default('EMPRESA'),
  sucursales: z.array(sucursalSchema).optional(),
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
      include: {
        _count: { select: { tubos: true } },
        sucursales: {
          where: { activo: true },
          orderBy: [{ esPrincipal: 'desc' }, { nombre: 'asc' }],
        },
      },
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
        tubos:      true,
        alquileres: { where: { estado: { in: ['ACTIVO','VENCIDO'] } }, include: { tubo: true } },
        sucursales: {
          where: { activo: true },
          orderBy: [{ esPrincipal: 'desc' }, { nombre: 'asc' }],
        },
      },
    })
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })
    res.json(cliente)
  } catch (err) { next(err) }
})

router.post('/', requireRol('ADMIN','OPERADOR'), async (req, res, next) => {
  try {
    const { sucursales, ...data } = clienteSchema.parse(req.body)

    let sucursalesCreate = undefined
    if (sucursales && sucursales.length > 0) {
      sucursalesCreate = { create: sucursales }
    } else if (data.direccion) {
      sucursalesCreate = {
        create: [{
          nombre: 'Casa Matriz',
          direccion: data.direccion,
          telefono: data.telefono || null,
          contacto: data.contacto || null,
          latitud: data.latitud || null,
          longitud: data.longitud || null,
          esPrincipal: true,
        }],
      }
    }

    const cliente = await prisma.cliente.create({
      data: {
        ...data,
        ...(sucursalesCreate ? { sucursales: sucursalesCreate } : {}),
      },
      include: {
        sucursales: { where: { activo: true } },
      },
    })
    res.status(201).json(cliente)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

router.patch('/:id', requireRol('ADMIN','OPERADOR'), async (req, res, next) => {
  try {
    const { sucursales: _sucursales, ...data } = clienteSchema.partial().parse(req.body)
    const cliente = await prisma.cliente.update({
      where: { id: req.params.id },
      data,
      include: {
        sucursales: { where: { activo: true } },
      },
    })
    res.json(cliente)
  } catch (err) { next(err) }
})

// ─── CRUD SUCURSALES ──────────────────────────────────────────────────────────

router.post('/:id/sucursales', requireRol('ADMIN','OPERADOR'), async (req, res, next) => {
  try {
    const data = sucursalSchema.parse(req.body)
    const clienteId = req.params.id

    // Si la nueva sucursal se marca como principal, desmarcar las otras del mismo cliente
    if (data.esPrincipal) {
      await prisma.sucursalCliente.updateMany({
        where: { clienteId },
        data: { esPrincipal: false },
      })
    }

    const sucursal = await prisma.sucursalCliente.create({
      data: {
        ...data,
        clienteId,
      },
    })

    res.status(201).json(sucursal)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

router.patch('/:id/sucursales/:sucursalId', requireRol('ADMIN','OPERADOR'), async (req, res, next) => {
  try {
    const data = sucursalSchema.partial().parse(req.body)
    const { id: clienteId, sucursalId } = req.params

    if (data.esPrincipal) {
      await prisma.sucursalCliente.updateMany({
        where: { clienteId },
        data: { esPrincipal: false },
      })
    }

    const sucursal = await prisma.sucursalCliente.update({
      where: { id: sucursalId },
      data,
    })

    res.json(sucursal)
  } catch (err) { next(err) }
})

router.delete('/:id/sucursales/:sucursalId', requireRol('ADMIN','OPERADOR'), async (req, res, next) => {
  try {
    const { sucursalId } = req.params
    const sucursal = await prisma.sucursalCliente.update({
      where: { id: sucursalId },
      data: { activo: false },
    })
    res.json({ message: 'Sucursal desactivada con éxito', sucursal })
  } catch (err) { next(err) }
})

export default router
