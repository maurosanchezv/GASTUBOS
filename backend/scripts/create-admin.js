// gastubos/backend/scripts/create-admin.js
// Crea un usuario ADMIN en una base recién migrada, sin depender del seed de
// datos de prueba. Uso: node scripts/create-admin.js
//
// Nota: el password se tipea en texto plano en la terminal (no queda oculto)
// pero no se guarda en ningún archivo ni en el historial de bash — solo se
// usa en memoria para calcular el hash bcrypt.
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/utils/prisma.js'

async function main() {
  const rl = createInterface({ input: stdin, output: stdout })

  const username = (await rl.question('Username: ')).trim()
  const email = (await rl.question('Email: ')).trim()
  const nombre = (await rl.question('Nombre completo: ')).trim()
  const password = await rl.question('Password (mín. 8 caracteres): ')
  rl.close()

  if (!username || !email || !nombre || password.length < 8) {
    console.error('❌ Todos los campos son obligatorios y el password debe tener al menos 8 caracteres.')
    process.exit(1)
  }

  const existente = await prisma.usuario.findFirst({
    where: { OR: [{ username }, { email }] },
  })
  if (existente) {
    console.error(`❌ Ya existe un usuario con ese username o email (id: ${existente.id}).`)
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const admin = await prisma.usuario.create({
    data: { username, email, nombre, passwordHash, rol: 'ADMIN' },
  })

  console.log(`✅ Admin creado: ${admin.username} (${admin.email})`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
