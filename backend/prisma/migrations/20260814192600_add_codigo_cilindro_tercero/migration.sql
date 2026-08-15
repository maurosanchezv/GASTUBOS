-- AlterTable: agrega el código/serie escaneado o tipeado al recibir un
-- cilindro de tercero, para mostrarlo como campo propio en vez de quedar
-- enterrado en el texto libre de "observaciones".
ALTER TABLE "cilindros_terceros_info" ADD COLUMN "codigo" TEXT;
