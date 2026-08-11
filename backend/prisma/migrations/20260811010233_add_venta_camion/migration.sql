-- AlterEnum
ALTER TYPE "TipoCarga" ADD VALUE 'CAMION';

-- AlterTable
ALTER TABLE "tubos" ADD COLUMN     "cantidadActual" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "cargas" ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "metodoPago" TEXT,
ADD COLUMN     "montoRecibido" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "camiones" ADD COLUMN     "repartidorActualId" TEXT;

-- CreateIndex
CREATE INDEX "cargas_clienteId_idx" ON "cargas"("clienteId");

-- AddForeignKey
ALTER TABLE "cargas" ADD CONSTRAINT "cargas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camiones" ADD CONSTRAINT "camiones_repartidorActualId_fkey" FOREIGN KEY ("repartidorActualId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
