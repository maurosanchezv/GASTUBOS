-- CreateEnum
CREATE TYPE "TipoGas" AS ENUM ('CO2', 'OXIGENO', 'ARGON', 'NITROGENO', 'AIRE_COMPRIMIDO', 'MEZCLA_CO2_ARGON', 'ACETILENO');

-- CreateEnum
CREATE TYPE "UnidadGas" AS ENUM ('KG', 'M3');

-- CreateTable
CREATE TABLE "cargas" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "tuboId" TEXT NOT NULL,
    "tipoGas" "TipoGas" NOT NULL,
    "unidad" "UnidadGas" NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "fechaCarga" TIMESTAMP(3) NOT NULL,
    "operadorId" TEXT NOT NULL,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cargas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cargas_numero_key" ON "cargas"("numero");

-- CreateIndex
CREATE INDEX "cargas_tuboId_idx" ON "cargas"("tuboId");

-- CreateIndex
CREATE INDEX "cargas_operadorId_idx" ON "cargas"("operadorId");

-- CreateIndex
CREATE INDEX "cargas_fechaCarga_idx" ON "cargas"("fechaCarga");

-- AddForeignKey
ALTER TABLE "cargas" ADD CONSTRAINT "cargas_tuboId_fkey" FOREIGN KEY ("tuboId") REFERENCES "tubos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargas" ADD CONSTRAINT "cargas_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
