import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Generando datos de prueba...')

  // 1. Crear Cliente
  const cliente = await prisma.cliente.upsert({
    where: { ruc: '999999-9' },
    update: {},
    create: {
      nombre: 'Cliente Test S.A.',
      ruc: '999999-9',
      telefono: '0981-999-999',
      direccion: 'Avda. Aviadores del Chaco 123',
      tipo: 'EMPRESA',
    }
  })
  console.log('Cliente de prueba creado:', cliente.nombre)

  // 2. Crear Repartidor (chofer1 / chofer123)
  const passwordHash = await bcrypt.hash('chofer123', 10)
  const chofer = await prisma.usuario.upsert({
    where: { username: 'chofer1' },
    update: { passwordHash },
    create: {
      username: 'chofer1',
      passwordHash,
      nombre: 'Chofer de Prueba',
      email: 'chofer1@test.com',
      rol: 'REPARTIDOR',
    }
  })
  console.log('Usuario chofer creado:', chofer.username)

  // 3. Crear Camión
  const camion = await prisma.camion.upsert({
    where: { placa: 'TEST-999' },
    update: {},
    create: {
      placa: 'TEST-999',
      capacidadMax: 50,
    }
  })
  console.log('Camión de prueba creado:', camion.placa)

  // 4. Crear Tubos
  const tubos = [
    { id: 'TUBO-TEST-01', gas: 'Oxígeno' },
    { id: 'TUBO-TEST-02', gas: 'CO2' },
    { id: 'TUBO-TEST-03', gas: 'Argón' },
    { id: 'TUBO-TEST-04', gas: 'Nitrógeno' },
  ]

  for (const t of tubos) {
    const tubo = await prisma.tubo.upsert({
      where: { id: t.id },
      update: {
        estado: 'RESERVADO',
        camionId: camion.id,
        ubicacion: `Camión ${camion.placa}`,
      },
      create: {
        id: t.id,
        serie: t.id,
        gas: t.gas,
        capacidadLitros: 50,
        estado: 'RESERVADO',
        propietario: 'PROPIO',
        camionId: camion.id,
        ubicacion: `Camión ${camion.placa}`,
      }
    })
    console.log('Tubo creado/cargado en camión:', tubo.id)
  }

  console.log('¡Datos de prueba generados con éxito!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
