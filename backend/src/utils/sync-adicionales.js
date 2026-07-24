import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function syncAdicionales() {
  console.log('Iniciando sincronización retroactiva de tubos adicionales...')

  const auditLogs = await prisma.auditoria.findMany({
    where: {
      accion: { contains: 'Tubo agregado a entrega' }
    }
  })

  console.log(`Encontrados ${auditLogs.length} registros de auditoría de tubos agregados.`)

  let actualizados = 0

  for (const log of auditLogs) {
    const entregaId = log.metadata?.entregaId
    const tuboId = log.tuboId

    if (!entregaId || !tuboId) continue

    const entrega = await prisma.entrega.findUnique({
      where: { id: entregaId },
      include: { detalles: true }
    })

    if (!entrega) continue

    // 1. Marcar el detalle como esAdicional = true
    const detalleTarget = entrega.detalles.find(d => d.tuboId === tuboId)
    if (detalleTarget) {
      await prisma.detalleEntrega.update({
        where: { id: detalleTarget.id },
        data: { esAdicional: true }
      })
    }

    // 2. Agregar nota a observaciones de la entrega
    const nota = `[Agregado por repartidor en terreno: ${tuboId}]`
    const obsActuales = entrega.observaciones || ''
    const nuevasObs = obsActuales
      ? (obsActuales.includes(nota) ? obsActuales : `${obsActuales} | ${nota}`)
      : nota

    await prisma.entrega.update({
      where: { id: entregaId },
      data: { observaciones: nuevasObs }
    })

    actualizados++
    console.log(`✓ Actualizada Entrega ${entrega.numero}: Tubo ${tuboId} marcado como adicional`)
  }

  console.log(`Sincronización completada. ${actualizados} entregas actualizadas con éxito.`)
}

syncAdicionales()
  .catch(err => {
    console.error('Error en sincronización:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
