-- AlterTable User (garante todas as colunas de assinatura e auditoria)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'INACTIVE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "caktoCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "caktoSubscriptionId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "caktoOrderId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionCanceledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionRenewedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionInterval" TEXT;

-- CreateTable WebhookLog (garante tabela de auditoria e idempotência de webhooks)
CREATE TABLE IF NOT EXISTS "WebhookLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'cakto',
    "eventId" TEXT,
    "event" TEXT NOT NULL,
    "email" TEXT,
    "payload" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebhookLog_provider_eventId_idx" ON "WebhookLog"("provider", "eventId");
CREATE INDEX IF NOT EXISTS "WebhookLog_email_idx" ON "WebhookLog"("email");

-- CreateTable SubscriptionNotification (garante idempotência de avisos por ciclo e histórico)
CREATE TABLE IF NOT EXISTS "SubscriptionNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "resendEmailId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionNotification_userId_type_cycle_key" ON "SubscriptionNotification"("userId", "type", "cycle");
CREATE INDEX IF NOT EXISTS "SubscriptionNotification_userId_idx" ON "SubscriptionNotification"("userId");
CREATE INDEX IF NOT EXISTS "SubscriptionNotification_recipientEmail_idx" ON "SubscriptionNotification"("recipientEmail");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionNotification_userId_fkey'
    ) THEN
        ALTER TABLE "SubscriptionNotification" ADD CONSTRAINT "SubscriptionNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
