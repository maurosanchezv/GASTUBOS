-- AlterTable
ALTER TABLE "entregas" ADD COLUMN     "cancelada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "motivoCancelacion" TEXT;
