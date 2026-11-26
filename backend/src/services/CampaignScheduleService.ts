import { DelayedError, type Job, type Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { isSubscriptionActive } from './SubscriptionManager';
import { QuotaService } from './QuotaService';
import { claimReviewedBatch, type SendReviewConfirmation } from './CampaignSendReview';
import { queueCampaignLeads } from './CampaignStarter';

export const SCHEDULED_CAMPAIGN_START_JOB = 'start-scheduled-campaign';
const SCHEDULED_JOB_ATTEMPTS = 3;

export class CampaignScheduleError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export function scheduledCampaignJobId(campaignId: string) {
  return `campaign_start_${campaignId}`;
}

export function validateCampaignSchedule(scheduledAt: Date, timezone: string, now = new Date()) {
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= now.getTime()) {
    throw new CampaignScheduleError('Escolha uma data e hora futuras para agendar a campanha.', 400);
  }
  try {
    if (!timezone.trim() || timezone.length > 80) throw new Error('invalid timezone');
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(scheduledAt);
  } catch {
    throw new CampaignScheduleError('O fuso horário informado não é válido.', 400);
  }
}

async function addScheduledStartJob(queue: Queue, input: { campaignId: string; workspaceId: string; scheduledAt: Date }) {
  const jobId = scheduledCampaignJobId(input.campaignId);
  const scheduledAt = input.scheduledAt.toISOString();
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    const sameTime = new Date(existing.data?.scheduledAt).getTime() === input.scheduledAt.getTime();
    if (sameTime && ['active', 'delayed', 'waiting', 'waiting-children', 'prioritized'].includes(state)) return false;
    // A running old job checks its timestamp against the database and exits. Recovery
    // will create the replacement once that deterministic job ID has been released.
    if (state === 'active') return false;
    await existing.remove();
  }
  await queue.add(SCHEDULED_CAMPAIGN_START_JOB, { ...input, scheduledAt }, {
    jobId,
    delay: Math.max(0, input.scheduledAt.getTime() - Date.now()),
    attempts: SCHEDULED_JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
  return true;
}

async function resetScheduledBatch(db: PrismaClient, campaignId: string, batchId: string | null, message: string) {
  await db.$transaction(async tx => {
    // A scheduled review always has a batch. Never release every legacy lead
    // with a null sendBatchId if a malformed/interrupted campaign has no batch.
    if (batchId) {
      await tx.lead.updateMany({
        where: { campaignId, sendBatchId: batchId, status: 'QUEUED', sendStartedAt: null },
        data: { status: 'PENDING', sendBatchId: null, errorMessage: null },
      });
    }
    await tx.campaign.updateMany({
      where: { id: campaignId, activeSendBatchId: batchId, status: { in: ['SCHEDULED', 'STARTING', 'PAUSING'] } },
      data: { status: 'PAUSED', activeSendBatchId: null, scheduledAt: null, scheduleError: message },
    });
  });
}

export async function scheduleCampaign(
  db: PrismaClient,
  queue: Queue,
  campaignId: string,
  workspaceId: string,
  scheduledAt: Date,
  timezone: string,
  review: SendReviewConfirmation,
  retryFailed = false,
) {
  validateCampaignSchedule(scheduledAt, timezone);
  const claimed = await claimReviewedBatch(db, campaignId, workspaceId, retryFailed, review);
  const updated = await db.campaign.updateMany({
    where: { id: campaignId, workspaceId, status: 'STARTING', activeSendBatchId: claimed.batchId },
    data: { status: 'SCHEDULED', scheduledAt, scheduleTimezone: timezone, scheduleError: null },
  });
  if (!updated.count) {
    await resetScheduledBatch(db, campaignId, claimed.batchId, 'A campanha mudou durante o agendamento. Revise os contatos e tente novamente.');
    throw new CampaignScheduleError('A campanha mudou durante o agendamento. Revise os contatos e tente novamente.');
  }

  // The database is the source of truth. If Redis is briefly unavailable, the
  // scheduled-campaign recovery loop will recreate this deterministic job.
  await addScheduledStartJob(queue, { campaignId, workspaceId, scheduledAt }).catch(error => {
    console.error(`[SCHEDULE] Campanha ${campaignId} salva; fila será recuperada:`, error);
  });
  return {
    message: `Campanha agendada para ${new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' }).format(scheduledAt)}.`,
    scheduledAt: scheduledAt.toISOString(),
    jobsQueued: claimed.leads.length,
  };
}

export async function rescheduleCampaign(db: PrismaClient, queue: Queue, campaignId: string, workspaceId: string, scheduledAt: Date, timezone: string) {
  validateCampaignSchedule(scheduledAt, timezone);
  const updated = await db.campaign.updateMany({
    where: { id: campaignId, workspaceId, status: 'SCHEDULED', scheduledAt: { not: null } },
    data: { scheduledAt, scheduleTimezone: timezone, scheduleError: null },
  });
  if (!updated.count) {
    const campaign = await db.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { id: true, status: true } });
    if (!campaign) throw new CampaignScheduleError('Campanha não encontrada.', 404);
    throw new CampaignScheduleError('Esta campanha não está mais agendada. Atualize a tela e tente novamente.');
  }
  await addScheduledStartJob(queue, { campaignId, workspaceId, scheduledAt }).catch(error => {
    console.error(`[SCHEDULE] Novo horário da campanha ${campaignId} salvo; fila será recuperada:`, error);
  });
  return { message: 'Horário da campanha atualizado.', scheduledAt: scheduledAt.toISOString() };
}

