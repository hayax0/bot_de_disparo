ALTER TABLE "AiOperation" ADD COLUMN "profileSnapshot" JSONB;
CREATE TABLE "ProfessionalProfile" (
  "userId" TEXT NOT NULL,
  "professionalName" TEXT NOT NULL DEFAULT '',
  "workMode" TEXT NOT NULL DEFAULT 'SELF_EMPLOYED',
  "companyName" TEXT NOT NULL DEFAULT '',
  "services" TEXT NOT NULL DEFAULT '',
  "targetAudience" TEXT NOT NULL DEFAULT '',
  "objective" TEXT NOT NULL DEFAULT '',
  "completedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfessionalProfile_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "ProfessionalProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
