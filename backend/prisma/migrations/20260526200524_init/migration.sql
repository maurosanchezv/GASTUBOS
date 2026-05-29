-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'SUPERVISOR', 'OPERADOR');

-- CreateEnum
CREATE TYPE "EstadoTubo" AS ENUM ('DISPONIBLE', 'CARGADO', 'VACIO', 'ENTREGADO', 'ALQUILADO', 'VENDIDO', 'RESERVADO', 'PERDIDO', 'DEVUELTO', 'EN_REVISION');

-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('EMPRESA', 'PYME', 'PARTICULAR');

-- CreateEnum
CREATE TYPE "TipoPropietario" AS ENUM ('PROPIO', 'CLIENTE');

-- CreateEnum
CREATE TYPE "TipoOperacion" AS ENUM ('ENTREGA_SIMPLE', 'ALQUILER', 'VENTA');

-- CreateEnum
CREATE TYPE "EstadoAlquiler" AS ENUM ('ACTIVO', 'VENCIDO', 'FINALIZADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "telefono" TEXT,
    "direccion" TEXT,
    "contacto" TEXT,
    "tipo" "TipoCliente" NOT NULL DEFAULT 'EMPRESA',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tubos" (
    "id" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "gas" TEXT NOT NULL,
    "capacidadLitros" INTEGER NOT NULL,
    "talla" TEXT NOT NULL,
    "pesoKg" DECIMAL(8,2),
    "estado" "EstadoTubo" NOT NULL DEFAULT 'DISPONIBLE',
    "propietario" "TipoPropietario" NOT NULL DEFAULT 'PROPIO',
    "fechaCompra" TIMESTAMP(3),
    "ubicacion" TEXT,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clienteId" TEXT,
    "propietarioClienteId" TEXT,

    CONSTRAINT "tubos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "direccionEntrega" TEXT NOT NULL,
    "tipoOperacion" "TipoOperacion" NOT NULL,
    "fechaEntrega" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "repartidorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entregas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_entrega" (
    "id" TEXT NOT NULL,
    "entregaId" TEXT NOT NULL,
    "tuboId" TEXT NOT NULL,

    CONSTRAINT "detalles_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alquileres" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tuboId" TEXT NOT NULL,
    "entregaId" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "fechaDevolucion" TIMESTAMP(3),
    "estado" "EstadoAlquiler" NOT NULL DEFAULT 'ACTIVO',
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alquileres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tuboId" TEXT NOT NULL,
    "fechaVenta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referencia" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "tuboId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "estadoAnterior" "EstadoTubo",
    "estadoNuevo" "EstadoTubo",
    "observaciones" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_ruc_key" ON "clientes"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "tubos_serie_key" ON "tubos"("serie");

-- CreateIndex
CREATE UNIQUE INDEX "entregas_numero_key" ON "entregas"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "detalles_entrega_entregaId_tuboId_key" ON "detalles_entrega"("entregaId", "tuboId");

-- CreateIndex
CREATE UNIQUE INDEX "alquileres_numero_key" ON "alquileres"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_numero_key" ON "ventas"("numero");

-- CreateIndex
CREATE INDEX "auditoria_tuboId_idx" ON "auditoria"("tuboId");

-- CreateIndex
CREATE INDEX "auditoria_usuarioId_idx" ON "auditoria"("usuarioId");

-- CreateIndex
CREATE INDEX "auditoria_createdAt_idx" ON "auditoria"("createdAt");

-- AddForeignKey
ALTER TABLE "tubos" ADD CONSTRAINT "tubos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_entrega" ADD CONSTRAINT "detalles_entrega_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "entregas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_entrega" ADD CONSTRAINT "detalles_entrega_tuboId_fkey" FOREIGN KEY ("tuboId") REFERENCES "tubos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alquileres" ADD CONSTRAINT "alquileres_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alquileres" ADD CONSTRAINT "alquileres_tuboId_fkey" FOREIGN KEY ("tuboId") REFERENCES "tubos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alquileres" ADD CONSTRAINT "alquileres_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "entregas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_tuboId_fkey" FOREIGN KEY ("tuboId") REFERENCES "tubos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_tuboId_fkey" FOREIGN KEY ("tuboId") REFERENCES "tubos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
