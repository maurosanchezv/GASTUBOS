// gastubos/backend/src/utils/auditoria.js
import { prisma } from './prisma.js'

export async function registrarAuditoria({ tuboId, usuarioId, accion, estadoAnterior, estadoNuevo, observaciones, metadata }) {
  return prisma.auditoria.create({
    data: { tuboId, usuarioId, accion, estadoAnterior: estadoAnterior || null, estadoNuevo: estadoNuevo || null, observaciones: observaciones || null, metadata: metadata || null },
  })
}
