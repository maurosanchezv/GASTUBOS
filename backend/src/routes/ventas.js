// gastubos/backend/src/routes/ventas.js
import { Router } from 'express'
import { prisma } from '../utils/prisma.js'
import { requireAuth, requireRol } from '../middleware/auth.js'
import { generarNumero } from '../utils/helpers.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res, next) => {
  try {
    const ventas = await prisma.venta.findMany({
      include: {
        cliente: { select: { nombre: true } },
        tubo:    { select: { id: true, gas: true, talla: true } },
      },
      orderBy: { fechaVenta: 'desc' },
    })
    res.json(ventas)
  } catch (err) { next(err) }
})

router.post('/', requireRol('ADMIN','OPERADOR'), async (req, res, next) => {
  try {
    const { tuboId, clienteId, referencia, observaciones } = req.body
    const tubo = await prisma.tubo.findUnique({ where: { id: tuboId } })
    if (!tubo) return res.status(404).json({ error: 'Tubo no encontrado' })
    if (tubo.estado === 'VENDIDO') return res.status(400).json({ error: 'El tubo ya está vendido' })

    const numero = await generarNumero('V')
    const [venta] = await prisma.$transaction([
      prisma.venta.create({ data: { numero, tuboId, clienteId, referencia, observaciones } }),
      prisma.tubo.update({ where: { id: tuboId }, data: { estado: 'VENDIDO', clienteId: null, ubicacion: 'Vendido' } }),
      prisma.auditoria.create({ data: { tuboId, usuarioId: req.user.id, accion: 'Venta registrada', estadoAnterior: tubo.estado, estadoNuevo: 'VENDIDO', observaciones, metadata: { numero } } }),
    ])
    res.status(201).json(venta)
  } catch (err) { next(err) }
})

export default router
