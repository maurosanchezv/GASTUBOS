-- Nuevo canal de la entrega: REPARTO (flujo actual, repartidor + GPS) vs
-- SALON (retiro en mostrador, sin repartidor real ni geolocalización).
-- Sirve para filtrar/reportar y para que el backend fuerce repartidorId al
-- usuario logueado en vez de confiar en lo que mande el frontend.
-- CreateEnum
CREATE TYPE "CanalEntrega" AS ENUM ('REPARTO', 'SALON');

-- AlterTable
ALTER TABLE "entregas" ADD COLUMN     "canal" "CanalEntrega" NOT NULL DEFAULT 'REPARTO';
