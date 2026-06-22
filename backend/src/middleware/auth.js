// gastubos/backend/src/middleware/auth.js

import jwt from 'jsonwebtoken'

export const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en el entorno. Configurar en .env antes de arrancar.')
}

// Verifica el token JWT en el header Authorization: Bearer <token>
export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' })
  }
  try {
    const token = header.slice(7)
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload   // { id, username, rol }
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

// Factory: solo deja pasar si el usuario tiene alguno de los roles indicados
// Uso: requireRol('ADMIN', 'SUPERVISOR')
export function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' })
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Sin permiso para esta acción' })
    }
    next()
  }
}
