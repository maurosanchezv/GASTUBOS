/*
  Warnings:

  - You are about to drop the column `talla` on the `tubos` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TipoCarga" AS ENUM ('NORMAL', 'SALON');

-- CreateEnum
CREATE TYPE "EstadoTercero" AS ENUM ('PENDIENTE', 'ADQUIRIDO', 'DE_BAJA');

-- AlterEnum
ALTER TYPE "EstadoTubo" ADD VALUE 'DE_BAJA';

-- AlterTable
ALTER TABLE "cargas" ADD COLUMN     "precioUnitario" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "tipoCarga" "TipoCarga" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "latitud" DOUBLE PRECISION,
ADD COLUMN     "longitud" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "detalles_entrega" ADD COLUMN     "esAdicional" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "entregas" ADD COLUMN     "sucursalId" TEXT;

-- AlterTable
ALTER TABLE "tubos" DROP COLUMN "talla";

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "cancelada" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "sucursales_clientes" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "ciudad" TEXT,
    "telefono" TEXT,
    "contacto" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sucursales_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "cilindros_terceros_info" (
    "id" TEXT NOT NULL,
    "gas" TEXT NOT NULL,
    "capacidadLitros" DECIMAL(5,2),
    "capacidadKg" DECIMAL(5,2),
    "estado" "EstadoTercero" NOT NULL DEFAULT 'PENDIENTE',
    "observaciones" TEXT,
    "clienteId" TEXT NOT NULL,
    "entregaId" TEXT,
    "repartidorId" TEXT,
    "tuboAdquiridoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cilindros_terceros_info_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sucursales_clientes" ADD CONSTRAINT "sucursales_clientes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales_clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cilindros_terceros_info" ADD CONSTRAINT "cilindros_terceros_info_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cilindros_terceros_info" ADD CONSTRAINT "cilindros_terceros_info_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "entregas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cilindros_terceros_info" ADD CONSTRAINT "cilindros_terceros_info_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cilindros_terceros_info" ADD CONSTRAINT "cilindros_terceros_info_tuboAdquiridoId_fkey" FOREIGN KEY ("tuboAdquiridoId") REFERENCES "tubos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
