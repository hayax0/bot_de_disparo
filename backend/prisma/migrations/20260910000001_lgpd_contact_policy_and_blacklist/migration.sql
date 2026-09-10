-- Migration: 20260910000001_lgpd_contact_policy_and_blacklist
-- Fase 3: Política de contato, opt-out automático, blacklist com índices parciais e auditoria LGPD

-- 1. Campos de agendamento e política de recontato na Campaign
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "scheduleStartMinute" INTEGER NOT NULL DEFAULT 480;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "scheduleEndMinute" INTEGER NOT NULL DEFAULT 1200;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "scheduleDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6';
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "scheduleTimezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "recontactAfterDays" INTEGER NOT NULL DEFAULT 30;

-- 2. Data de Opt-out no Lead
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "optedOutAt" TIMESTAMP(3);

-- 3. Tabela Blacklist
CREATE TABLE IF NOT EXISTS "Blacklist" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "workspaceId" TEXT,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blacklist_pkey" PRIMARY KEY ("id")
);

-- Índices parciais para garantir unicidade sem problema de NULL no PostgreSQL
CREATE UNIQUE INDEX IF NOT EXISTS "Blacklist_phone_global_key" ON "Blacklist" ("phone")
WHERE "scope" = 'GLOBAL';

CREATE UNIQUE INDEX IF NOT EXISTS "Blacklist_workspaceId_phone_key" ON "Blacklist" ("workspaceId", "phone")
WHERE "scope" = 'WORKSPACE';

CREATE INDEX IF NOT EXISTS "Blacklist_phone_idx" ON "Blacklist"("phone");
CREATE INDEX IF NOT EXISTS "Blacklist_workspaceId_phone_idx" ON "Blacklist"("workspaceId", "phone");

-- Foreign key para Workspace
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Blacklist_workspaceId_fkey'
    ) THEN
        ALTER TABLE "Blacklist" ADD CONSTRAINT "Blacklist_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 4. Tabela de Auditoria LGPD e Administrativa
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "details" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_workspaceId_fkey'
    ) THEN
        ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
