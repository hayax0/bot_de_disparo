import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ENV } from '../config/env';
import { gerarProposta, temWebsiteValido } from './ProposalEngine';

const BATCH_LIMIT = 500;
export class CampaignReviewError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export const eligibleForReview = (retryFailed: boolean) => ({
  sendStartedAt: null, sentAt: null, wppMessageId: null, optedOutAt: null,
  status: { in: retryFailed ? ['PENDING', 'QUEUED', 'ERROR'] : ['PENDING', 'QUEUED'] },
});
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function render(lead: any, campaign: any, seed: string) {
  const sender = { meuNome: campaign.workspace?.user?.name || campaign.workspace?.name || '', minhaEmpresa: campaign.workspace?.name || '' };
  let index = 0;
  // A mesma semente resolve as variações exatamente como exibidas durante esta revisão.
  const random = () => parseInt(hash([seed, lead.id, index++]).slice(0, 8), 16) / 0x100000000;
  return lead.messageContent?.trim() || gerarProposta(lead, campaign, sender, random).trim();
}
function snapshot(campaign: any, leads: any[], seed: string) {
  return leads.map(lead => ({
    id: lead.id, title: lead.title, phone: lead.phone, hasWebsite: temWebsiteValido(lead.website),
    message: render(lead, campaign, seed), aiGenerated: lead.aiGenerated,
    version: lead.updatedAt, status: lead.status,
  }));
}
function sign(payload: string) { return createHmac('sha256', ENV.JWT_SECRET).update(`campaign-review:${payload}`).digest('base64url'); }
function readToken(token: string, campaignId: string, workspaceId: string, retryFailed: boolean) {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || signature.length !== sign(payload).length || !timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) throw new CampaignReviewError('Revisão inválida. Abra a revisão novamente.');
  let value;
  try { value = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new CampaignReviewError('Revisão inválida.'); }
  if (value.campaignId !== campaignId || value.workspaceId !== workspaceId || value.retryFailed !== retryFailed || value.expiresAt <= Date.now()) throw new CampaignReviewError('Esta revisão expirou ou pertence a outra campanha. Revise novamente.');
  return value as { campaignId: string; workspaceId: string; retryFailed: boolean; seed: string; digest: string; expiresAt: number };
}
async function load(db: Pick<PrismaClient, 'campaign' | 'lead'>, id: string, workspaceId: string, retryFailed: boolean) {
  const campaign = await db.campaign.findFirst({ where: { id, workspaceId }, include: { workspace: { include: { user: { select: { name: true } } } } } });
  if (!campaign) throw new CampaignReviewError('Campanha não encontrada.', 404);
  if (['RUNNING', 'STARTING', 'PAUSING'].includes(campaign.status)) throw new CampaignReviewError('Pause a campanha antes de revisar outro lote.');
  const leads = await db.lead.findMany({ where: { campaignId: id, ...eligibleForReview(retryFailed) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: BATCH_LIMIT });
  return { campaign, leads };
}
export async function createSendReview(db: PrismaClient, id: string, workspaceId: string, retryFailed: boolean) {
  const { campaign, leads } = await load(db, id, workspaceId, retryFailed);
  const seed = randomBytes(16).toString('hex');
  const rows = snapshot(campaign, leads, seed);
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ campaignId: id, workspaceId, retryFailed, seed, digest: hash(rows), expiresAt })).toString('base64url');
  const eligibleCount = await db.lead.count({ where: { campaignId: id, ...eligibleForReview(retryFailed) } });
  return { campaignName: campaign.name, token: `${payload}.${sign(payload)}`, expiresAt, eligibleCount, batchLimit: BATCH_LIMIT,
    leads: rows.map(({ version: _version, ...row }) => row), aiCredits: 0 };
}
export interface SendReviewConfirmation { token: string; leadIds: string[] }
export async function claimReviewedBatch(db: PrismaClient, id: string, workspaceId: string, retryFailed: boolean, review: SendReviewConfirmation) {
  const token = readToken(review.token, id, workspaceId, retryFailed);
  const ids = [...new Set(review.leadIds)];
  if (!ids.length || ids.length > BATCH_LIMIT || ids.length !== review.leadIds.length) throw new CampaignReviewError('Selecione de 1 a 500 contatos distintos.', 400);
  return db.$transaction(async tx => {
    // Ordem única de locks: campanha -> leads. Edições manuais e IA não atravessam a comparação/claim.
    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${id} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Lead" WHERE "campaignId" = ${id} AND id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
    const { campaign, leads } = await load(tx as PrismaClient, id, workspaceId, retryFailed);
    const rows = snapshot(campaign, leads, token.seed);
    if (hash(rows) !== token.digest) throw new CampaignReviewError('Os contatos ou mensagens mudaram. Atualize a revisão antes de enviar.');
    const selected = rows.filter(row => ids.includes(row.id));
    if (selected.length !== ids.length || selected.some(row => !row.message)) throw new CampaignReviewError('Seleção inválida ou mensagem vazia. Revise os contatos antes de enviar.');
    const batchId = randomUUID();
    const claimed = await tx.campaign.updateMany({ where: { id, workspaceId, status: { notIn: ['RUNNING', 'STARTING', 'PAUSING'] } }, data: { status: 'STARTING', activeSendBatchId: batchId } });
    if (!claimed.count) throw new CampaignReviewError('Esta campanha já está em execução ou iniciando.');
    // Jobs de um lote anterior não podem manter contatos não selecionados como QUEUED.
    await tx.lead.updateMany({ where: { campaignId: id, status: 'QUEUED', sendStartedAt: null, id: { notIn: ids } }, data: { status: 'PENDING' } });
    for (const row of selected) {
      const result = await tx.lead.updateMany({ where: { id: row.id, campaignId: id, ...eligibleForReview(retryFailed) }, data: { sendBatchId: batchId, messageContent: row.message, status: 'QUEUED', errorMessage: null, attempts: 0 } });
      if (result.count !== 1) throw new CampaignReviewError('Um contato mudou durante a revisão. Revise novamente.');
    }
    return { campaign, batchId, leads: leads.filter(lead => ids.includes(lead.id)) };
  }, { timeout: 15000 });
}
