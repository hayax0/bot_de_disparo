import { Prisma, type PrismaClient, type CommercialContact } from '@prisma/client';
import { z } from 'zod';

export const commercialStages = ['UNCLASSIFIED', 'NO_RESPONSE', 'IN_CONVERSATION', 'INTERESTED', 'NOT_INTERESTED'] as const;
// Uma data civil, sem conversão de fuso ou horário de disparo.
export const commercialDateSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !value.startsWith('0000-') && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Informe uma data válida no formato AAAA-MM-DD.');
export const commercialInputSchema = z.object({
  stage: z.enum(commercialStages), notes: z.string().trim().max(4000),
  meetingBooked: z.boolean(), nextContactAt: commercialDateSchema.nullable().optional(), version: z.number().int().min(0),
  saleAmount: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, 'Informe um valor de venda válido.').nullable().optional(),
  saleDate: commercialDateSchema.nullable().optional(),
}).strict().superRefine((input, context) => {
  const hasAmount = input.saleAmount !== undefined;
  const hasDate = input.saleDate !== undefined;
  if (hasAmount !== hasDate || (hasAmount && hasDate && Boolean(input.saleAmount) !== Boolean(input.saleDate))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['saleAmount'], message: 'Informe o valor e a data da venda juntos.' });
  }
  if (input.saleAmount && Number(input.saleAmount) <= 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['saleAmount'], message: 'O valor da venda deve ser maior que zero.' });
  }
});
export const commercialFilterSchema = z.object({
  stage: z.enum(['ALL', ...commercialStages]).default('ALL'),
  meeting: z.enum(['ALL', 'YES', 'NO']).default('ALL'),
});
export const commercialListSchema = z.object({
  search: z.string().trim().max(100).default(''),
  stage: z.enum(['ALL', ...commercialStages]).default('ALL'),
  meeting: z.enum(['ALL', 'YES', 'NO']).default('ALL'),
  reminder: z.enum(['ALL', 'TODAY', 'OVERDUE', 'UPCOMING', 'UNSCHEDULED']).default('ALL'),
  today: commercialDateSchema.default(() => new Date().toISOString().slice(0, 10)),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
export const commercialSalesSchema = z.object({
  from: commercialDateSchema,
  to: commercialDateSchema,
  granularity: z.enum(['day', 'week', 'month']).default('day'),
}).strict();
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
export const emptyCommercial = () => ({ stage: 'UNCLASSIFIED' as const, notes: '', meetingBooked: false, nextContactAt: null, saleAmount: null, saleDate: null, version: 0, updatedAt: null });
export function presentCommercial(record: CommercialContact) {
  return {
    ...record,
    nextContactAt: record.nextContactAt?.toISOString().slice(0, 10) ?? null,
    saleAmount: record.saleAmount?.toFixed(2) ?? null,
    saleDate: record.saleDate?.toISOString().slice(0, 10) ?? null,
  };
}
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
  return { lead: { id: lead.id, title: lead.title, phone: lead.phone }, commercial: record ? presentCommercial(record) : emptyCommercial() };
}
export async function updateCommercial(db: PrismaClient, workspaceId: string, campaignId: string, leadId: string, input: z.infer<typeof commercialInputSchema>) {
  const record = await db.$transaction(async tx => {
    const initial = await scopedLead(tx as PrismaClient, workspaceId, campaignId, leadId);
    const phone = commercialPhone(initial.phone)!;
    await lockCommercialContact(tx, workspaceId, phone);
    // Revalida após o lock compartilhado com anonimização; não recria dados pessoais removidos.
    const lead = await scopedLead(tx as PrismaClient, workspaceId, campaignId, leadId);
    if (commercialPhone(lead.phone) !== phone) throw new CommercialError('Contato alterado. Abra novamente o acompanhamento.', 409);
    const key = { workspaceId_phone: { workspaceId, phone } };
    const current = await tx.commercialContact.findUnique({ where: key });
    if ((current?.version || 0) !== input.version) throw new CommercialError('Este contato foi atualizado em outra janela. Seu rascunho foi preservado; carregue a versão atual antes de editar novamente.', 409);
    const data = {
      stage: input.stage, notes: input.notes, meetingBooked: input.meetingBooked,
      ...(input.nextContactAt !== undefined ? { nextContactAt: input.nextContactAt ? new Date(`${input.nextContactAt}T00:00:00.000Z`) : null } : {}),
      ...(input.saleAmount !== undefined ? { saleAmount: input.saleAmount ? new Prisma.Decimal(input.saleAmount) : null } : {}),
      ...(input.saleDate !== undefined ? { saleDate: input.saleDate ? new Date(`${input.saleDate}T00:00:00.000Z`) : null } : {}),
    };
    return current
      ? tx.commercialContact.update({ where: key, data: { ...data, version: { increment: 1 } } })
      : tx.commercialContact.create({ data: { ...data, workspaceId, phone } });
  });
  return presentCommercial(record);
}

function commercialDateOffset(value: string, offsetDays: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export async function commercialSales(db: PrismaClient, workspaceId: string, query: z.infer<typeof commercialSalesSchema>) {
  if (query.from > query.to) throw new CommercialError('A data inicial deve ser anterior à data final.', 400);
  const spanDays = Math.floor((Date.parse(`${query.to}T00:00:00.000Z`) - Date.parse(`${query.from}T00:00:00.000Z`)) / 86_400_000) + 1;
  if (spanDays > 366) throw new CommercialError('Escolha um período de até 366 dias.', 400);

  const previousFrom = commercialDateOffset(query.from, -spanDays);
  const previousTo = commercialDateOffset(query.from, -1);
  const [series, previousRows] = await Promise.all([
    db.$queryRaw<Array<{ period: string; sales: number; revenue: string }>>(Prisma.sql`
      SELECT to_char(date_trunc(${query.granularity}, cc."saleDate"::timestamp), 'YYYY-MM-DD') AS period,
        count(*)::int AS sales, COALESCE(SUM(cc."saleAmount"), 0)::text AS revenue
      FROM "CommercialContact" cc
      WHERE cc."workspaceId" = ${workspaceId} AND cc."saleAmount" IS NOT NULL AND cc."saleDate" IS NOT NULL
        AND cc."saleDate" BETWEEN ${query.from}::date AND ${query.to}::date
      GROUP BY 1 ORDER BY 1`),
    db.$queryRaw<Array<{ sales: number; revenue: string }>>(Prisma.sql`
      SELECT count(*)::int AS sales, COALESCE(SUM(cc."saleAmount"), 0)::text AS revenue
      FROM "CommercialContact" cc
      WHERE cc."workspaceId" = ${workspaceId} AND cc."saleAmount" IS NOT NULL AND cc."saleDate" IS NOT NULL
        AND cc."saleDate" BETWEEN ${previousFrom}::date AND ${previousTo}::date`),
  ]);
  const previous = previousRows[0] || { sales: 0, revenue: '0.00' };
  const currentRevenue = series.reduce((total, point) => total.plus(point.revenue), new Prisma.Decimal(0));
  const currentSales = series.reduce((total, point) => total + point.sales, 0);
  const previousRevenue = new Prisma.Decimal(previous.revenue);
  const percentChange = (current: Prisma.Decimal, prior: Prisma.Decimal) => prior.isZero()
    ? null
    : Number(current.minus(prior).div(prior).mul(100).toFixed(1));

  return {
    from: query.from,
    to: query.to,
    granularity: query.granularity,
    series,
    summary: {
      revenue: currentRevenue.toFixed(2),
      sales: currentSales,
      averageTicket: currentSales ? currentRevenue.div(currentSales).toFixed(2) : '0.00',
    },
    comparison: {
      previousRevenue: previousRevenue.toFixed(2),
      previousSales: previous.sales,
      revenuePercent: percentChange(currentRevenue, previousRevenue),
      salesPercent: previous.sales ? Number(((currentSales - previous.sales) / previous.sales * 100).toFixed(1)) : null,
      from: previousFrom,
      to: previousTo,
    },
  };
}
export async function commercialForPhones(db: PrismaClient, workspaceId: string, phones: string[]) {
  const keys = [...new Set(phones.map(commercialPhone).filter((phone): phone is string => Boolean(phone)))];
  const rows = keys.length ? await db.commercialContact.findMany({ where: { workspaceId, phone: { in: keys } } }) : [];
  return new Map(rows.map(row => [row.phone, presentCommercial(row)]));
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


export async function listCommercialContacts(db: PrismaClient, workspaceId: string, query: z.infer<typeof commercialListSchema>) {
  const today = query.today; // texto convertido para DATE pelo PostgreSQL, independente do fuso da sessão.
  // Deduplicação vem antes de filtros e paginação: um contato por telefone dentro da conta.
  // O representante mais recente permite abrir uma campanha existente sem criar novos leads.
  const contacts = Prisma.sql`WITH normalized AS (
    SELECT l.id AS "leadId", l."campaignId", c.name AS "campaignName", l.title,
      ${commercialPhoneSql(Prisma.sql`l.phone`)} AS phone, l."createdAt"
    FROM "Lead" l JOIN "Campaign" c ON c.id = l."campaignId" WHERE c."workspaceId" = ${workspaceId}
  ), representatives AS (
    SELECT DISTINCT ON (phone) * FROM normalized WHERE phone IS NOT NULL
    ORDER BY phone, "createdAt" DESC, "leadId" DESC
  ), contacts AS (
    SELECT r.*, COALESCE(cc.stage::text, 'UNCLASSIFIED') AS stage,
      COALESCE(cc.notes, '') AS notes, COALESCE(cc."meetingBooked", false) AS "meetingBooked",
      cc."nextContactAt", cc."saleAmount", cc."saleDate", COALESCE(cc.version, 0) AS version, cc."updatedAt"
    FROM representatives r LEFT JOIN "CommercialContact" cc ON cc."workspaceId" = ${workspaceId} AND cc.phone = r.phone
  )`;
  const filters = Prisma.sql`
    WHERE (${query.stage} = 'ALL' OR stage = ${query.stage})
      AND (${query.meeting} = 'ALL' OR "meetingBooked" = ${query.meeting === 'YES'})
      AND (${query.search} = '' OR position(lower(${query.search}) in lower(concat_ws(' ', title, phone, "campaignName"))) > 0)
      AND (${query.reminder} = 'ALL'
        OR (${query.reminder} = 'TODAY' AND "nextContactAt" = ${today}::date)
        OR (${query.reminder} = 'OVERDUE' AND "nextContactAt" < ${today}::date)
        OR (${query.reminder} = 'UPCOMING' AND "nextContactAt" > ${today}::date)
        OR (${query.reminder} = 'UNSCHEDULED' AND "nextContactAt" IS NULL))`;
  return db.$transaction(async tx => {
    const [counts] = await tx.$queryRaw<Array<{ today: number; overdue: number; scheduled: number }>>(Prisma.sql`${contacts}
      SELECT count(*) FILTER (WHERE "nextContactAt" = ${today}::date)::int AS today,
        count(*) FILTER (WHERE "nextContactAt" < ${today}::date)::int AS overdue,
        count("nextContactAt")::int AS scheduled FROM contacts`);
    const [total] = await tx.$queryRaw<Array<{ total: number }>>(Prisma.sql`${contacts} SELECT count(*)::int AS total FROM contacts ${filters}`);
    const rows = await tx.$queryRaw<Array<{ campaignId: string; campaignName: string; leadId: string; title: string; phone: string; stage: typeof commercialStages[number]; notes: string; meetingBooked: boolean; nextContactAt: Date | null; saleAmount: Prisma.Decimal | null; saleDate: Date | null; version: number; updatedAt: Date | null }>>(Prisma.sql`${contacts}
      SELECT * FROM contacts ${filters}
      ORDER BY CASE WHEN "nextContactAt" < ${today}::date THEN 0 WHEN "nextContactAt" = ${today}::date THEN 1 WHEN "nextContactAt" > ${today}::date THEN 2 ELSE 3 END,
        "nextContactAt" ASC NULLS LAST, lower(title), "leadId"
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`);
    return {
      contacts: rows.map(row => ({ campaignId: row.campaignId, campaignName: row.campaignName, leadId: row.leadId, title: row.title, phone: row.phone,
        commercial: { stage: row.stage, notes: row.notes, meetingBooked: row.meetingBooked, nextContactAt: row.nextContactAt?.toISOString().slice(0, 10) ?? null, saleAmount: row.saleAmount?.toFixed(2) ?? null, saleDate: row.saleDate?.toISOString().slice(0, 10) ?? null, version: row.version, updatedAt: row.updatedAt } })),
      total: total.total, page: query.page, pageSize: query.limit, counts,
    };
  }, { isolationLevel: 'RepeatableRead' });
}
