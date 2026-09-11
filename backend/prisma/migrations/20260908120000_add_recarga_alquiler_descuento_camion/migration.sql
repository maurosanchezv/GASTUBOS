-- AlterTable
ALTER TABLE "ordenes_recarga_alquiler" ADD COLUMN "tuboOrigenId" TEXT,
ADD COLUMN "cantidadGasRecargada" DECIMAL(10,3);

-- CreateIndex
CREATE INDEX "ordenes_recarga_alquiler_tuboOrigenId_idx" ON "ordenes_recarga_alquiler"("tuboOrigenId");

-- AddForeignKey
ALTER TABLE "ordenes_recarga_alquiler" ADD CONSTRAINT "ordenes_recarga_alquiler_tuboOrigenId_fkey" FOREIGN KEY ("tuboOrigenId") REFERENCES "tubos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
