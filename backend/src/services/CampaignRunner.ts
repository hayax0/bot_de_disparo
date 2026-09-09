import { Worker, Job, DelayedError } from 'bullmq';
import { createConnection, messageQueue } from './queue';
import { prisma } from '../lib/prisma';
import { WhatsappManager } from './WhatsappManager';
import { gerarProposta } from './ProposalEngine';
import { isSubscriptionActive } from './SubscriptionManager';

// Helper para verificar se a campanha concluiu todos os leads
async function checkCampaignCompletion(campaignId: string) {
  try {
    const pendingCount = await prisma.lead.count({
      where: {
        campaignId,
        status: { in: ['PENDING', 'QUEUED', 'SENDING'] }
      }
    });

    if (pendingCount === 0) {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (campaign && campaign.status === 'RUNNING') {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'COMPLETED' }
        });
        console.log(`[CAMPAIGN COMPLETED] Campanha "${campaign.name}" (${campaignId}) finalizou todos os envios.`);
      }
    }
  } catch (err) {
    console.error(`Erro ao verificar conclusão da campanha ${campaignId}:`, err);
  }
}

const UNRECOVERABLE_PATTERNS = [
  'não possui conta ativa',
  'telefone fixo',
  'No LID',
  'inválido',
  'LID indisponível',
];

function isUnrecoverableError(errMsg: string): boolean {
  return UNRECOVERABLE_PATTERNS.some(p => errMsg.includes(p));
}