export async function cancelScheduledCampaign(db: PrismaClient, queue: Queue, campaignId: string, workspaceId: string) {
  const claimed = await db.campaign.updateMany({
    where: { id: campaignId, workspaceId, status: 'SCHEDULED' },
    data: { status: 'PAUSING' },
  });
  if (!claimed.count) {
    const campaign = await db.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { id: true, status: true } });
    if (!campaign) throw new CampaignScheduleError('Campanha não encontrada.', 404);
    throw new CampaignScheduleError('A campanha já começou ou não está mais agendada. Atualize a tela e tente novamente.');
  }

  const campaign = await db.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { activeSendBatchId: true } });
  const batchId = campaign?.activeSendBatchId || null;
  const job = await queue.getJob(scheduledCampaignJobId(campaignId)).catch(() => null);
  if (job) {
    const state = await job.getState().catch(() => 'unknown');
    if (state !== 'active') await job.remove().catch(() => {});
  }
  await db.$transaction(async tx => {
    if (batchId) {
      await tx.lead.updateMany({
        where: { campaignId, sendBatchId: batchId, status: 'QUEUED', sendStartedAt: null },
        data: { status: 'PENDING', sendBatchId: null, errorMessage: null },
      });
    }
    await tx.campaign.updateMany({
      where: { id: campaignId, workspaceId, status: 'PAUSING', activeSendBatchId: batchId },
      data: { status: 'PAUSED', activeSendBatchId: null, scheduledAt: null, scheduleError: null },
    });
  });
  return { message: 'Agendamento cancelado. Os contatos continuam pendentes para uma nova revisão.' };
}

async function failScheduledStart(db: PrismaClient, campaign: { id: string; activeSendBatchId: string | null }, message: string) {
  await resetScheduledBatch(db, campaign.id, campaign.activeSendBatchId, message);
}

