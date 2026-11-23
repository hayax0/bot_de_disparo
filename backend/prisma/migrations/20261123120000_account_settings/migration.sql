ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

CREATE TABLE "EmailChangeVerification" (
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EmailChangeVerification_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "EmailChangeVerification_email_key" ON "EmailChangeVerification"("email");
CREATE INDEX "EmailChangeVerification_expiresAt_idx" ON "EmailChangeVerification"("expiresAt");

ALTER TABLE "EmailChangeVerification"
ADD CONSTRAINT "EmailChangeVerification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