// Job processor com isolamento, idempotência e auditoria
export const campaignWorker = new Worker('message-queue', async (job: Job, token?: string) => {
  const { leadId, campaignId, workspaceId } = job.data;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      workspace: {
        include: { user: true }
      }
    }
  });

  if (!lead || !campaign) {
    console.warn(`[WORKER] Job ${job.id}: lead ou campanha não encontrados (possivelmente excluídos). Ignorando.`);
    return;
  }

  if (lead.campaignId !== campaignId || campaign.workspaceId !== workspaceId) throw new Error('Job com workspace ou campanha incompatível.');
  if (['SENT', 'DELIVERED', 'READ', 'REPLIED', 'ERROR', 'IGNORED'].includes(lead.status)) {
    await checkCampaignCompletion(campaignId);
    return;
  }
  if (lead.sendStartedAt || lead.status === 'SENDING') {
    await prisma.lead.updateMany({
      where: { id: leadId, status: { in: ['SENDING', 'QUEUED', 'PENDING'] } },
      data: { status: 'ERROR', errorMessage: 'Envio anterior sem confirmação final. Confira a conversa antes de reenviar; reenvio automático bloqueado.' },
    });
    await checkCampaignCompletion(campaignId);
    return;
  }
  if (campaign.status === 'STARTING') {
    await job.moveToDelayed(Date.now() + 5000, token);
    throw new DelayedError();
  }

  // BLINDAGEM DE ACESSO: Valida se o usuário possui assinatura ativa antes de qualquer envio
  const user = campaign.workspace?.user;
  if (!user || !isSubscriptionActive(user)) {
    console.warn(`[WORKER] Job ${job.id} bloqueado: Usuário ${user?.email || 'desconhecido'} com assinatura inativa ou expirada. Pausando campanha ${campaignId}.`);
    
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'PAUSED' }
    }).catch(() => {});

    if (lead.status === 'QUEUED' || lead.status === 'SENDING') {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: 'PENDING' }
      }).catch(() => {});
    }

    return;
  }

  // Campanha pausada/excluída: devolve o lead para PENDING para ser retomado depois
  if (campaign.status !== 'RUNNING') {
    if (lead.status === 'QUEUED' || lead.status === 'SENDING') {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: 'PENDING' }
      }).catch(() => {});
    }
    return;
  }

  // Idempotência: Se o lead já foi enviado ou entregue, não reenvia
  if (['SENT', 'DELIVERED', 'READ', 'REPLIED'].includes(lead.status)) {
    await checkCampaignCompletion(campaignId);
    return;
  }

  const senderInfo = {
    meuNome: campaign.workspace?.user?.name || campaign.workspace?.name || '',
    minhaEmpresa: campaign.workspace?.name || ''
  };

  const message = gerarProposta(lead, campaign, senderInfo);
  if (!message) {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: 'ERROR',
        errorMessage: 'Mensagem de proposta vazia ou template inválido'
      }
    });
    await checkCampaignCompletion(campaignId);
    return;
  }

  let sendStarted = false;
  let sentSuccessfully = false;
  try {
    const sentResult = await WhatsappManager.sendMessage(workspaceId, lead.phone, message, async messageId => {
      const claimed = await prisma.lead.updateMany({
        where: { id: leadId, sendStartedAt: null, status: { in: ['PENDING', 'QUEUED'] }, campaign: { status: 'RUNNING' } },
        data: { status: 'SENDING', sendStartedAt: new Date(), wppMessageId: messageId, messageContent: message,
          attempts: job.attemptsMade + 1, errorMessage: null },
      });
      if (claimed.count !== 1) throw new Error('Envio interrompido ou já iniciado.');
      sendStarted = true;
    });
    sentSuccessfully = true;

    const normalizedPhone = WhatsappManager.normalizeBrPhone(lead.phone);
    const now = new Date();

    await prisma.$transaction([
      prisma.lead.updateMany({
        where: { id: leadId, status: { in: ['PENDING', 'QUEUED', 'SENDING'] } },
        data: { status: 'SENT' },
      }),
      prisma.lead.update({
        where: { id: leadId },
        data: {
          wppMessageId: sentResult.messageId,
          sentAt: now,
          messageContent: message,
          errorMessage: null
        }
      }),
      prisma.dispatchHistory.upsert({
        where: {
          workspaceId_phone: {
            workspaceId,
            phone: normalizedPhone
          }
        },
        create: {
          workspaceId,
          phone: normalizedPhone,
          companyTitle: lead.title,
          website: lead.website || null,
          neighborhood: lead.neighborhood || null,
          firstSentAt: now,
          lastSentAt: now,
          lastMessage: message,
          lastCampaignName: campaign.name,
          sendCount: 1
        },
        update: {
          companyTitle: lead.title,
          ...(lead.website ? { website: lead.website } : {}),
          ...(lead.neighborhood ? { neighborhood: lead.neighborhood } : {}),
          lastSentAt: now,
          lastMessage: message,
          lastCampaignName: campaign.name,
          sendCount: { increment: 1 }
        }
      })
    ]);
  } catch (error: any) {
    console.error(`[WORKER ERROR] Falha ao enviar para o lead ${leadId} (${lead.phone}):`, error?.message || error);

    if (sendStarted || sentSuccessfully) {
      // O marcador durável também protege retries após crash ou banco indisponível.
      await prisma.lead.updateMany({
        where: { id: leadId, status: { in: ['PENDING', 'QUEUED', 'SENDING'] } },
        data: { status: 'ERROR', errorMessage: 'Envio iniciado, mas sem confirmação final no sistema. Confira a conversa antes de reenviar; reenvio automático bloqueado.' },
      });
    } else {
      const maxAttempts = job.opts.attempts || 1;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
      const errMsg = error?.message || String(error);
      const unrecoverable = isUnrecoverableError(errMsg);

      if (unrecoverable || isFinalAttempt) {
        // Marca erro definitivo e não bloqueia a fila com retries inúteis
        await prisma.lead.updateMany({
          where: { id: leadId, sendStartedAt: null, status: { in: ['PENDING', 'QUEUED'] } },
          data: {
            status: 'ERROR',
            attempts: job.attemptsMade + 1,
            errorMessage: unrecoverable
              ? errMsg
              : (error?.message || 'Falha após esgotar tentativas de envio no WhatsApp')
          }
        });
        if (!unrecoverable) {
          throw error; // notifica o BullMQ
        }
      } else {
        // Falha temporária recuperável (ex: oscilação de rede): reagenda via BullMQ
        await prisma.lead.updateMany({
          where: { id: leadId, sendStartedAt: null, status: { in: ['PENDING', 'QUEUED'] } },
          data: {
            attempts: job.attemptsMade + 1,
            status: 'QUEUED',
            errorMessage: `Tentativa ${job.attemptsMade + 1}/${maxAttempts} falhou: ${errMsg} (reagendando...)`
          }
        });
        throw error;
      }
    }
  } finally {
    await checkCampaignCompletion(campaignId);
  }

}, {
  connection: createConnection(), // conexão dedicada p/ o Worker (best practice BullMQ)
  autorun: false,                 // O boot reconcilia campanhas antes de liberar o consumo.
  concurrency: 2,                 // reduzido: menos pressão no WhatsApp/Chromium = menos crash e menos ban
  maxStalledCount: 1,             // 1 hesitação e o job vai para retry ao invés de loop infinito
}); 

