// gastubos/backend/src/routes/cilindrosTerceros.js
import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)

// ─── GET /api/cilindros-terceros ──────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { estado, gas, clienteId, q, page = 1, limit = 200 } = req.query
    const where = {}

    if (estado) where.estado = estado
    if (gas) where.gas = { contains: gas, mode: 'insensitive' }
    if (clienteId) where.clienteId = clienteId

    if (q) {
      where.OR = [
        { gas: { contains: q, mode: 'insensitive' } },
        { observaciones: { contains: q, mode: 'insensitive' } },
        { cliente: { nombre: { contains: q, mode: 'insensitive' } } }
      ]
    }

    const take = Number(limit)
    const skip = (Number(page) - 1) * take

    const [items, total] = await Promise.all([
      prisma.cilindroTerceroInfo.findMany({
        where,
        include: {
          cliente: { select: { id: true, nombre: true, ruc: true } },
          entrega: { select: { id: true, numero: true, fechaEntrega: true } },
          repartidor: { select: { id: true, nombre: true } },
          tuboAdquirido: { select: { id: true, serie: true, estado: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.cilindroTerceroInfo.count({ where })
    ])

    res.json({ items, total })
  } catch (error) {
    next(error)
  }
})

// ─── POST /api/cilindros-terceros/:id/adquirir ────────────────────────────────
router.post('/:id/adquirir', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { serie, gas, capacidadLitros, capacidadKg, ubicacion, observaciones } = req.body

    if (!serie || !serie.trim()) {
      return res.status(400).json({ error: 'El número de serie del cilindro es obligatorio' })
    }

    const registro = await prisma.cilindroTerceroInfo.findUnique({
      where: { id },
      include: { cliente: true }
    })

    if (!registro) {
      return res.status(404).json({ error: 'Registro de cilindro de tercero no encontrado' })
    }

    if (registro.estado === 'ADQUIRIDO') {
      return res.status(400).json({ error: 'Este cilindro de tercero ya fue adquirido previamente' })
    }

    const trimmedSerie = serie.trim()

    // Verificar si ya existe un tubo con este id o serie (igual a la creación de tubos estándar)
    const existe = await prisma.tubo.findFirst({
      where: {
        OR: [
          { id: trimmedSerie },
          { serie: trimmedSerie }
        ]
      }
    })

    if (existe) {
      return res.status(400).json({ error: `Ya existe un cilindro registrado con el número/serie ${trimmedSerie}` })
    }

    const result = await prisma.$transaction(async (tx) => {
      const tuboId = trimmedSerie
      const finalGas = gas || registro.gas
      const isAcetileno = finalGas.toLowerCase() === 'acetileno'

      // 1. Crear nuevo tubo como propio usando la serie como ID
      const nuevoTubo = await tx.tubo.create({
        data: {
          id: tuboId,
          serie: trimmedSerie,
          gas: finalGas,
          capacidadLitros: isAcetileno ? null : (capacidadLitros !== undefined && capacidadLitros !== null && capacidadLitros !== '' ? Number(capacidadLitros) : registro.capacidadLitros),
          capacidadKg: isAcetileno ? (capacidadKg !== undefined && capacidadKg !== null && capacidadKg !== '' ? Number(capacidadKg) : registro.capacidadKg) : null,
          estado: 'DISPONIBLE',
          propietario: 'PROPIO',
          ubicacion: ubicacion || 'Depósito',
          observaciones: observaciones || `Adquirido desde recepción de tercero (${registro.cliente?.nombre || 'Cliente'}). ID registro: ${id}`
        }
      })

      // 2. Marcar registro de tercero como ADQUIRIDO
      const registroActualizado = await tx.cilindroTerceroInfo.update({
        where: { id },
        data: {
          estado: 'ADQUIRIDO',
          tuboAdquiridoId: nuevoTubo.id
        }
      })

      // 3. Registrar auditoría
      await tx.auditoria.create({
        data: {
          tuboId: nuevoTubo.id,
          usuarioId: req.user.id,
          accion: 'Cilindro adquirido desde tercero',
          estadoNuevo: 'DISPONIBLE',
          observaciones: `Adquirido a partir de recepción de tercero (Cliente: ${registro.cliente?.nombre || 'Desconocido'})`,
          metadata: { registroTerceroId: id }
        }
      })

      return { tubo: nuevoTubo, registro: registroActualizado }
    })

    res.json(result)
  } catch (error) {
    next(error)
  }
})

// ─── POST /api/cilindros-terceros/:id/baja ───────────────────────────────────
router.post('/:id/baja', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { observaciones } = req.body

    const registro = await prisma.cilindroTerceroInfo.findUnique({ where: { id } })
    if (!registro) {
      return res.status(404).json({ error: 'Registro no encontrado' })
    }

    const actualizado = await prisma.cilindroTerceroInfo.update({
      where: { id },
      data: {
        estado: 'DE_BAJA',
        observaciones: observaciones ? `${registro.observaciones || ''} | Baja: ${observaciones}` : registro.observaciones
      }
    })

    res.json(actualizado)
  } catch (error) {
    next(error)
  }
})

export default router
