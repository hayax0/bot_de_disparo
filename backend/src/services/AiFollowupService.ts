import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AiCopyService } from './AiCopyService';
import { CreditWalletService } from './CreditWalletService';
import { commercialPhone, commercialPhoneSql, lockCommercialContact } from './CommercialContacts';
import { getUserCapabilities } from '../config/plans';
import { profileContext } from './ProfessionalProfile';

function problem(message: string, statusCode: number) { return Object.assign(new Error(message), { statusCode }); }
type Input = { userId: string; workspaceId: string; campaignId: string; leadId: string; instruction: string; idempotencyKey: string };
async function eligible(tx: Prisma.TransactionClient, input: Input, expectedPhone?: string) {
  const lead = await tx.lead.findFirst({ where: { id: input.leadId, campaignId: input.campaignId, campaign: { workspaceId: input.workspaceId, workspace: { userId: input.userId } } } });
  const phone = lead && commercialPhone(lead.phone);
  if (!lead || !phone || (expectedPhone && phone !== expectedPhone)) throw problem('Contato não encontrado ou removido.', 404);
  if (lead.optedOutAt || ['OPTED_OUT', 'IGNORED'].includes(lead.status)) throw problem('Este contato não deve receber novas abordagens.', 403);
  const [row] = await tx.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`SELECT EXISTS (
    SELECT 1 FROM "Blacklist" b WHERE (b.scope = 'GLOBAL' OR (b.scope = 'WORKSPACE' AND b."workspaceId" = ${input.workspaceId}))
      AND ${commercialPhoneSql(Prisma.sql`b.phone`)} = ${phone}
  ) AS blocked`);
  if (row?.blocked) throw problem('Contato bloqueado. A geração não foi iniciada.', 403);
  return { lead, phone };
}