campaignWorker.on('failed', async (job, err) => {
  if (!job) return;

  const maxAttempts = job.opts.attempts || 1;
  const isFinalAttempt = job.attemptsMade >= maxAttempts;

  console.error(`[JOB FAILED] Job ${job.id} falhou (tentativa ${job.attemptsMade}/${maxAttempts}):`, err?.message || err);

  // Só marca ERROR definitivo na última tentativa. Falhas transitórias (Redis oscilou,
  // worker reiniciou) mantêm o lead em QUEUED para o BullMQ reprocessar.
  if (!isFinalAttempt) return;

  try {
    const { leadId, campaignId } = job.data;
    if (leadId) {
      // Não sobrescreve se o worker já gravou o estado final no processor
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (lead && !['SENT', 'DELIVERED', 'READ', 'REPLIED', 'ERROR'].includes(lead.status)) {
        await prisma.lead.updateMany({
          where: { id: leadId, status: { notIn: ['SENT', 'DELIVERED', 'READ', 'REPLIED', 'ERROR'] } },
          data: {
            status: 'ERROR',
            errorMessage: err?.message || 'Falha definitiva após todas as tentativas'
          }
        });
      }
    }
    if (campaignId) {
      await checkCampaignCompletion(campaignId);
    }
  } catch (dbErr) {
    console.error('Erro ao registrar falha definitiva do lead:', dbErr);
  }
});

// ── Recovery de órfãos no boot ──────────────────────────────────────
// QUEUED sem job pode voltar a PENDING. SENDING/intent persistido exige conferência;
// um envio externo pode ter ocorrido mesmo sem confirmação no banco.
export async function recoverOrphanedLeads() {
  try {
    // Preparações interrompidas não devem ficar bloqueadas após reinício.
    await prisma.campaign.updateMany({ where: { status: 'STARTING' }, data: { status: 'PAUSED' } });
    const runningCampaigns = await prisma.campaign.findMany({
      where: { status: { in: ['RUNNING', 'PAUSED'] } },
      select: { id: true, name: true }
    });

    for (const campaign of runningCampaigns) {
      const queuedLeads = await prisma.lead.findMany({
        where: {
          campaignId: campaign.id,
          status: { in: ['QUEUED', 'SENDING'] }
        },
        select: { id: true, status: true, sendStartedAt: true }
      });

      if (queuedLeads.length === 0) {
        await prisma.campaign.updateMany({ where: { id: campaign.id, status: 'RUNNING', leads: { some: { status: 'PENDING' } } }, data: { status: 'PAUSED' } });
        await checkCampaignCompletion(campaign.id);
        continue;
      }

      const orphanIds: string[] = [];
      const uncertainIds: string[] = [];
      const CHUNK = 100;
      for (let i = 0; i < queuedLeads.length; i += CHUNK) {
        const chunk = queuedLeads.slice(i, i + CHUNK);
        const results = await Promise.all(
          chunk.map(lead => messageQueue.getJob(`${campaign.id}_${lead.id}`))
        );
        for (let idx = 0; idx < results.length; idx++) {
          const job = results[idx];
          const state = job ? await job.getState() : 'unknown';
          if (!job || state === 'completed' || state === 'failed') {
            const lead = chunk[idx];
            if (lead.status === 'SENDING' || lead.sendStartedAt) uncertainIds.push(lead.id);
            else orphanIds.push(lead.id);
          }
        }
      }

      if (orphanIds.length > 0) {
        await prisma.lead.updateMany({
          where: { id: { in: orphanIds }, status: 'QUEUED', sendStartedAt: null },
          data: { status: 'PENDING' }
        });
        console.log(`[RECOVERY] Campanha "${campaign.name}": ${orphanIds.length} leads QUEUED sem envio voltaram para PENDING.`);
      }
      if (uncertainIds.length) {
        await prisma.lead.updateMany({
          where: { id: { in: uncertainIds }, status: { in: ['QUEUED', 'SENDING'] } },
          data: { status: 'ERROR', errorMessage: 'Envio interrompido sem confirmação. Confira a conversa antes de reenviar; reenvio automático bloqueado.' },
        });
      }
      await prisma.campaign.updateMany({ where: { id: campaign.id, status: 'RUNNING', leads: { some: { status: 'PENDING' } } }, data: { status: 'PAUSED' } });
      await checkCampaignCompletion(campaign.id);
    }
  } catch (err) {
    console.error('[RECOVERY] Erro ao recuperar leads órfãos no boot:', err);
  }
}

