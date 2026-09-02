import { Worker, Job } from 'bullmq';
import { createConnection } from './queue';
import { prisma } from '../lib/prisma';
import { WhatsappManager } from './WhatsappManager';
import { gerarProposta, temWebsiteValido, processarSpintax, formatarNomeEmpresa } from './ProposalEngine';

export { gerarProposta, temWebsiteValido, processarSpintax, formatarNomeEmpresa };

// Helper para verificar se a campanha concluiu todos os leads
async function checkCampaignCompletion(campaignId: string) {
  try {
    const pendingCount = await prisma.lead.count({
      where: {
        campaignId,
        status: { in: ['PENDING', 'QUEUED'] }
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
export const campaignWorker = new Worker('message-queue', async (job: Job) => {
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

  // Campanha pausada/excluída: devolve o lead para PENDING para ser retomado depois
  if (campaign.status !== 'RUNNING') {
    if (lead.status === 'QUEUED') {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: 'PENDING' }
      }).catch(() => {});
    }
    return;
  }

  // Idempotência: Se o lead já foi enviado, não reenvia
  if (lead.status === 'SENT' || lead.status === 'REPLIED') {
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

  let sentSuccessfully = false;
  try {
    await WhatsappManager.sendMessage(workspaceId, lead.phone, message);
    sentSuccessfully = true;

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        messageContent: message,
        errorMessage: null
      }
    });
  } catch (error: any) {
    console.error(`[WORKER ERROR] Falha ao enviar para o lead ${leadId} (${lead.phone}):`, error?.message || error);

    // Se a mensagem já foi enviada no WhatsApp mas o banco falhou, não relança para evitar duplicação
    if (!sentSuccessfully) {
      const maxAttempts = job.opts.attempts || 1;
      const isFinalAttempt = job.attemptsMade >= maxAttempts;
      const errMsg = error?.message || String(error);
      const unrecoverable = isUnrecoverableError(errMsg);

      if (unrecoverable || isFinalAttempt) {
        // Marca erro definitivo e não bloqueia a fila com retries inúteis
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            status: 'ERROR',
            attempts: job.attemptsMade,
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
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            attempts: job.attemptsMade,
            status: 'QUEUED',
            errorMessage: `Tentativa ${job.attemptsMade}/${maxAttempts} falhou: ${errMsg} (reagendando...)`
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
      if (lead && lead.status !== 'SENT' && lead.status !== 'REPLIED' && lead.status !== 'ERROR') {
        await prisma.lead.update({
          where: { id: leadId },
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

console.log('[BULLMQ WORKER] Worker de campanhas iniciado (concurrency=2, maxStalledCount=1).');