/** Sugere um texto independente. Nunca altera Lead, campanha ou fila de mensagens. */
export class AiFollowupService {
  static async suggest(input: Input) {
    const instruction = input.instruction.trim();
    if (instruction.length < 5 || instruction.length > 1000 || !input.idempotencyKey.trim() || input.idempotencyKey.length > 128) throw problem('Informe a orientação (5 a 1.000 caracteres) e uma chave de solicitação válida.', 400);
    const user = await prisma.user.findUnique({ where: { id: input.userId }, include: { professionalProfile: true } });
    if (!user || !getUserCapabilities(user).canUseAi) throw Object.assign(problem('Seu plano não permite utilizar a IA.', 403), { code: 'AI_NOT_ALLOWED' });
    if (!AiCopyService.isAvailable()) throw problem('O assistente de IA está indisponível no momento.', 503);
    const key = `followup_${input.userId}_${input.idempotencyKey.trim()}`;
    const hash = createHash('sha256').update(JSON.stringify([input.workspaceId, input.campaignId, input.leadId, instruction])).digest('hex');
    // Reserva e reivindicação pertencem à mesma transação: não há crédito órfão entre elas.
    const claim = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const initial = await eligible(tx, input);
      await lockCommercialContact(tx, input.workspaceId, initial.phone);
      const target = await eligible(tx, input, initial.phone);
      const existing = await tx.aiOperation.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (existing.userId !== input.userId || existing.workspaceId !== input.workspaceId || existing.campaignId !== input.campaignId || existing.leadId !== input.leadId || existing.type !== 'FOLLOW_UP' || existing.payloadHash !== hash) throw problem('Esta solicitação já foi usada com outros dados.', 409);
        if (existing.status === 'COMPLETED') return { existing: true as const, op: existing, ...target };
        if (existing.status === 'FAILED') throw problem('Esta geração não foi concluída. Solicite uma nova sugestão.', 422);
        throw problem('Sugestão em processamento. Tente novamente com a mesma solicitação em alguns instantes.', 409);
      }
      const reservation = await CreditWalletService.reserveCredits({ userId: input.userId, amount: 1, sourceType: 'AI_ASSISTANT', sourceId: input.campaignId, idempotencyKey: key, description: 'Sugestão de retorno com IA', metadata: { operationType: 'FOLLOW_UP' } }, tx);
      const snapshot = profileContext(user.professionalProfile);
      const op = await tx.aiOperation.create({ data: {
        userId: input.userId, workspaceId: input.workspaceId, campaignId: input.campaignId, leadId: input.leadId,
        type: 'FOLLOW_UP', idempotencyKey: key, payloadHash: hash, offerDescription: instruction, toneStyle: 'DIRECT',
        status: 'PROCESSING', reservationId: reservation.reservationId, totalLeads: 1, creditsReserved: 1,
        ...(snapshot ? { profileSnapshot: snapshot } : {}),
      } });
      return { existing: false as const, op, ...target };
    });
    if (claim.existing) return { leadId: input.leadId, messageContent: claim.op.resultSummary || '', isExisting: true };
    try {
      await prisma.$transaction(tx => eligible(tx, input, claim.phone));
      const copy = await AiCopyService.callGeminiApi({ purpose: 'FOLLOW_UP', leadTitle: claim.lead.title, phone: claim.lead.phone,
        website: claim.lead.website, neighborhood: claim.lead.neighborhood, senderName: user.name || 'Consultor',
        senderCompany: profileContext(user.professionalProfile)?.companyName || '', professionalProfile: profileContext(user.professionalProfile) || undefined,
        offerDescription: instruction, toneStyle: 'DIRECT' });
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
        await lockCommercialContact(tx, input.workspaceId, claim.phone);
        await eligible(tx, input, claim.phone);
        const current = await tx.aiOperation.findUnique({ where: { id: claim.op.id } });
        if (current?.status !== 'PROCESSING') throw problem('A solicitação foi encerrada. Gere outra sugestão.', 409);
        if (claim.op.reservationId) await CreditWalletService.settleReservation({ reservationId: claim.op.reservationId, actualConsumedAmount: 1, description: 'Sugestão de retorno concluída (1 crédito)' }, tx);
        await tx.aiOperation.update({ where: { id: claim.op.id }, data: { status: 'COMPLETED', resultSummary: copy, completedLeads: 1, creditsConsumed: 1 } });
      });
      return { leadId: input.leadId, messageContent: copy, isExisting: false };
    } catch (error) {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
        const current = await tx.aiOperation.findUnique({ where: { id: claim.op.id } });
        if (!current) {
          const reservation = claim.op.reservationId ? await tx.creditReservation.findUnique({ where: { id: claim.op.reservationId } }) : null;
          if (reservation?.status === 'PENDING') await CreditWalletService.releaseReservation({ reservationId: reservation.id, reason: 'Campanha removida durante a sugestão' }, tx);
          return;
        }
        if (current.status !== 'PROCESSING') return;
        if (claim.op.reservationId) await CreditWalletService.releaseReservation({ reservationId: claim.op.reservationId, reason: 'Sugestão de retorno não concluída' }, tx);
        await tx.aiOperation.update({ where: { id: claim.op.id }, data: { status: 'FAILED', failedLeads: 1, errorMessage: 'Não foi possível gerar a sugestão. Nenhum crédito foi consumido.' } });
      });
      throw error;
    }
  }

  // A API do provedor expira em 30s. Após 2min, encerra solicitações interrompidas sem repetir a chamada paga.
  static async recoverInterrupted(cutoff = new Date(Date.now() - 120_000)) {
    const interrupted = await prisma.aiOperation.findMany({ where: { type: 'FOLLOW_UP', status: 'PROCESSING', updatedAt: { lt: cutoff } }, select: { id: true, idempotencyKey: true } });
    for (const op of interrupted) await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${op.idempotencyKey || op.id}))`;
      const current = await tx.aiOperation.findFirst({ where: { id: op.id, status: 'PROCESSING', updatedAt: { lt: cutoff } } });
      if (!current) return;
      if (current.reservationId) await CreditWalletService.releaseReservation({ reservationId: current.reservationId, reason: 'Sugestão interrompida, sem repetição automática' }, tx);
      await tx.aiOperation.update({ where: { id: op.id }, data: { status: 'FAILED', failedLeads: 1, errorMessage: 'Geração interrompida. Nenhum crédito foi consumido.' } });
    });
    // Cascades podem apagar a operação quando uma campanha é excluída durante a chamada externa.
    const orphans = await prisma.creditReservation.findMany({ where: {
      status: 'PENDING', sourceType: 'AI_ASSISTANT', idempotencyKey: { startsWith: 'followup_' },
      metadata: { contains: '"operationType":"FOLLOW_UP"' }, createdAt: { lt: cutoff },
    }, select: { id: true, idempotencyKey: true } });
    for (const reservation of orphans) await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reservation.idempotencyKey}))`;
      if (await tx.aiOperation.findUnique({ where: { idempotencyKey: reservation.idempotencyKey } })) return;
      const current = await tx.creditReservation.findUnique({ where: { id: reservation.id } });
      if (current?.status === 'PENDING') await CreditWalletService.releaseReservation({ reservationId: current.id, reason: 'Solicitação de retorno removida durante interrupção' }, tx);
    });
  }
}
