// gastubos/backend/src/utils/helpers.js
import { prisma } from './prisma.js'

/**
 * Genera un ID de tubo atómico (TUBO-000001).
 * En el caso bootstrap (contador inexistente) arranca desde el último ID emitido
 * en la tabla `tubos`. El upsert resuelve la carrera entre llamadas concurrentes.
 */
export async function generarIdTubo(tx = prisma) {
  const key = 'TUBO'

  const ultimoTubo = await tx.tubo.findFirst({
    orderBy: { id: 'desc' },
    select: { id: true },
  })
  const match = ultimoTubo?.id.match(/TUBO-(\d+)/)
  const startValue = match ? parseInt(match[1], 10) : 0

  const counter = await tx.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: startValue + 1 },
  })

  return `TUBO-${String(counter.value).padStart(6, '0')}`
}

/**
 * Genera un número de comprobante atómico (E-2026-001)
 */
export async function generarNumero(prefijo, tx = prisma) {
  const anio = new Date().getFullYear()
  const key  = `${prefijo}-${anio}`

  const counter = await tx.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 }
  })

  const num = String(counter.value).padStart(3, '0')
  return `${prefijo}-${anio}-${num}`
}

/**
 * Mapea el campo libre Tubo.gas (string) al enum TipoGas.
 */
export function mapTuboGasToTipoGas(tuboGas) {
  if (!tuboGas) return 'CO2'
  const norm = tuboGas.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  if (norm.includes('co2')) return 'CO2'
  if (norm.includes('oxigeno')) return 'OXIGENO'
  if (norm.includes('argon')) return 'ARGON'
  if (norm.includes('nitrogeno')) return 'NITROGENO'
  if (norm.includes('aire')) return 'AIRE_COMPRIMIDO'
  if (norm.includes('mezcla')) return 'MEZCLA_CO2_ARGON'
  if (norm.includes('acetileno')) return 'ACETILENO'
  return 'CO2'
}
