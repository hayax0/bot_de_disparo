CREATE TYPE "CommercialStage" AS ENUM ('UNCLASSIFIED', 'NO_RESPONSE', 'IN_CONVERSATION', 'INTERESTED', 'NOT_INTERESTED');
CREATE TABLE "CommercialContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "stage" "CommercialStage" NOT NULL DEFAULT 'UNCLASSIFIED',
    "notes" TEXT NOT NULL DEFAULT '',
    "meetingBooked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommercialContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommercialContact_workspaceId_phone_key" ON "CommercialContact"("workspaceId", "phone");
CREATE INDEX "CommercialContact_workspaceId_stage_idx" ON "CommercialContact"("workspaceId", "stage");
ALTER TABLE "CommercialContact" ADD CONSTRAINT "CommercialContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
