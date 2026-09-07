-- AlterTable Workspace (adiciona colunas para persistir última copy do usuário)
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "lastMessageComSite" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "lastMessageSemSite" TEXT;

-- CreateTable DispatchHistory (histórico persistente de empresas contatadas por workspace)
CREATE TABLE IF NOT EXISTS "DispatchHistory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyTitle" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "website" TEXT,
    "neighborhood" TEXT,
    "firstSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessage" TEXT,
    "lastCampaignName" TEXT,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchHistory_pkey" PRIMARY KEY ("id")
);

-- Unique constraint & Índices de busca e ordenação
CREATE UNIQUE INDEX IF NOT EXISTS "DispatchHistory_workspaceId_phone_key" ON "DispatchHistory"("workspaceId", "phone");
CREATE INDEX IF NOT EXISTS "DispatchHistory_workspaceId_idx" ON "DispatchHistory"("workspaceId");
CREATE INDEX IF NOT EXISTS "DispatchHistory_workspaceId_phone_idx" ON "DispatchHistory"("workspaceId", "phone");
CREATE INDEX IF NOT EXISTS "DispatchHistory_workspaceId_lastSentAt_idx" ON "DispatchHistory"("workspaceId", "lastSentAt");

-- Foreign key para Workspace com Cascade
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DispatchHistory_workspaceId_fkey'
    ) THEN
        ALTER TABLE "DispatchHistory" ADD CONSTRAINT "DispatchHistory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Backfill seguro e consolidado de leads históricos com status SENT
INSERT INTO "DispatchHistory" (
    "id",
    "workspaceId",
    "companyTitle",
    "phone",
    "website",
    "neighborhood",
    "firstSentAt",
    "lastSentAt",
    "lastMessage",
    "lastCampaignName",
    "sendCount",
    "createdAt",
    "updatedAt"
)
WITH ranked_leads AS (
    SELECT 
        l.id,
        c."workspaceId",
        l.title AS "companyTitle",
        CASE 
            WHEN regexp_replace(l.phone, '\D', '', 'g') ~ '^55' THEN regexp_replace(l.phone, '\D', '', 'g')
            ELSE '55' || regexp_replace(l.phone, '\D', '', 'g')
        END AS "cleanPhone",
        l.website,
        l.neighborhood,
        l."messageContent",
        c.name AS "campaignName",
        COALESCE(l."sentAt", l."createdAt") AS "sentDate",
        ROW_NUMBER() OVER (
            PARTITION BY c."workspaceId", 
                CASE 
                    WHEN regexp_replace(l.phone, '\D', '', 'g') ~ '^55' THEN regexp_replace(l.phone, '\D', '', 'g')
                    ELSE '55' || regexp_replace(l.phone, '\D', '', 'g')
                END
            ORDER BY COALESCE(l."sentAt", l."createdAt") DESC
        ) AS rn,
        COUNT(*) OVER (
            PARTITION BY c."workspaceId", 
                CASE 
                    WHEN regexp_replace(l.phone, '\D', '', 'g') ~ '^55' THEN regexp_replace(l.phone, '\D', '', 'g')
                    ELSE '55' || regexp_replace(l.phone, '\D', '', 'g')
                END
        ) AS "totalSent",
        MIN(COALESCE(l."sentAt", l."createdAt")) OVER (
            PARTITION BY c."workspaceId", 
                CASE 
                    WHEN regexp_replace(l.phone, '\D', '', 'g') ~ '^55' THEN regexp_replace(l.phone, '\D', '', 'g')
                    ELSE '55' || regexp_replace(l.phone, '\D', '', 'g')
                END
        ) AS "minSent",
        MAX(COALESCE(l."sentAt", l."createdAt")) OVER (
            PARTITION BY c."workspaceId", 
                CASE 
                    WHEN regexp_replace(l.phone, '\D', '', 'g') ~ '^55' THEN regexp_replace(l.phone, '\D', '', 'g')
                    ELSE '55' || regexp_replace(l.phone, '\D', '', 'g')
                END
        ) AS "maxSent"
    FROM "Lead" l
    JOIN "Campaign" c ON c.id = l."campaignId"
    WHERE l.status = 'SENT'
)
SELECT 
    gen_random_uuid()::text,
    "workspaceId",
    "companyTitle",
    "cleanPhone",
    website,
    neighborhood,
    "minSent",
    "maxSent",
    "messageContent",
    "campaignName",
    "totalSent"::integer,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM ranked_leads
WHERE rn = 1
ON CONFLICT ("workspaceId", "phone") DO NOTHING;