// ── Backfill de leads SENT/DELIVERED/READ antigos para o DispatchHistory ──────────
export async function backfillDispatchHistory() {
  try {
    const sentLeads = await prisma.lead.findMany({
      where: { status: { in: ['SENT', 'DELIVERED', 'READ', 'REPLIED'] } },
      include: {
        campaign: {
          select: { workspaceId: true, name: true }
        }
      },
      orderBy: { sentAt: 'asc' }
    });

    if (sentLeads.length === 0) return;

    // Agrupa por workspaceId + normalizedPhone
    const grouped = new Map<string, {
      workspaceId: string;
      phone: string;
      companyTitle: string;
      website?: string | null;
      neighborhood?: string | null;
      firstSentAt: Date;
      lastSentAt: Date;
      lastMessage?: string | null;
      lastCampaignName?: string | null;
      sendCount: number;
    }>();

    for (const lead of sentLeads) {
      const workspaceId = lead.campaign?.workspaceId;
      if (!workspaceId) continue;
      const normalizedPhone = WhatsappManager.normalizeBrPhone(lead.phone);
      const key = `${workspaceId}_${normalizedPhone}`;
      const sentTime = lead.sentAt || lead.createdAt || new Date();

      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          workspaceId,
          phone: normalizedPhone,
          companyTitle: lead.title,
          website: lead.website,
          neighborhood: lead.neighborhood,
          firstSentAt: sentTime,
          lastSentAt: sentTime,
          lastMessage: lead.messageContent,
          lastCampaignName: lead.campaign?.name,
          sendCount: 1
        });
      } else {
        existing.sendCount += 1;
        if (sentTime >= existing.lastSentAt) {
          existing.lastSentAt = sentTime;
          existing.lastMessage = lead.messageContent;
          existing.lastCampaignName = lead.campaign?.name;
          if (lead.title) existing.companyTitle = lead.title;
          if (lead.website) existing.website = lead.website;
          if (lead.neighborhood) existing.neighborhood = lead.neighborhood;
        }
        if (sentTime < existing.firstSentAt) {
          existing.firstSentAt = sentTime;
        }
      }
    }

    let synced = 0;
    for (const item of grouped.values()) {
      await prisma.dispatchHistory.upsert({
        where: {
          workspaceId_phone: {
            workspaceId: item.workspaceId,
            phone: item.phone
          }
        },
        create: {
          workspaceId: item.workspaceId,
          phone: item.phone,
          companyTitle: item.companyTitle,
          website: item.website || null,
          neighborhood: item.neighborhood || null,
          firstSentAt: item.firstSentAt,
          lastSentAt: item.lastSentAt,
          lastMessage: item.lastMessage || null,
          lastCampaignName: item.lastCampaignName || null,
          sendCount: item.sendCount
        },
        update: {
          companyTitle: item.companyTitle,
          ...(item.website ? { website: item.website } : {}),
          ...(item.neighborhood ? { neighborhood: item.neighborhood } : {}),
          ...(item.lastMessage ? { lastMessage: item.lastMessage } : {}),
          ...(item.lastCampaignName ? { lastCampaignName: item.lastCampaignName } : {})
        }
      });
      synced++;
    }

    if (synced > 0) {
      console.log(`[BACKFILL] ${synced} empresas consolidadas com sucesso no DispatchHistory.`);
    }
  } catch (err) {
    console.error('[BACKFILL ERROR] Erro no backfill do DispatchHistory:', err);
  }
}

console.log('[BULLMQ WORKER] Worker de campanhas iniciado (concurrency=2, maxStalledCount=1).');

