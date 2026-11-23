ALTER TABLE "CommercialContact"
ADD COLUMN "saleAmount" DECIMAL(12, 2),
ADD COLUMN "saleDate" DATE;

CREATE INDEX "CommercialContact_workspaceId_saleDate_idx"
ON "CommercialContact"("workspaceId", "saleDate");
