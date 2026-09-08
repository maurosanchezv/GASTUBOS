-- CreateEnum
CREATE TYPE "MotivoAsignacionTubo" AS ENUM ('ENTREGA_INICIAL', 'RECAMBIO', 'REEMPLAZO', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoServicioRecarga" AS ENUM ('RECARGA_MISMO_TUBO', 'RECAMBIO_TUBO');

-- CreateEnum
CREATE TYPE "EstadoOrdenRecarga" AS ENUM ('SOLICITADA', 'ASIGNADA', 'EN_RUTA', 'EN_SERVICIO', 'COMPLETADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "alquiler_tubos" (
    "id" TEXT NOT NULL,
    "alquilerId" TEXT NOT NULL,
    "tuboId" TEXT NOT NULL,
    "fechaDesde" TIMESTAMP(3) NOT NULL,
    "fechaHasta" TIMESTAMP(3),
    "motivoAsignacion" "MotivoAsignacionTubo" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alquiler_tubos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_recarga_alquiler" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "alquilerId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tuboId" TEXT NOT NULL,
    "tuboNuevoId" TEXT,
    "repartidorId" TEXT,
    "camionId" TEXT,
    "tipoServicio" "TipoServicioRecarga" NOT NULL,
    "estado" "EstadoOrdenRecarga" NOT NULL DEFAULT 'SOLICITADA',
    "precioAplicado" DECIMAL(10,2) NOT NULL,
    "direccion" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "fechaSolicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaProgramada" TIMESTAMP(3),
    "fechaAsignacion" TIMESTAMP(3),
    "fechaInicioServicio" TIMESTAMP(3),
    "fechaFinalizacion" TIMESTAMP(3),
    "observaciones" TEXT,
    "motivoCancelacion" TEXT,
    "createdById" TEXT NOT NULL,
    "cargoAlquilerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_recarga_alquiler_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alquiler_tubos_alquilerId_idx" ON "alquiler_tubos"("alquilerId");

-- CreateIndex
CREATE INDEX "alquiler_tubos_tuboId_idx" ON "alquiler_tubos"("tuboId");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_recarga_alquiler_numero_key" ON "ordenes_recarga_alquiler"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_recarga_alquiler_cargoAlquilerId_key" ON "ordenes_recarga_alquiler"("cargoAlquilerId");

-- CreateIndex
CREATE INDEX "ordenes_recarga_alquiler_alquilerId_idx" ON "ordenes_recarga_alquiler"("alquilerId");

-- CreateIndex
CREATE INDEX "ordenes_recarga_alquiler_estado_idx" ON "ordenes_recarga_alquiler"("estado");

-- CreateIndex
CREATE INDEX "ordenes_recarga_alquiler_repartidorId_idx" ON "ordenes_recarga_alquiler"("repartidorId");

-- AddForeignKey
ALTER TABLE "alquiler_tubos" ADD CONSTRAINT "alquiler_tubos_alquilerId_fkey" FOREIGN KEY ("alquilerId") REFERENCES "alquileres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alquiler_tubos" ADD CONSTRAINT "alquiler_tubos_tuboId_fkey" FOREIGN KEY ("tuboId") REFERENCES "tubos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_recarga_alquiler" ADD CONSTRAINT "ordenes_recarga_alquiler_alquilerId_fkey" FOREIGN KEY ("alquilerId") REFERENCES "alquileres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_recarga_alquiler" ADD CONSTRAINT "ordenes_recarga_alquiler_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_recarga_alquiler" ADD CONSTRAINT "ordenes_recarga_alquiler_tuboId_fkey" FOREIGN KEY ("tuboId") REFERENCES "tubos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_recarga_alquiler" ADD CONSTRAINT "ordenes_recarga_alquiler_tuboNuevoId_fkey" FOREIGN KEY ("tuboNuevoId") REFERENCES "tubos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_recarga_alquiler" ADD CONSTRAINT "ordenes_recarga_alquiler_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_recarga_alquiler" ADD CONSTRAINT "ordenes_recarga_alquiler_camionId_fkey" FOREIGN KEY ("camionId") REFERENCES "camiones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_recarga_alquiler" ADD CONSTRAINT "ordenes_recarga_alquiler_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_recarga_alquiler" ADD CONSTRAINT "ordenes_recarga_alquiler_cargoAlquilerId_fkey" FOREIGN KEY ("cargoAlquilerId") REFERENCES "cargos_alquiler"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Índices únicos PARCIALES (no expresables en el DSL de Prisma — por eso van
-- a mano acá, ver el comentario en el modelo AlquilerTubo):
--   1) un mismo alquiler no puede tener dos AlquilerTubo activos a la vez
--   2) un mismo tubo no puede estar activo en dos alquileres a la vez
CREATE UNIQUE INDEX "alquiler_tubos_un_activo_por_alquiler" ON "alquiler_tubos"("alquilerId") WHERE "activo" = true;
CREATE UNIQUE INDEX "alquiler_tubos_un_activo_por_tubo" ON "alquiler_tubos"("tuboId") WHERE "activo" = true;

-- Backfill idempotente: todo Alquiler que ya existía de ETAPA 1 (creado antes
-- de que existiera AlquilerTubo) tuvo, por definición, un único tubo durante
-- toda su vida hasta ahora — no hay recambios previos que reconstruir, así
-- que se puede armar exactamente una fila por contrato sin inventar nada:
--   fechaDesde = Alquiler.fechaInicio (el dato real que ya existía)
--   fechaHasta = Alquiler.fechaDevolucion (NULL si el contrato sigue abierto)
--   activo     = true solo si el contrato no está FINALIZADO/CANCELADO
-- El id determinístico ('bkfl_' + id del alquiler) más el NOT EXISTS hacen
-- que correr esto dos veces no duplique nada.
INSERT INTO "alquiler_tubos" ("id", "alquilerId", "tuboId", "fechaDesde", "fechaHasta", "motivoAsignacion", "activo", "createdAt", "updatedAt")
SELECT
  'bkfl_' || a."id",
  a."id",
  a."tuboId",
  a."fechaInicio",
  a."fechaDevolucion",
  'ENTREGA_INICIAL',
  (a."estado" NOT IN ('FINALIZADO', 'CANCELADO')),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "alquileres" a
WHERE NOT EXISTS (SELECT 1 FROM "alquiler_tubos" existente WHERE existente."alquilerId" = a."id");

