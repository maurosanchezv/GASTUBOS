-- AlterTable
ALTER TABLE "tubos" ADD COLUMN     "camionId" TEXT;

-- CreateTable
CREATE TABLE "camiones" (
    "id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "capacidadMax" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camiones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "camiones_placa_key" ON "camiones"("placa");

-- AddForeignKey
ALTER TABLE "tubos" ADD CONSTRAINT "tubos_camionId_fkey" FOREIGN KEY ("camionId") REFERENCES "camiones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
