-- Fecha límite de cobro de una venta a crédito. Opcional y sin default:
-- aditiva y segura, no afecta ventas existentes.
ALTER TABLE "ventas_productos" ADD COLUMN "fechaVencimiento" TIMESTAMP(3);
