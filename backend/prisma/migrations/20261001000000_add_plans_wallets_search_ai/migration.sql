-- AlterTable: Adicionar campos de planos, franquias e cotas no User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "monthlyDispatchQuota" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dispatchesUsedInCycle" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cycleResetAt" TIMESTAMP(3);

-- CreateTable: CreditWallet
CREATE TABLE IF NOT EXISTS "CreditWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyBalance" INTEGER NOT NULL DEFAULT 0,
    "purchasedBalance" INTEGER NOT NULL DEFAULT 0,
    "reservedBalance" INTEGER NOT NULL DEFAULT 0,
    "monthlyExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CreditTransaction
CREATE TABLE IF NOT EXISTS "CreditTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "balanceType" TEXT NOT NULL,
    "monthlyAmount" INTEGER NOT NULL DEFAULT 0,
    "purchasedAmount" INTEGER NOT NULL DEFAULT 0,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "idempotencyKey" TEXT,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CreditPurchaseOrder
CREATE TABLE IF NOT EXISTS "CreditPurchaseOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentProvider" TEXT NOT NULL DEFAULT 'cakto',
    "caktoOrderId" TEXT,
    "caktoPaymentUrl" TEXT,
    "idempotencyKey" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditPurchaseOrder_pkey" PRIMARY KEY ("id")
);

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
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompanySearch
CREATE TABLE IF NOT EXISTS "CompanySearch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetCampaignId" TEXT,
    "reservationId" TEXT,
    "query" TEXT NOT NULL,
    "segment" TEXT,
    "location" TEXT,
    "requestedCount" INTEGER NOT NULL,
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "usableCount" INTEGER NOT NULL DEFAULT 0,
    "discardedCount" INTEGER NOT NULL DEFAULT 0,
    "creditsReserved" INTEGER NOT NULL DEFAULT 0,
    "creditsConsumed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "apifyRunId" TEXT,
    "apifyActorId" TEXT,
    "providerCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompanySearchResult
CREATE TABLE IF NOT EXISTS "CompanySearchResult" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "category" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewsCount" INTEGER,
    "isUsable" BOOLEAN NOT NULL DEFAULT false,
    "discardReason" TEXT,
    "importedLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySearchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AiConversation
CREATE TABLE IF NOT EXISTS "AiConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nova conversa',
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AiMessage
CREATE TABLE IF NOT EXISTS "AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" TEXT,
    "toolResult" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "creditsCharged" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- Unique & Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "CreditWallet_userId_key" ON "CreditWallet"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditReservation_idempotencyKey_key" ON "CreditReservation"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditTransaction_idempotencyKey_key" ON "CreditTransaction"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditPurchaseOrder_idempotencyKey_key" ON "CreditPurchaseOrder"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "CreditReservation_userId_status_idx" ON "CreditReservation"("userId", "status");
CREATE INDEX IF NOT EXISTS "CreditReservation_walletId_idx" ON "CreditReservation"("walletId");
CREATE INDEX IF NOT EXISTS "CreditReservation_sourceType_sourceId_idx" ON "CreditReservation"("sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditTransaction_walletId_idx" ON "CreditTransaction"("walletId");
CREATE INDEX IF NOT EXISTS "CreditTransaction_sourceType_sourceId_idx" ON "CreditTransaction"("sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS "CreditPurchaseOrder_userId_idx" ON "CreditPurchaseOrder"("userId");
CREATE INDEX IF NOT EXISTS "CreditPurchaseOrder_caktoOrderId_idx" ON "CreditPurchaseOrder"("caktoOrderId");

CREATE INDEX IF NOT EXISTS "CompanySearch_workspaceId_createdAt_idx" ON "CompanySearch"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "CompanySearch_userId_idx" ON "CompanySearch"("userId");

CREATE INDEX IF NOT EXISTS "CompanySearchResult_searchId_idx" ON "CompanySearchResult"("searchId");
CREATE INDEX IF NOT EXISTS "CompanySearchResult_workspaceId_phone_idx" ON "CompanySearchResult"("workspaceId", "phone");

CREATE INDEX IF NOT EXISTS "AiConversation_userId_updatedAt_idx" ON "AiConversation"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiConversation_workspaceId_idx" ON "AiConversation"("workspaceId");

CREATE INDEX IF NOT EXISTS "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- Foreign Keys
ALTER TABLE "CreditWallet" DROP CONSTRAINT IF EXISTS "CreditWallet_userId_fkey";
ALTER TABLE "CreditWallet" ADD CONSTRAINT "CreditWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditReservation" DROP CONSTRAINT IF EXISTS "CreditReservation_walletId_fkey";
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CreditWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditReservation" DROP CONSTRAINT IF EXISTS "CreditReservation_userId_fkey";
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditTransaction" DROP CONSTRAINT IF EXISTS "CreditTransaction_walletId_fkey";
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CreditWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditPurchaseOrder" DROP CONSTRAINT IF EXISTS "CreditPurchaseOrder_userId_fkey";
ALTER TABLE "CreditPurchaseOrder" ADD CONSTRAINT "CreditPurchaseOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanySearch" DROP CONSTRAINT IF EXISTS "CompanySearch_workspaceId_fkey";
ALTER TABLE "CompanySearch" ADD CONSTRAINT "CompanySearch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanySearch" DROP CONSTRAINT IF EXISTS "CompanySearch_userId_fkey";
ALTER TABLE "CompanySearch" ADD CONSTRAINT "CompanySearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanySearchResult" DROP CONSTRAINT IF EXISTS "CompanySearchResult_searchId_fkey";
ALTER TABLE "CompanySearchResult" ADD CONSTRAINT "CompanySearchResult_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "CompanySearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiConversation" DROP CONSTRAINT IF EXISTS "AiConversation_userId_fkey";
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiConversation" DROP CONSTRAINT IF EXISTS "AiConversation_workspaceId_fkey";
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiMessage" DROP CONSTRAINT IF EXISTS "AiMessage_conversationId_fkey";
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
