-- CreateEnum
CREATE TYPE "EstadoFinancieroAlquiler" AS ENUM ('AL_DIA', 'PROXIMO_VENCIMIENTO', 'PAGO_PENDIENTE', 'VENCIDO');

-- CreateEnum
CREATE TYPE "TipoCargoAlquiler" AS ENUM ('INICIAL', 'MENSUALIDAD', 'RECARGA_DOMICILIO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoCargoAlquiler" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADO', 'VENCIDO', 'ANULADO');

-- DropForeignKey
ALTER TABLE "auditoria" DROP CONSTRAINT "auditoria_tuboId_fkey";

-- DropForeignKey
ALTER TABLE "cilindros_terceros_info" DROP CONSTRAINT "cilindros_terceros_info_clienteId_fkey";

-- AlterTable
ALTER TABLE "alquileres" ADD COLUMN     "diasIncluidosAplicados" INTEGER,
ADD COLUMN     "estadoFinanciero" "EstadoFinancieroAlquiler" NOT NULL DEFAULT 'AL_DIA',
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "precioInicialAplicado" DECIMAL(10,2),
ADD COLUMN     "precioMensualAplicado" DECIMAL(10,2),
ADD COLUMN     "precioRecargaAplicado" DECIMAL(10,2),
ADD COLUMN     "primerPeriodoHasta" TIMESTAMP(3),
ALTER COLUMN "estado" SET DEFAULT 'PENDIENTE_ENTREGA';

-- AlterTable
ALTER TABLE "auditoria" ALTER COLUMN "tuboId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "planes_alquiler" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precioInicial" DECIMAL(10,2) NOT NULL,
    "diasIncluidos" INTEGER NOT NULL DEFAULT 30,
    "precioMensual" DECIMAL(10,2) NOT NULL,
    "precioRecargaDomicilio" DECIMAL(10,2) NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planes_alquiler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargos_alquiler" (
    "id" TEXT NOT NULL,
    "alquilerId" TEXT NOT NULL,
    "tipo" "TipoCargoAlquiler" NOT NULL,
    "periodoDesde" TIMESTAMP(3) NOT NULL,
    "periodoHasta" TIMESTAMP(3) NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "montoPagado" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "estado" "EstadoCargoAlquiler" NOT NULL DEFAULT 'PENDIENTE',
    "metodoPago" TEXT,
    "fechaPago" TIMESTAMP(3),
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cargos_alquiler_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planes_alquiler_codigo_key" ON "planes_alquiler"("codigo");

-- CreateIndex
CREATE INDEX "cargos_alquiler_alquilerId_idx" ON "cargos_alquiler"("alquilerId");

-- CreateIndex
CREATE INDEX "cargos_alquiler_estado_idx" ON "cargos_alquiler"("estado");

-- CreateIndex
CREATE INDEX "cargos_alquiler_fechaVencimiento_idx" ON "cargos_alquiler"("fechaVencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "cargos_alquiler_alquilerId_tipo_periodoDesde_key" ON "cargos_alquiler"("alquilerId", "tipo", "periodoDesde");

-- AddForeignKey
ALTER TABLE "alquileres" ADD CONSTRAINT "alquileres_planId_fkey" FOREIGN KEY ("planId") REFERENCES "planes_alquiler"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_alquiler" ADD CONSTRAINT "cargos_alquiler_alquilerId_fkey" FOREIGN KEY ("alquilerId") REFERENCES "alquileres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_tuboId_fkey" FOREIGN KEY ("tuboId") REFERENCES "tubos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cilindros_terceros_info" ADD CONSTRAINT "cilindros_terceros_info_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed idempotente: los 3 planes estándar deben existir automáticamente apenas
-- se aplica esta migración, sin depender de correr un script aparte.
-- ON CONFLICT DO NOTHING: si ya existen (re-ejecución, u otro ambiente que los
-- cargó por seed.js), no se pisan precios ya editados por un administrador.
INSERT INTO "planes_alquiler" ("id", "codigo", "nombre", "precioInicial", "diasIncluidos", "precioMensual", "precioRecargaDomicilio", "descripcion", "activo", "createdAt", "updatedAt")
VALUES
  ('plan_chico_seed',   'CHICO',   'Equipo Chico',   400000.00, 30, 250000.00, 100000.00, 'Tubo de oxígeno cargado + regulador + accesorios. Incluye 30 días de alquiler.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_mediano_seed', 'MEDIANO', 'Equipo Mediano', 500000.00, 30, 250000.00, 150000.00, 'Tubo de oxígeno cargado + regulador + accesorios. Incluye 30 días de alquiler.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_grande_seed',  'GRANDE',  'Equipo Grande',  600000.00, 30, 250000.00, 260000.00, 'Tubo de oxígeno cargado + regulador + accesorios. Incluye 30 días de alquiler.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;
