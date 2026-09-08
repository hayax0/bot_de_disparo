-- AlterTable
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "wppMessageId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lead_wppMessageId_idx" ON "Lead"("wppMessageId");
