-- CreateTable
CREATE TABLE "AiOperationLead" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "generatedContent" TEXT,
    "isSettled" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOperationLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiOperationLead_operationId_leadId_key" ON "AiOperationLead"("operationId", "leadId");

-- CreateIndex
CREATE INDEX "AiOperationLead_operationId_status_idx" ON "AiOperationLead"("operationId", "status");

-- CreateIndex
CREATE INDEX "AiOperationLead_leadId_idx" ON "AiOperationLead"("leadId");

-- AddForeignKey
ALTER TABLE "AiOperationLead" ADD CONSTRAINT "AiOperationLead_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "AiOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiOperationLead" ADD CONSTRAINT "AiOperationLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
