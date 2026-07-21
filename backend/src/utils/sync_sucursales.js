import { prisma } from './prisma.js'

async function syncSucursales() {
  console.log('Sincronizando sucursales por defecto para clientes existentes...')
  const clientes = await prisma.cliente.findMany({
    include: { sucursales: true },
  })

  let creadas = 0
  for (const c of clientes) {
    if (c.sucursales.length === 0 && c.direccion) {
      await prisma.sucursalCliente.create({
        data: {
          clienteId: c.id,
          nombre: 'Casa Matriz',
          direccion: c.direccion,
          telefono: c.telefono || null,
          contacto: c.contacto || null,
          latitud: c.latitud || null,
          longitud: c.longitud || null,
          esPrincipal: true,
        },
      })
      creadas++
    }
  }

  console.log(`Finalizado. Sucursales "Casa Matriz" creadas: ${creadas}`)
}

syncSucursales()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
