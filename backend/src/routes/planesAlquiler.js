// gastubos/backend/src/routes/planesAlquiler.js
// Maestro configurable de planes de alquiler (CHICO/MEDIANO/GRANDE + los que
// se agreguen). Los contratos ya firmados no se ven afectados si acá se
// cambia un precio — ver Alquiler.precioInicialAplicado y afines.
//
// Cada plan además lleva una lista de ítems/equipos incluidos (PlanAlquilerItem):
// es solo la plantilla que se precarga al crear una remisión de alquiler. Lo que
// realmente se entrega vive en ItemAlquiler (snapshot por contrato), así que
// editar la plantilla acá tampoco afecta contratos ya creados.

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

const itemSchema = z.object({
  descripcion: z.string().min(1),
  cantidad:    z.coerce.number().int().positive().default(1),
  serializado: z.coerce.boolean().optional().default(false),
  orden:       z.coerce.number().int().nonnegative().optional(),
  activo:      z.coerce.boolean().optional().default(true),
})

const planSchema = z.object({
  codigo:                 z.string().min(1).toUpperCase(),
  nombre:                 z.string().min(1),
  precioInicial:          z.coerce.number().nonnegative(),
  diasIncluidos:          z.coerce.number().int().positive().default(30),
  precioMensual:          z.coerce.number().nonnegative(),
  precioRecargaDomicilio: z.coerce.number().nonnegative(),
  descripcion:            z.string().optional().nullable(),
  activo:                 z.coerce.boolean().optional(),
  // Lista completa de ítems del plan. En PUT reemplaza la lista entera (no hay
  // diff parcial) — es un maestro chico y se edita completo desde la UI.
  items:                  z.array(itemSchema).optional(),
})

// Normaliza la lista de ítems recibida: fija `orden` según la posición si no
// vino, y descarta filas sin descripción.
function prepararItems(items) {
  return (items || [])
    .filter(i => i && String(i.descripcion || '').trim())
    .map((i, idx) => ({
      descripcion: i.descripcion.trim(),
      cantidad:    Number(i.cantidad) > 0 ? Math.trunc(Number(i.cantidad)) : 1,
      serializado: !!i.serializado,
      orden:       i.orden !== undefined ? Number(i.orden) : idx,
      activo:      i.activo === undefined ? true : !!i.activo,
    }))
}

// GET /api/planes-alquiler?activo=true
router.get('/', async (req, res, next) => {
  try {
    const { activo } = req.query
    const where = {}
    if (activo !== undefined) where.activo = activo === 'true'

    const planes = await prisma.planAlquiler.findMany({
      where,
      orderBy: { precioInicial: 'asc' },
      include: { items: { orderBy: { orden: 'asc' } } },
    })
    res.json(planes)
  } catch (err) { next(err) }
})

// POST /api/planes-alquiler
router.post('/', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = planSchema.parse(req.body)
    const { items, ...planData } = data

    const plan = await prisma.planAlquiler.create({
      data: {
        ...planData,
        items: { create: prepararItems(items) },
      },
      include: { items: { orderBy: { orden: 'asc' } } },
    })

    await prisma.auditoria.create({
      data: {
        usuarioId: req.user.id,
        accion: 'Plan de alquiler creado',
        metadata: { planId: plan.id, codigo: plan.codigo },
      },
    })

    res.status(201).json(plan)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    if (err.code === 'P2002') return res.status(400).json({ error: 'Ya existe un plan con ese código' })
    next(err)
  }
})

// PUT /api/planes-alquiler/:id
router.put('/:id', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const data = planSchema.partial().parse(req.body)
    const { items, ...planData } = data

    const anterior = await prisma.planAlquiler.findUnique({ where: { id: req.params.id } })
    if (!anterior) return res.status(404).json({ error: 'Plan no encontrado' })

    const plan = await prisma.$transaction(async (tx) => {
      await tx.planAlquiler.update({ where: { id: req.params.id }, data: planData })

      // items === undefined  → no se tocó la lista.
      // items === []         → se vació explícitamente.
      if (items !== undefined) {
        await tx.planAlquilerItem.deleteMany({ where: { planId: req.params.id } })
        const preparados = prepararItems(items)
        if (preparados.length > 0) {
          await tx.planAlquilerItem.createMany({
            data: preparados.map(i => ({ ...i, planId: req.params.id })),
          })
        }
      }

      return tx.planAlquiler.findUnique({
        where: { id: req.params.id },
        include: { items: { orderBy: { orden: 'asc' } } },
      })
    })

    const cambios = ['precioInicial', 'precioMensual', 'precioRecargaDomicilio', 'diasIncluidos']
      .filter(k => data[k] !== undefined && Number(data[k]) !== Number(anterior[k]))
      .map(k => `${k}: ${anterior[k]} → ${data[k]}`)
    if (items !== undefined) cambios.push('lista de ítems actualizada')

    await prisma.auditoria.create({
      data: {
        usuarioId: req.user.id,
        accion: 'Precio de plan de alquiler modificado manualmente',
        observaciones: cambios.length > 0 ? cambios.join(', ') : null,
        metadata: { planId: plan.id, codigo: plan.codigo },
      },
    })

    res.json(plan)
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors })
    next(err)
  }
})

export default router
