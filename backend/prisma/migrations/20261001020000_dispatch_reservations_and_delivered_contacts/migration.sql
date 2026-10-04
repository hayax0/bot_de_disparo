-- CreateTable: DispatchReservation
CREATE TABLE IF NOT EXISTS "DispatchReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dispatchKey" TEXT NOT NULL,
    "cycleKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DeliveredWorkspaceContact
CREATE TABLE IF NOT EXISTS "DeliveredWorkspaceContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveredWorkspaceContact_pkey" PRIMARY KEY ("id")
);

-- Unique & Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "DispatchReservation_userId_cycleKey_dispatchKey_key" ON "DispatchReservation"("userId", "cycleKey", "dispatchKey");
CREATE INDEX IF NOT EXISTS "DispatchReservation_userId_cycleKey_idx" ON "DispatchReservation"("userId", "cycleKey");
CREATE INDEX IF NOT EXISTS "DispatchReservation_dispatchKey_idx" ON "DispatchReservation"("dispatchKey");

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveredWorkspaceContact_workspaceId_phone_key" ON "DeliveredWorkspaceContact"("workspaceId", "phone");
CREATE INDEX IF NOT EXISTS "DeliveredWorkspaceContact_workspaceId_idx" ON "DeliveredWorkspaceContact"("workspaceId");

-- Foreign Keys
ALTER TABLE "DispatchReservation" DROP CONSTRAINT IF EXISTS "DispatchReservation_userId_fkey";
ALTER TABLE "DispatchReservation" ADD CONSTRAINT "DispatchReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveredWorkspaceContact" DROP CONSTRAINT IF EXISTS "DeliveredWorkspaceContact_workspaceId_fkey";
ALTER TABLE "DeliveredWorkspaceContact" ADD CONSTRAINT "DeliveredWorkspaceContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
