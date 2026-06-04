// sync-counters.js
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function sync() {
  console.log('🔄 Sincronizando contadores con datos actuales...')
  
  // 1. Tubos
  const tuboCount = await prisma.tubo.count()
  await prisma.counter.upsert({
    where: { key: 'TUBO' },
    update: { value: tuboCount },
    create: { key: 'TUBO', value: tuboCount }
  })
  console.log(`✅ Contador TUBOS sincronizado: ${tuboCount}`)

  // 2. Comprobantes (E, AL, V, CG)
  const modelos = { E: 'entrega', AL: 'alquiler', V: 'venta', CG: 'carga' }
  const anio = new Date().getFullYear()

  for (const [prefijo, modelo] of Object.entries(modelos)) {
    const count = await prisma[modelo].count()
    const key = `${prefijo}-${anio}`
    await prisma.counter.upsert({
      where: { key },
      update: { value: count },
      create: { key, value: count }
    })
    console.log(`✅ Contador ${key} sincronizado: ${count}`)
  }

  console.log('🚀 Sincronización completada.')
}

sync()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect())