export async function runScheduledCampaignStartJob(db: PrismaClient, queue: Queue, job: Job, token?: string) {
  const { campaignId, workspaceId } = job.data as { campaignId?: string; workspaceId?: string; scheduledAt?: string };
  if (!campaignId || !workspaceId || !job.data.scheduledAt) return;
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    include: { workspace: { include: { user: true } } },
  });
  if (!campaign || !campaign.scheduledAt || !['SCHEDULED', 'STARTING'].includes(campaign.status)) return;
  let requestedAt = new Date(job.data.scheduledAt).getTime();
  if (!Number.isFinite(requestedAt)) return;
  if (requestedAt !== campaign.scheduledAt.getTime() && campaign.status === 'SCHEDULED') {
    // A reschedule can happen while the deterministic BullMQ job is active.
    // Let that same job adopt the database's new time instead of waiting for recovery.
    requestedAt = campaign.scheduledAt.getTime();
    await job.updateData({ ...job.data, scheduledAt: campaign.scheduledAt.toISOString() });
  }
  if (requestedAt !== campaign.scheduledAt.getTime()) return;
  if (requestedAt > Date.now()) {
    await job.moveToDelayed(requestedAt, token);
    throw new DelayedError();
  }

  if (campaign.status === 'SCHEDULED') {
    const claimed = await db.campaign.updateMany({
      where: { id: campaignId, workspaceId, status: 'SCHEDULED', scheduledAt: campaign.scheduledAt, activeSendBatchId: campaign.activeSendBatchId },
      data: { status: 'STARTING', scheduleError: null },
    });
    if (!claimed.count) return;
  }

  const batchId = campaign.activeSendBatchId;
  const user = campaign.workspace?.user;
  let preflightError: string | null = null;
  if (!batchId) preflightError = 'O lote da campanha não está mais disponível. Revise os contatos e agende novamente.';
  else if (!user || !isSubscriptionActive(user)) preflightError = 'Sua assinatura não está ativa no horário agendado. Regularize o plano e inicie a campanha novamente.';
  else {
    const session = await db.whatsappSession.findUnique({ where: { workspaceId }, select: { status: true } });
    if (session?.status !== 'CONNECTED') preflightError = 'WhatsApp desconectado no horário agendado. Reconecte o aparelho e inicie a campanha novamente.';
    else {
      const quota = await QuotaService.canDispatch(user);
      if (!quota.allowed) preflightError = quota.reason || 'A franquia de disparos acabou antes do horário agendado.';
    }
  }

  const leads = batchId ? await db.lead.findMany({
    where: { campaignId, sendBatchId: batchId, status: 'QUEUED', sendStartedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  }) : [];
  if (!preflightError && !leads.length) preflightError = 'Não há contatos pendentes neste lote. Revise os contatos e tente novamente.';
  if (preflightError) {
    await failScheduledStart(db, campaign, preflightError);
    return;
  }

  await queueCampaignLeads(queue, campaign, campaignId, workspaceId, leads, batchId!);
  const started = await db.campaign.updateMany({
    where: { id: campaignId, workspaceId, status: 'STARTING', activeSendBatchId: batchId, scheduledAt: campaign.scheduledAt },
    data: { status: 'RUNNING', scheduledAt: null, scheduleError: null },
  });
  if (!started.count) {
    await failScheduledStart(db, campaign, 'O início foi interrompido antes de liberar os envios. Revise e inicie a campanha novamente.');
  }
}

export async function recoverScheduledCampaigns(db: PrismaClient, queue: Queue) {
  const campaigns = await db.campaign.findMany({
    where: { status: { in: ['SCHEDULED', 'STARTING', 'PAUSING'] }, scheduledAt: { not: null } },
    select: { id: true, workspaceId: true, status: true, activeSendBatchId: true, scheduledAt: true },
  });
  for (const campaign of campaigns) {
    try {
      if (campaign.status === 'PAUSING') {
        await resetScheduledBatch(db, campaign.id, campaign.activeSendBatchId, 'O agendamento foi cancelado durante uma reinicialização. Os contatos continuam pendentes.');
        const interruptedCancel = await queue.getJob(scheduledCampaignJobId(campaign.id));
        if (interruptedCancel) await interruptedCancel.remove().catch(() => {});
        continue;
      }
      const jobId = scheduledCampaignJobId(campaign.id);
      const job = await queue.getJob(jobId);
      const state = job ? await job.getState() : null;
      if (campaign.status === 'STARTING') {
        if (job && ['active', 'delayed', 'waiting', 'waiting-children', 'prioritized'].includes(state || '')) continue;
        await failScheduledStart(db, campaign, 'O backend foi reiniciado durante a preparação do agendamento. Revise e agende novamente.');
        if (job) await job.remove().catch(() => {});
        continue;
      }
      if (job && state === 'failed') {
        await failScheduledStart(db, campaign, 'Não foi possível iniciar a campanha após algumas tentativas. Revise os avisos e agende novamente.');
        await job.remove().catch(() => {});
        continue;
      }
      await addScheduledStartJob(queue, { campaignId: campaign.id, workspaceId: campaign.workspaceId, scheduledAt: campaign.scheduledAt! });
    } catch (error) {
      console.error(`[SCHEDULE RECOVERY] Falha ao recuperar campanha ${campaign.id}:`, error);
    }
  }
}
