-- DropForeignKey
ALTER TABLE "cargas" DROP CONSTRAINT "cargas_tuboId_fkey";

-- AlterTable
ALTER TABLE "cargas" ALTER COLUMN "tuboId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tubos" ADD COLUMN     "capacidadKg" DECIMAL(5,2),
ALTER COLUMN "capacidadLitros" DROP NOT NULL;

-- CreateTable
CREATE TABLE "recambios" (
    "id" TEXT NOT NULL,
    "entregaId" TEXT NOT NULL,
    "tuboEntregadoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recambios_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cargas" ADD CONSTRAINT "cargas_tuboId_fkey" FOREIGN KEY ("tuboId") REFERENCES "tubos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recambios" ADD CONSTRAINT "recambios_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "entregas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recambios" ADD CONSTRAINT "recambios_tuboEntregadoId_fkey" FOREIGN KEY ("tuboEntregadoId") REFERENCES "tubos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recambios" ADD CONSTRAINT "recambios_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
