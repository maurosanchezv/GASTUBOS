-- ETAPA 1.1: historial real de pagos por cargo (soporta pagos parciales con
-- fecha/monto/forma de pago propios, en vez de un solo campo que se pisa).
-- 100% aditiva: no toca cargos_alquiler, no borra ni recalcula nada existente.
-- Los cargos ya creados en ETAPA 1 (si los hubiera) simplemente no tienen
-- filas acá todavía — no se inventan pagos retroactivos para ellos.

-- CreateTable
CREATE TABLE "pagos_cargo_alquiler" (
    "id" TEXT NOT NULL,
    "cargoAlquilerId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacion" TEXT,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_cargo_alquiler_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagos_cargo_alquiler_cargoAlquilerId_idx" ON "pagos_cargo_alquiler"("cargoAlquilerId");

-- CreateIndex
CREATE INDEX "pagos_cargo_alquiler_fechaPago_idx" ON "pagos_cargo_alquiler"("fechaPago");

-- AddForeignKey
ALTER TABLE "pagos_cargo_alquiler" ADD CONSTRAINT "pagos_cargo_alquiler_cargoAlquilerId_fkey" FOREIGN KEY ("cargoAlquilerId") REFERENCES "cargos_alquiler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cargo_alquiler" ADD CONSTRAINT "pagos_cargo_alquiler_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

