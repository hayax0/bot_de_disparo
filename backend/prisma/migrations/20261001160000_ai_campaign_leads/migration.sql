-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "aiOfferDescription" TEXT,
ADD COLUMN "aiToneStyle" TEXT DEFAULT 'CONSULTATIVE';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiGeneratedAt" TIMESTAMP(3);
