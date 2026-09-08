-- ROLLBACK de 20260907120000_add_items_plan_alquiler_y_remision
--
-- Prisma Migrate (5.x) NO ejecuta este archivo automáticamente — es un archivo
-- de conveniencia para revertir la feature a mano si se decide descartarla.
-- Deja la base EXACTAMENTE como estaba antes de la migración: elimina las dos
-- tablas nuevas y la columna agregada. No hay pérdida de datos preexistentes
-- porque todo lo que borra fue creado por esta misma feature.
--
-- Cómo usarlo (ver README.md de esta carpeta para el detalle):
--   psql "$DATABASE_URL" -f down.sql
--   npx prisma migrate resolve --rolled-back 20260907120000_add_items_plan_alquiler_y_remision

-- DropForeignKey
ALTER TABLE "items_alquiler" DROP CONSTRAINT IF EXISTS "items_alquiler_alquilerId_fkey";
ALTER TABLE "plan_alquiler_items" DROP CONSTRAINT IF EXISTS "plan_alquiler_items_planId_fkey";

-- DropTable
DROP TABLE IF EXISTS "items_alquiler";
DROP TABLE IF EXISTS "plan_alquiler_items";

-- AlterTable (revertir la columna agregada)
ALTER TABLE "entregas" DROP COLUMN IF EXISTS "observacionEquipoAlquiler";
