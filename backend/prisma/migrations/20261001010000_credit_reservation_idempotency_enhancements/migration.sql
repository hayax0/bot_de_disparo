-- CreateTable: CreditReservation
CREATE TABLE IF NOT EXISTS "CreditReservation" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "monthlyAmount" INTEGER NOT NULL DEFAULT 0,
    "purchasedAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "description" TEXT,
    "consumedAmount" INTEGER,
    "settledAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "monthlyExpiresAt" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id")
);

-- AlterTable: CompanySearch
ALTER TABLE "CompanySearch" ADD COLUMN IF NOT EXISTS "targetCampaignId" TEXT;
ALTER TABLE "CompanySearch" ADD COLUMN IF NOT EXISTS "reservationId" TEXT;
ALTER TABLE "CompanySearch" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "CompanySearch" ADD COLUMN IF NOT EXISTS "apifyActorId" TEXT;
ALTER TABLE "CompanySearch" ADD COLUMN IF NOT EXISTS "providerCost" DOUBLE PRECISION;

-- Unique & Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "CreditReservation_idempotencyKey_key" ON "CreditReservation"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CompanySearch_idempotencyKey_key" ON "CompanySearch"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "CreditReservation_userId_status_idx" ON "CreditReservation"("userId", "status");
CREATE INDEX IF NOT EXISTS "CreditReservation_walletId_idx" ON "CreditReservation"("walletId");
CREATE INDEX IF NOT EXISTS "CreditReservation_sourceType_sourceId_idx" ON "CreditReservation"("sourceType", "sourceId");

-- Foreign Keys
ALTER TABLE "CreditReservation" DROP CONSTRAINT IF EXISTS "CreditReservation_walletId_fkey";
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CreditWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditReservation" DROP CONSTRAINT IF EXISTS "CreditReservation_userId_fkey";
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
