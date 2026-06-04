// gastubos/backend/src/utils/helpers.js
import { prisma } from './prisma.js'

/**
 * Genera un ID de tubo atómico (TUBO-000001)
 */
export async function generarIdTubo() {
  const key = 'TUBO'
  const counter = await prisma.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 }
  })
  const num = String(counter.value).padStart(6, '0')
  return `TUBO-${num}`
}

/**
 * Genera un número de comprobante atómico (E-2026-001)
 */
export async function generarNumero(prefijo) {
  const anio = new Date().getFullYear()
  const key  = `${prefijo}-${anio}`
  
  const counter = await prisma.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 }
  })

  const num = String(counter.value).padStart(3, '0')
  return `${prefijo}-${anio}-${num}`
}
