import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const commercialStages = ['UNCLASSIFIED', 'NO_RESPONSE', 'IN_CONVERSATION', 'INTERESTED', 'NOT_INTERESTED'] as const;
export const commercialInputSchema = z.object({
  stage: z.enum(commercialStages), notes: z.string().trim().max(4000),
  meetingBooked: z.boolean(), version: z.number().int().min(0),
}).strict();
export const commercialFilterSchema = z.object({
  stage: z.enum(['ALL', ...commercialStages]).default('ALL'),
  meeting: z.enum(['ALL', 'YES', 'NO']).default('ALL'),
});
export class CommercialError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function commercialPhone(phone: string): string | null {
  if (phone.startsWith('anon_')) return null;
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return [10, 11].includes(digits.length) ? `55${digits}` : digits;
}
// Mesma normalização da projeção JS, sem inferir o nono dígito ou juntar fixos e celulares.
export function commercialPhoneSql(column: Prisma.Sql) {
  const digits = Prisma.sql`regexp_replace(regexp_replace(${column}, '[^0-9]', '', 'g'), '^0+', '')`;
  return Prisma.sql`CASE WHEN left(${column}, 5) = 'anon_' OR length(${digits}) NOT BETWEEN 10 AND 15 THEN NULL WHEN length(${digits}) IN (10, 11) THEN '55' || ${digits} ELSE ${digits} END`;
}
export const emptyCommercial = () => ({ stage: 'UNCLASSIFIED' as const, notes: '', meetingBooked: false, version: 0, updatedAt: null });
export async function lockCommercialContact(tx: Prisma.TransactionClient, workspaceId: string, phone: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`commercial:${workspaceId}:${phone}`}))`;
}
async function scopedLead(db: Pick<PrismaClient, 'lead'>, workspaceId: string, campaignId: string, leadId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, campaignId, campaign: { workspaceId } }, select: { id: true, title: true, phone: true } });
  if (!lead || !commercialPhone(lead.phone)) throw new CommercialError('Contato não encontrado ou anonimizado.', 404);
  return lead;
}
export async function readCommercial(db: PrismaClient, workspaceId: string, campaignId: string, leadId: string) {
  const lead = await scopedLead(db, workspaceId, campaignId, leadId);
  const record = await db.commercialContact.findUnique({ where: { workspaceId_phone: { workspaceId, phone: commercialPhone(lead.phone)! } } });
  return { lead: { id: lead.id, title: lead.title, phone: lead.phone }, commercial: record || emptyCommercial() };
}
export async function updateCommercial(db: PrismaClient, workspaceId: string, campaignId: string, leadId: string, input: z.infer<typeof commercialInputSchema>) {
  return db.$transaction(async tx => {
    const initial = await scopedLead(tx as PrismaClient, workspaceId, campaignId, leadId);
    const phone = commercialPhone(initial.phone)!;
    await lockCommercialContact(tx, workspaceId, phone);
    // Revalida após o lock compartilhado com anonimização; não recria dados pessoais removidos.
    const lead = await scopedLead(tx as PrismaClient, workspaceId, campaignId, leadId);
    if (commercialPhone(lead.phone) !== phone) throw new CommercialError('Contato alterado. Abra novamente o acompanhamento.', 409);
    const key = { workspaceId_phone: { workspaceId, phone } };
    const current = await tx.commercialContact.findUnique({ where: key });
    if ((current?.version || 0) !== input.version) throw new CommercialError('Este contato foi atualizado em outra janela. Seu rascunho foi preservado; carregue a versão atual antes de editar novamente.', 409);
    const data = { stage: input.stage, notes: input.notes, meetingBooked: input.meetingBooked };
    return current
      ? tx.commercialContact.update({ where: key, data: { ...data, version: { increment: 1 } } })
      : tx.commercialContact.create({ data: { ...data, workspaceId, phone } });
  });
}
export async function commercialForPhones(db: PrismaClient, workspaceId: string, phones: string[]) {
  const keys = [...new Set(phones.map(commercialPhone).filter((phone): phone is string => Boolean(phone)))];
  const rows = keys.length ? await db.commercialContact.findMany({ where: { workspaceId, phone: { in: keys } } }) : [];
  return new Map(rows.map(row => [row.phone, row]));
}
export async function commercialLeadFilter(db: PrismaClient, workspaceId: string, campaignId: string, stage: string, meeting: string) {
  if (stage === 'ALL' && meeting === 'ALL') return undefined;
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT l.id FROM "Lead" l JOIN "Campaign" c ON c.id = l."campaignId"
    LEFT JOIN "CommercialContact" cc ON cc."workspaceId" = c."workspaceId" AND cc.phone = ${commercialPhoneSql(Prisma.sql`l.phone`)}
    WHERE c.id = ${campaignId} AND c."workspaceId" = ${workspaceId}
      AND (${stage} = 'ALL' OR COALESCE(cc.stage::text, 'UNCLASSIFIED') = ${stage})
      AND (${meeting} = 'ALL' OR COALESCE(cc."meetingBooked", false) = ${meeting === 'YES'})`);
  return rows.map(row => row.id);
}
export async function commercialMetrics(db: PrismaClient, workspaceId: string) {
  // Agregação no PostgreSQL: um telefone por campanha; resumo deduplica também entre campanhas.
  return db.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ campaignId: string; name: string; createdAt: Date; total: number; sent: number; replied: number; interested: number; inConversation: number; noResponse: number; notInterested: number; unclassified: number; meetings: number }>>(Prisma.sql`
      WITH contacts AS (
        SELECT l."campaignId", ${commercialPhoneSql(Prisma.sql`l.phone`)} AS phone,
          bool_or(l.status = 'REPLIED') AS replied,
          bool_or(l."sentAt" IS NOT NULL OR l.status IN ('SENT','DELIVERED','READ','REPLIED')) AS sent
        FROM "Lead" l JOIN "Campaign" c ON c.id = l."campaignId" WHERE c."workspaceId" = ${workspaceId}
        GROUP BY 1, 2
      )
      SELECT c.id AS "campaignId", c.name, c."createdAt",
        count(x.phone)::int AS total,
        count(x.phone) FILTER (WHERE x.sent)::int AS sent,
        count(x.phone) FILTER (WHERE x.replied)::int AS replied,
        count(x.phone) FILTER (WHERE cc.stage = 'INTERESTED')::int AS interested,
        count(x.phone) FILTER (WHERE cc.stage = 'IN_CONVERSATION')::int AS "inConversation",
        count(x.phone) FILTER (WHERE cc.stage = 'NO_RESPONSE')::int AS "noResponse",
        count(x.phone) FILTER (WHERE cc.stage = 'NOT_INTERESTED')::int AS "notInterested",
        count(x.phone) FILTER (WHERE cc.stage IS NULL OR cc.stage = 'UNCLASSIFIED')::int AS unclassified,
        count(x.phone) FILTER (WHERE cc."meetingBooked")::int AS meetings
      FROM "Campaign" c LEFT JOIN contacts x ON x."campaignId" = c.id
      LEFT JOIN "CommercialContact" cc ON cc."workspaceId" = c."workspaceId" AND cc.phone = x.phone
      WHERE c."workspaceId" = ${workspaceId} GROUP BY c.id ORDER BY c."createdAt" DESC, c.id`);
    const [summary] = await tx.$queryRaw<Array<{ total: number; sent: number; replied: number; interested: number; meetings: number }>>(Prisma.sql`
      WITH contacts AS (
        SELECT ${commercialPhoneSql(Prisma.sql`l.phone`)} AS phone,
          bool_or(l.status = 'REPLIED') AS replied,
          bool_or(l."sentAt" IS NOT NULL OR l.status IN ('SENT','DELIVERED','READ','REPLIED')) AS sent
        FROM "Lead" l JOIN "Campaign" c ON c.id = l."campaignId" WHERE c."workspaceId" = ${workspaceId} GROUP BY 1
      ) SELECT count(x.phone)::int AS total,
        count(x.phone) FILTER (WHERE x.sent)::int AS sent, count(x.phone) FILTER (WHERE x.replied)::int AS replied,
        count(x.phone) FILTER (WHERE cc.stage = 'INTERESTED')::int AS interested,
        count(x.phone) FILTER (WHERE cc."meetingBooked")::int AS meetings
      FROM contacts x LEFT JOIN "CommercialContact" cc ON cc."workspaceId" = ${workspaceId} AND cc.phone = x.phone`);
    return { summary: summary || { total: 0, sent: 0, replied: 0, interested: 0, meetings: 0 }, campaigns: rows.map(row => ({ ...row, responseRate: row.sent ? Math.round(row.replied / row.sent * 1000) / 10 : null })) };
  }, { isolationLevel: 'RepeatableRead' });
}
