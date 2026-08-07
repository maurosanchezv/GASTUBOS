// gastubos/backend/scripts/create-admin.js
// Crea un usuario ADMIN en una base recién migrada, sin depender del seed de
// datos de prueba. Uso: node scripts/create-admin.js
//
// Nota: el password se tipea en texto plano en la terminal (no queda oculto)
// pero no se guarda en ningún archivo ni en el historial de bash — solo se
// usa en memoria para calcular el hash bcrypt.
//
// Las preguntas se encadenan con callbacks anidados, no con await entre
// llamadas a rl.question(): en Node 20, un await entre preguntas hace que la
// lectura del stdin se cuelgue en la segunda pregunta cuando stdin no es una
// TTY (pipe/heredoc), como al automatizar este script.
import readline from 'node:readline'
import { stdin, stdout } from 'node:process'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/utils/prisma.js'

const rl = readline.createInterface({ input: stdin, output: stdout })

rl.question('Username: ', (username) => {
  rl.question('Email: ', (email) => {
    rl.question('Nombre completo: ', (nombre) => {
      rl.question('Password (mín. 8 caracteres): ', (password) => {
        rl.close()
        crearAdmin(username.trim(), email.trim(), nombre.trim(), password)
      })
    })
  })
})

async function crearAdmin(username, email, nombre, password) {
  try {
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
  } catch (err) {
    console.error(err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}
