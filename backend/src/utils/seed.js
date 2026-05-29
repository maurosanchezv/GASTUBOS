// gastubos/backend/src/utils/seed.js
// Ejecutar con: npm run db:seed
// Crea un usuario admin, algunos clientes y tubos de ejemplo.

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding base de datos...')

  // ── Admin ──────────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin1234', 12)
  const admin = await prisma.usuario.upsert({
    where:  { username: 'admin' },
    update: {},
    create: {
      username:     'admin',
      email:        'admin@gastubos.com',
      passwordHash: adminHash,
      nombre:       'Administrador',
      rol:          'ADMIN',
    },
  })

  const opHash = await bcrypt.hash('operador123', 12)
  await prisma.usuario.upsert({
    where:  { username: 'operador1' },
    update: {},
    create: {
      username:     'operador1',
      email:        'operador1@gastubos.com',
      passwordHash: opHash,
      nombre:       'Carlos López',
      rol:          'OPERADOR',
    },
  })

  // ── Clientes ───────────────────────────────────────────────────────────────
  const cliente1 = await prisma.cliente.upsert({
    where:  { ruc: '80012345-1' },
    update: {},
    create: {
      nombre:   'Metalúrgica Ñu S.A.',
      ruc:      '80012345-1',
      telefono: '021-555-1234',
      direccion:'Av. Mcal. López 1234, Asunción',
      contacto: 'Carlos Ortiz',
      tipo:     'EMPRESA',
    },
  })

  const cliente2 = await prisma.cliente.upsert({
    where:  { ruc: '80098765-4' },
    update: {},
    create: {
      nombre:   'AutoCar Centro',
      ruc:      '80098765-4',
      telefono: '021-666-9876',
      direccion:'Ruta 1 km 15, Luque',
      contacto: 'María Giménez',
      tipo:     'EMPRESA',
    },
  })

  // ── Tubos ──────────────────────────────────────────────────────────────────
  const tubosData = [
    { id: 'TUBO-000001', serie: 'SN-2021-001', gas: 'CO2',      capacidadLitros: 50, talla: 'T50', pesoKg: 75, estado: 'DISPONIBLE', ubicacion: 'Depósito A' },
    { id: 'TUBO-000002', serie: 'SN-2021-002', gas: 'Oxígeno',  capacidadLitros: 50, talla: 'T50', pesoKg: 72, estado: 'ENTREGADO',  ubicacion: 'Cliente', clienteId: cliente1.id },
    { id: 'TUBO-000003', serie: 'SN-2022-011', gas: 'Argón',    capacidadLitros: 10, talla: 'T10', pesoKg: 28, estado: 'ALQUILADO',  ubicacion: 'Cliente', clienteId: cliente2.id },
    { id: 'TUBO-000004', serie: 'SN-2022-012', gas: 'Nitrógeno',capacidadLitros: 50, talla: 'T50', pesoKg: 70, estado: 'CARGADO',    ubicacion: 'Depósito B' },
    { id: 'TUBO-000005', serie: 'SN-2023-031', gas: 'Acetileno',capacidadLitros: 8,  talla: 'T8',  pesoKg: 30, estado: 'VACIO',      ubicacion: 'Depósito A' },
  ]

  for (const t of tubosData) {
    await prisma.tubo.upsert({
      where:  { id: t.id },
      update: {},
      create: { ...t, propietario: 'PROPIO', fechaCompra: new Date('2021-03-15') },
    })
  }

  console.log('✅ Seed completo.')
  console.log('   👤 Admin:    admin / admin1234')
  console.log('   👤 Operador: operador1 / operador123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
