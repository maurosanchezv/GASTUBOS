// gastubos/backend/src/utils/helpers.js
import { prisma } from './prisma.js'

export async function generarIdTubo() {
  const count = await prisma.tubo.count()
  const num   = String(count + 1).padStart(6, '0')
  return `TUBO-${num}`
}

const modelos = { E: 'entrega', AL: 'alquiler', V: 'venta', CG: 'carga' }

export async function generarNumero(prefijo) {
  const anio  = new Date().getFullYear()
  const model = modelos[prefijo]
  const count = await prisma[model].count()
  const num   = String(count + 1).padStart(3, '0')
  return `${prefijo}-${anio}-${num}`
}
