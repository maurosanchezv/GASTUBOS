-- Venta a crédito: mismo patrón que ETAPA 1.1 de alquiler (CargoAlquiler /
-- PagoCargoAlquiler). montoCobrado es un acumulado/cache que se mantiene en
-- sincronía con SUM(PagoVentaProducto.monto), que es la fuente de verdad.

-- AlterEnum
ALTER TYPE "MetodoPago" ADD VALUE 'CREDITO';

-- AlterTable
ALTER TABLE "ventas_productos" ADD COLUMN     "montoCobrado" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "pagos_venta_producto" (
    "id" TEXT NOT NULL,
    "ventaProductoId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacion" TEXT,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_venta_producto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagos_venta_producto_ventaProductoId_idx" ON "pagos_venta_producto"("ventaProductoId");

-- CreateIndex
CREATE INDEX "pagos_venta_producto_fechaPago_idx" ON "pagos_venta_producto"("fechaPago");

-- AddForeignKey
ALTER TABLE "pagos_venta_producto" ADD CONSTRAINT "pagos_venta_producto_ventaProductoId_fkey" FOREIGN KEY ("ventaProductoId") REFERENCES "ventas_productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_venta_producto" ADD CONSTRAINT "pagos_venta_producto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
