// gastubos/backend/src/routes/cilindrosTerceros.js
import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import { obtenerRecepcionesActivasRepartidor } from '../utils/recepcionesRepartidor.js'

const router = Router()

router.use(requireAuth)

// ─── GET /api/cilindros-terceros ──────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { estado, gas, clienteId, q, page = 1, limit = 200 } = req.query
    const incluirDesconocidos = estado !== 'DEVUELTO_REGISTRADO'
    const incluirRegistrados = !['PENDIENTE', 'ADQUIRIDO', 'DE_BAJA'].includes(estado)
    const whereDesconocidos = {}

    if (!estado || estado === 'PENDIENTE') {
      whereDesconocidos.estado = 'PENDIENTE'
    } else if (estado === 'DE_BAJA') {
      whereDesconocidos.estado = 'DE_BAJA'
    }

    if (gas) whereDesconocidos.gas = { contains: gas, mode: 'insensitive' }
    if (clienteId) whereDesconocidos.clienteId = clienteId
    if (q) {
      whereDesconocidos.OR = [
        { gas: { contains: q, mode: 'insensitive' } },
        { observaciones: { contains: q, mode: 'insensitive' } },
        { cliente: { nombre: { contains: q, mode: 'insensitive' } } }
      ]
    }

    const [desconocidos, registrados] = await Promise.all([
      incluirDesconocidos
        ? prisma.cilindroTerceroInfo.findMany({
            where: whereDesconocidos,
            include: {
              cliente: { select: { id: true, nombre: true, ruc: true } },
              entrega: { select: { id: true, numero: true, fechaEntrega: true } },
              repartidor: { select: { id: true, nombre: true } },
              tuboAdquirido: { select: { id: true, serie: true, estado: true } }
            },
          })
        : [],
      incluirRegistrados ? obtenerRecepcionesActivasRepartidor(prisma) : [],
    ])

    const propietariosIds = [...new Set(
      registrados
        .filter(tubo => tubo.propietario === 'CLIENTE' && tubo.propietarioClienteId)
        .map(tubo => tubo.propietarioClienteId)
    )]
    const propietarios = propietariosIds.length > 0
      ? await prisma.cliente.findMany({
          where: { id: { in: propietariosIds } },
          select: { id: true, nombre: true, ruc: true },
        })
      : []
    const propietariosPorId = new Map(propietarios.map(cliente => [cliente.id, cliente]))

    const recepcionesRegistradas = registrados.map(tubo => {
      const recambio = tubo.recambiosComoEntregado[0]
      const auditoria = tubo.auditoria[0]
      return {
        id: `registrado:${tubo.id}`,
        esRegistrado: true,
        estado: 'DEVUELTO_REGISTRADO',
        gas: tubo.gas,
        capacidadLitros: tubo.capacidadLitros,
        capacidadKg: tubo.capacidadKg,
        clienteId: recambio.clienteId,
        cliente: recambio.cliente,
        entregaId: recambio.entregaId,
        entrega: recambio.entrega,
        repartidorId: recambio.entrega?.repartidor?.id || null,
        repartidor: recambio.entrega?.repartidor || null,
        tuboAdquiridoId: tubo.id,
        tuboAdquirido: { id: tubo.id, serie: tubo.serie, estado: tubo.estado },
        propietario: tubo.propietario,
        propietarioCliente: tubo.propietario === 'CLIENTE'
          ? propietariosPorId.get(tubo.propietarioClienteId) || null
          : null,
        ubicacion: tubo.ubicacion,
        observaciones: `Cilindro registrado recibido como recambio en la entrega ${recambio.entrega?.numero || ''}`,
        createdAt: auditoria?.createdAt || recambio.createdAt,
        updatedAt: auditoria?.createdAt || recambio.createdAt,
      }
    }).filter(item => {
      if (gas && !item.gas?.toLowerCase().includes(String(gas).toLowerCase())) return false
      if (clienteId && item.clienteId !== clienteId) return false
      if (!q) return true
      const term = String(q).toLowerCase()
      return [
        item.gas,
        item.tuboAdquirido?.id,
        item.tuboAdquirido?.serie,
        item.cliente?.nombre,
        item.propietarioCliente?.nombre,
      ].some(value => value?.toLowerCase().includes(term))
    })

    const itemsCombinados = [
      ...desconocidos.map(item => ({ ...item, esRegistrado: false })),
      ...recepcionesRegistradas,
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    const take = Math.max(1, Number(limit) || 200)
    const currentPage = Math.max(1, Number(page) || 1)
    const skip = (currentPage - 1) * take
    const items = itemsCombinados.slice(skip, skip + take)

    res.json({ items, total: itemsCombinados.length })
  } catch (error) {
    next(error)
  }
})

// ─── POST /api/cilindros-terceros/:id/adquirir ────────────────────────────────
router.post('/:id/adquirir', requireRol('ADMIN', 'SUPERVISOR', 'OPERADOR'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { serie, gas, capacidadLitros, capacidadKg, ubicacion, observaciones, propietario, propietarioClienteId } = req.body

    if (!serie || !serie.trim()) {
      return res.status(400).json({ error: 'El número de serie del cilindro es obligatorio' })
    }

    if (propietario === 'CLIENTE' && !propietarioClienteId) {
      return res.status(400).json({ error: 'Debe seleccionar el cliente propietario' })
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
      const finalGasLower = (finalGas || '').toLowerCase()
      const isKg = finalGasLower === 'acetileno' || finalGasLower === 'co2'

      // 1. Crear nuevo tubo usando la serie como ID con el propietario correspondiente
      const nuevoTubo = await tx.tubo.create({
        data: {
          id: tuboId,
          serie: trimmedSerie,
          gas: finalGas,
          capacidadLitros: !isKg ? (capacidadLitros !== undefined && capacidadLitros !== null && capacidadLitros !== '' ? Number(capacidadLitros) : registro.capacidadLitros) : null,
          capacidadKg: isKg ? (capacidadKg !== undefined && capacidadKg !== null && capacidadKg !== '' ? Number(capacidadKg) : registro.capacidadKg) : null,
          estado: 'DISPONIBLE',
          propietario: propietario || 'PROPIO',
          propietarioClienteId: propietario === 'CLIENTE' ? propietarioClienteId : null,
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
