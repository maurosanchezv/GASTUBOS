-- Paso 1/2: agregar el nuevo valor de enum en su propia migración.
-- Postgres no permite usar un valor de enum recién creado dentro de la misma
-- transacción que lo crea (error 55P04), así que esto va separado del resto
-- del cambio (columnas, tablas, default), que se aplica en la siguiente migración.
ALTER TYPE "EstadoAlquiler" ADD VALUE 'PENDIENTE_ENTREGA';
