-- AlterTable
ALTER TABLE "cargas" ADD COLUMN "ventaCamionId" TEXT;

-- CreateTable
CREATE TABLE "ventas_camion" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "operadorId" TEXT NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "montoRecibido" DECIMAL(10,2) NOT NULL,
    "fechaVenta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_camion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ventas_camion_numero_key" ON "ventas_camion"("numero");
CREATE INDEX "ventas_camion_operadorId_idx" ON "ventas_camion"("operadorId");
CREATE INDEX "ventas_camion_fechaVenta_idx" ON "ventas_camion"("fechaVenta");
CREATE INDEX "cargas_ventaCamionId_idx" ON "cargas"("ventaCamionId");

-- AddForeignKey
ALTER TABLE "ventas_camion" ADD CONSTRAINT "ventas_camion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ventas_camion" ADD CONSTRAINT "ventas_camion_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cargas" ADD CONSTRAINT "cargas_ventaCamionId_fkey" FOREIGN KEY ("ventaCamionId") REFERENCES "ventas_camion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
