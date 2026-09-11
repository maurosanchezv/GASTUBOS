-- FEATURE remisiones-alquiler: detalle de planes de alquiler en las remisiones.
-- 100% aditiva: dos tablas nuevas + una columna nullable en "entregas". No
-- borra ni recalcula nada existente, no toca "planes_alquiler" ni "alquileres".
--
-- ROLLBACK: ver down.sql en esta misma carpeta (Prisma no aplica el down solo;
-- se corre a mano con psql — instrucciones en README.md de esta carpeta).

-- AlterTable: nota general de estado físico del equipo que deja el repartidor.
ALTER TABLE "entregas" ADD COLUMN     "observacionEquipoAlquiler" TEXT;

-- CreateTable: plantilla de ítems que incluye cada plan.
CREATE TABLE "plan_alquiler_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "serializado" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_alquiler_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ítem efectivamente asociado a un contrato (snapshot + serie).
CREATE TABLE "items_alquiler" (
    "id" TEXT NOT NULL,
    "alquilerId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "serializado" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "serie" TEXT,
    "entregado" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_alquiler_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_alquiler_items_planId_idx" ON "plan_alquiler_items"("planId");

-- CreateIndex
CREATE INDEX "items_alquiler_alquilerId_idx" ON "items_alquiler"("alquilerId");

-- AddForeignKey
ALTER TABLE "plan_alquiler_items" ADD CONSTRAINT "plan_alquiler_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "planes_alquiler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_alquiler" ADD CONSTRAINT "items_alquiler_alquilerId_fkey" FOREIGN KEY ("alquilerId") REFERENCES "alquileres"("id") ON DELETE CASCADE ON UPDATE CASCADE;
