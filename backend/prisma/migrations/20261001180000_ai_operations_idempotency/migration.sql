-- CreateTable
CREATE TABLE "AiOperation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BATCH',
    "leadId" TEXT,
    "idempotencyKey" TEXT,
    "payloadHash" TEXT,
    "offerDescription" TEXT,
    "toneStyle" TEXT NOT NULL DEFAULT 'CONSULTATIVE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reservationId" TEXT,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "completedLeads" INTEGER NOT NULL DEFAULT 0,
    "failedLeads" INTEGER NOT NULL DEFAULT 0,
    "creditsReserved" INTEGER NOT NULL DEFAULT 0,
    "creditsConsumed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "resultSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiOperation_idempotencyKey_key" ON "AiOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AiOperation_userId_status_idx" ON "AiOperation"("userId", "status");

-- CreateIndex
CREATE INDEX "AiOperation_campaignId_status_idx" ON "AiOperation"("campaignId", "status");

-- CreateIndex
CREATE INDEX "AiOperation_workspaceId_idx" ON "AiOperation"("workspaceId");

-- AddForeignKey
ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
