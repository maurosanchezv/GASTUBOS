-- AlterTable
ALTER TABLE "detalles_entrega" ADD COLUMN     "cantidadGas" DECIMAL(10,3) NOT NULL DEFAULT 0.000,
ADD COLUMN     "precioUnitario" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "unidadGas" "UnidadGas" NOT NULL DEFAULT 'KG';

-- AlterTable
ALTER TABLE "entregas" ADD COLUMN     "costoDelivery" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "precios_gas" (
    "id" TEXT NOT NULL,
    "gas" "TipoGas" NOT NULL,
    "unidad" "UnidadGas" NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "actualizadoPor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "precios_gas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "precios_gas_gas_key" ON "precios_gas"("gas");
