-- AlterTable
ALTER TABLE "ventas_productos" ADD COLUMN "entregaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ventas_productos_entregaId_key" ON "ventas_productos"("entregaId");

-- AddForeignKey
ALTER TABLE "ventas_productos" ADD CONSTRAINT "ventas_productos_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "entregas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
