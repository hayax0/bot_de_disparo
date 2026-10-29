-- O lote aprovado invalida jobs antigos sem alterar seus IDs determinísticos.
ALTER TABLE "Campaign" ADD COLUMN "activeSendBatchId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "sendBatchId" TEXT;
