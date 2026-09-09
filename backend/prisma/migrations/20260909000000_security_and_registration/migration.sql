-- Aditiva: preserva contas, assinaturas e histórico existentes.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "sendStartedAt" TIMESTAMP(3);
ALTER TABLE "WebhookLog" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookLog_idempotencyKey_key" ON "WebhookLog"("idempotencyKey");

CREATE TABLE IF NOT EXISTS "RegistrationVerification" (
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RegistrationVerification_pkey" PRIMARY KEY ("email")
);
