// Helper SOLO para probar el flujo de mensualidades en dev. No se usa en prod.
//
//   node scripts-dev-mensualidades.mjs list
//       → muestra todos los alquileres con su estado y su próximo cobro
//
//   node scripts-dev-mensualidades.mjs set <numero> <YYYY-MM-DD>
//       → fuerza alquiler.fechaVencimiento a esa fecha (para no esperar 30 días)
//
//   node scripts-dev-mensualidades.mjs atras <numero> <dias>
//       → retrocede la fechaVencimiento actual N días
//
// Después de un `set`/`atras`, apretá "Generar mensualidades" en la app y volvé
// a correr `list` para ver el efecto.

import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const d = (x) => (x ? new Date(x).toISOString().slice(0, 10) : '—')
const [cmd, numero, arg] = process.argv.slice(2)

async function list() {
  const alqs = await p.alquiler.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      numero: true, estado: true, estadoFinanciero: true,
      fechaInicio: true, fechaVencimiento: true, primerPeriodoHasta: true,
      cliente: { select: { nombre: true } }, plan: { select: { codigo: true } },
      cargos: { select: { tipo: true, estado: true, monto: true, montoPagado: true, periodoDesde: true, periodoHasta: true }, orderBy: { periodoDesde: 'asc' } },
    },
  })
  console.log('HOY:', d(new Date()), '\n')
  for (const a of alqs) {
    console.log(`${a.numero} | ${a.estado} | financiero: ${a.estadoFinanciero} | ${a.cliente?.nombre} | plan ${a.plan?.codigo}`)
    console.log(`   inicio ${d(a.fechaInicio)}  ·  próximo cobro (fechaVencimiento) ${d(a.fechaVencimiento)}`)
    for (const c of a.cargos) {
      console.log(`   - ${c.tipo.padEnd(18)} ${c.estado.padEnd(9)} monto ${c.monto}  pagado ${c.montoPagado}  período ${d(c.periodoDesde)} → ${d(c.periodoHasta)}`)
    }
    console.log()
  }
}

async function setFecha(num, iso) {
  const a = await p.alquiler.update({
    where: { numero: num },
    data: { fechaVencimiento: new Date(`${iso}T00:00:00.000Z`) },
    select: { numero: true, fechaVencimiento: true },
  })
  console.log(`${a.numero} → fechaVencimiento = ${d(a.fechaVencimiento)}`)
}

async function atras(num, dias) {
  const a = await p.alquiler.findUnique({ where: { numero: num }, select: { fechaVencimiento: true } })
  if (!a) throw new Error(`No existe ${num}`)
  const nueva = new Date(a.fechaVencimiento)
  nueva.setUTCDate(nueva.getUTCDate() - Number(dias))
  const upd = await p.alquiler.update({ where: { numero: num }, data: { fechaVencimiento: nueva }, select: { numero: true, fechaVencimiento: true } })
  console.log(`${upd.numero} → fechaVencimiento = ${d(upd.fechaVencimiento)} (retrocedida ${dias} días)`)
}

try {
  if (cmd === 'list') await list()
  else if (cmd === 'set') await setFecha(numero, arg)
  else if (cmd === 'atras') await atras(numero, arg)
  else console.log('Comandos: list | set <numero> <YYYY-MM-DD> | atras <numero> <dias>')
} finally {
  await p.$disconnect()
}
