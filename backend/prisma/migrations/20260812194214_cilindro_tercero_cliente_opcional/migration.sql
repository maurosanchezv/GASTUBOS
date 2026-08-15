-- AlterTable: clienteId pasa a opcional para permitir registrar cilindros
-- de terceros recibidos por retorno directo en Cargas, sin cliente asociado.
ALTER TABLE "cilindros_terceros_info" ALTER COLUMN "clienteId" DROP NOT NULL;
