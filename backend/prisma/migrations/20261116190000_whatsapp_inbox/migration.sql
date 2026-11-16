-- AlterTable
ALTER TABLE "WhatsappSession" ADD COLUMN     "accountId" TEXT;

-- CreateTable
CREATE TABLE "WhatsappConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "contactJid" TEXT,
    "name" TEXT,
    "campaignId" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappInboxMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "providerId" TEXT,
    "requestId" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappInboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappConversation_workspaceId_accountId_lastMessageAt_id_idx" ON "WhatsappConversation"("workspaceId", "accountId", "lastMessageAt", "id");

-- CreateIndex
CREATE INDEX "WhatsappConversation_workspaceId_accountId_contactJid_idx" ON "WhatsappConversation"("workspaceId", "accountId", "contactJid");

-- CreateIndex
CREATE INDEX "WhatsappConversation_workspaceId_phone_idx" ON "WhatsappConversation"("workspaceId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConversation_workspaceId_accountId_phone_key" ON "WhatsappConversation"("workspaceId", "accountId", "phone");

-- CreateIndex
CREATE INDEX "WhatsappInboxMessage_conversationId_createdAt_id_idx" ON "WhatsappInboxMessage"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "WhatsappInboxMessage_status_idx" ON "WhatsappInboxMessage"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappInboxMessage_conversationId_providerId_key" ON "WhatsappInboxMessage"("conversationId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappInboxMessage_conversationId_requestId_key" ON "WhatsappInboxMessage"("conversationId", "requestId");

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappInboxMessage" ADD CONSTRAINT "WhatsappInboxMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsappConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
