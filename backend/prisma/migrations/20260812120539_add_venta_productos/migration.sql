-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA');

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" TEXT NOT NULL,
    "categoriaNombre" TEXT,
    "precio" DECIMAL(10,2) NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'unidades',
    "stock" INTEGER,
    "stockMinimo" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas_productos" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "metodoPago" "MetodoPago" NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "observaciones" TEXT,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "fechaVenta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_venta_productos" (
    "id" TEXT NOT NULL,
    "ventaProductoId" TEXT NOT NULL,
    "productoId" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL DEFAULT 1.000,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "detalles_venta_productos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigo_key" ON "productos"("codigo");

-- CreateIndex
CREATE INDEX "productos_categoria_idx" ON "productos"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_productos_numero_key" ON "ventas_productos"("numero");

-- CreateIndex
CREATE INDEX "ventas_productos_clienteId_idx" ON "ventas_productos"("clienteId");

-- CreateIndex
CREATE INDEX "ventas_productos_usuarioId_idx" ON "ventas_productos"("usuarioId");

-- CreateIndex
CREATE INDEX "ventas_productos_fechaVenta_idx" ON "ventas_productos"("fechaVenta");

-- CreateIndex
CREATE INDEX "detalles_venta_productos_ventaProductoId_idx" ON "detalles_venta_productos"("ventaProductoId");

-- CreateIndex
CREATE INDEX "detalles_venta_productos_productoId_idx" ON "detalles_venta_productos"("productoId");

-- AddForeignKey
ALTER TABLE "ventas_productos" ADD CONSTRAINT "ventas_productos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_productos" ADD CONSTRAINT "ventas_productos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_venta_productos" ADD CONSTRAINT "detalles_venta_productos_ventaProductoId_fkey" FOREIGN KEY ("ventaProductoId") REFERENCES "ventas_productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_venta_productos" ADD CONSTRAINT "detalles_venta_productos_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
