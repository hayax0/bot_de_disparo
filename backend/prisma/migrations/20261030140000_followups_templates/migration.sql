ALTER TABLE "CommercialContact" ADD COLUMN "nextContactAt" DATE;
CREATE INDEX "CommercialContact_workspaceId_nextContactAt_idx" ON "CommercialContact"("workspaceId", "nextContactAt");

CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageTemplate_workspaceId_updatedAt_idx" ON "MessageTemplate"("workspaceId", "updatedAt");
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
