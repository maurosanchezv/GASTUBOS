// Identifica tubos cuyo estado DEVUELTO vigente proviene de un recambio
// confirmado por el repartidor. Una devolución manual tiene otra acción de
// auditoría y, por lo tanto, permanece visible en el catálogo de Tubos.
export async function obtenerRecepcionesActivasRepartidor(db) {
  const candidatos = await db.tubo.findMany({
    where: { activo: true, estado: 'DEVUELTO' },
    select: {
      id: true,
      serie: true,
      gas: true,
      capacidadLitros: true,
      capacidadKg: true,
      propietario: true,
      propietarioClienteId: true,
      ubicacion: true,
      estado: true,
      auditoria: {
        where: { estadoNuevo: 'DEVUELTO' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { accion: true, createdAt: true, metadata: true },
      },
      recambiosComoEntregado: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          cliente: { select: { id: true, nombre: true, ruc: true } },
          entrega: {
            select: {
              id: true,
              numero: true,
              fechaEntrega: true,
              repartidor: { select: { id: true, nombre: true } },
            },
          },
        },
      },
    },
  })

  return candidatos.filter(tubo => {
    const ultimoIngresoDevuelto = tubo.auditoria[0]
    return ultimoIngresoDevuelto?.accion === 'Recambio registrado en entrega'
      && tubo.recambiosComoEntregado.length > 0
  })
}

export async function obtenerIdsRecepcionesActivasRepartidor(db) {
  const recepciones = await obtenerRecepcionesActivasRepartidor(db)
  return recepciones.map(tubo => tubo.id)
}
