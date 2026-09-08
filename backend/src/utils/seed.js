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

  const repHash = await bcrypt.hash('repartidor123', 12)
  await prisma.usuario.upsert({
    where:  { username: 'repartidor1' },
    update: {},
    create: {
      username:     'repartidor1',
      email:        'repartidor1@gastubos.com',
      passwordHash: repHash,
      nombre:       'Diego Sosa',
      rol:          'REPARTIDOR',
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
    { id: 'TUBO-000001', serie: 'SN-2021-001', gas: 'CO2',      capacidadKg: 25,     pesoKg: 75, estado: 'DISPONIBLE', ubicacion: 'Depósito A' },
    { id: 'TUBO-000002', serie: 'SN-2021-002', gas: 'Oxígeno',  capacidadLitros: 6,  pesoKg: 72, estado: 'ENTREGADO',  ubicacion: 'Cliente', clienteId: cliente1.id },
    { id: 'TUBO-000003', serie: 'SN-2022-011', gas: 'Argón',    capacidadLitros: 2.5,pesoKg: 28, estado: 'ALQUILADO',  ubicacion: 'Cliente', clienteId: cliente2.id },
    { id: 'TUBO-000004', serie: 'SN-2022-012', gas: 'Nitrógeno',capacidadLitros: 6,  pesoKg: 70, estado: 'CARGADO',    ubicacion: 'Depósito B' },
    { id: 'TUBO-000005', serie: 'SN-2023-031', gas: 'Acetileno',capacidadKg: 6,      pesoKg: 30, estado: 'VACIO',      ubicacion: 'Depósito A' },
  ]

  for (const t of tubosData) {
    await prisma.tubo.upsert({
      where:  { id: t.id },
      update: {},
      create: { ...t, propietario: 'PROPIO', fechaCompra: new Date('2021-03-15') },
    })
  }

  // ── Precios de Gas de Ejemplo ──────────────────────────────────────────────
  const preciosData = [
    { gas: 'CO2',              unidad: 'KG', precioUnitario: 15000 },
    { gas: 'OXIGENO',          unidad: 'M3', precioUnitario: 25000 },
    { gas: 'ARGON',            unidad: 'M3', precioUnitario: 45000 },
    { gas: 'NITROGENO',        unidad: 'M3', precioUnitario: 20000 },
    { gas: 'AIRE_COMPRIMIDO',  unidad: 'M3', precioUnitario: 12000 },
    { gas: 'MEZCLA_CO2_ARGON', unidad: 'M3', precioUnitario: 40000 },
    { gas: 'ACETILENO',        unidad: 'KG', precioUnitario: 60000 },
  ]

  for (const p of preciosData) {
    await prisma.precioGas.upsert({
      where:  { gas: p.gas },
      update: { precioUnitario: p.precioUnitario, unidad: p.unidad },
      create: { gas: p.gas, unidad: p.unidad, precioUnitario: p.precioUnitario },
    })
  }

  // ── Planes de Alquiler ─────────────────────────────────────────────────────
  // update: {} a propósito (igual que usuarios/clientes/tubos arriba): si un
  // admin ya editó precios desde el panel, correr el seed de nuevo no se los pisa.
  // items: plantilla de equipos que se precarga en la remisión de alquiler.
  // Ajustable después desde /planes-alquiler — estos son valores de arranque.
  const planesData = [
    { codigo: 'CHICO',   nombre: 'Equipo Chico',   precioInicial: 400000, diasIncluidos: 30, precioMensual: 250000, precioRecargaDomicilio: 100000,
      items: [
        { descripcion: 'Cilindro de oxígeno (equipo chico)', cantidad: 1, serializado: true,  orden: 0 },
        { descripcion: 'Regulador con flujómetro',           cantidad: 1, serializado: false, orden: 1 },
        { descripcion: 'Vaso humidificador',                 cantidad: 1, serializado: false, orden: 2 },
      ] },
    { codigo: 'MEDIANO', nombre: 'Equipo Mediano', precioInicial: 500000, diasIncluidos: 30, precioMensual: 250000, precioRecargaDomicilio: 150000,
      items: [
        { descripcion: 'Cilindro de oxígeno (equipo mediano)', cantidad: 1, serializado: true,  orden: 0 },
        { descripcion: 'Regulador con flujómetro',             cantidad: 1, serializado: false, orden: 1 },
        { descripcion: 'Vaso humidificador',                   cantidad: 1, serializado: false, orden: 2 },
      ] },
    { codigo: 'GRANDE',  nombre: 'Equipo Grande',  precioInicial: 600000, diasIncluidos: 30, precioMensual: 250000, precioRecargaDomicilio: 260000,
      items: [
        { descripcion: 'Cilindro de oxígeno (equipo grande)', cantidad: 1, serializado: true,  orden: 0 },
        { descripcion: 'Regulador con flujómetro',            cantidad: 1, serializado: false, orden: 1 },
        { descripcion: 'Vaso humidificador',                  cantidad: 1, serializado: false, orden: 2 },
        { descripcion: 'Carrito de transporte',               cantidad: 1, serializado: false, orden: 3 },
      ] },
  ]
  for (const p of planesData) {
    const { items, ...planFields } = p
    const plan = await prisma.planAlquiler.upsert({
      where:  { codigo: p.codigo },
      update: {},
      create: { ...planFields, descripcion: 'Tubo de oxígeno cargado + regulador + accesorios. Incluye 30 días de alquiler.' },
    })
    // Solo sembramos ítems si el plan todavía no tiene ninguno (no pisa una
    // lista ya ajustada por un admin desde el panel).
    const yaTiene = await prisma.planAlquilerItem.count({ where: { planId: plan.id } })
    if (yaTiene === 0) {
      await prisma.planAlquilerItem.createMany({ data: items.map(i => ({ ...i, planId: plan.id })) })
    }
  }

  console.log('✅ Seed completo.')
  console.log('   👤 Admin:      admin / admin1234')
  console.log('   👤 Operador:   operador1 / operador123')
  console.log('   👤 Repartidor: repartidor1 / repartidor123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
