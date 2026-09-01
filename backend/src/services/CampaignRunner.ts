import { Worker, Job } from 'bullmq';
import { connection } from './queue';
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

  if (!lead || !campaign || campaign.status !== 'RUNNING') {
    return; // Campanha pausada ou lead excluído
  }

  // Idempotência: Se o lead já foi enviado anteriormente (ex: em retry ou concorrência), não reenvia
  if (lead.status === 'SENT') {
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
      
      const isUnrecoverable = errMsg.includes('não possui conta ativa') || 
                              errMsg.includes('telefone fixo') || 
                              errMsg.includes('No LID') || 
                              errMsg.includes('inválido') || 
                              errMsg.includes('LID indisponível');

      if (isUnrecoverable || isFinalAttempt) {
        // Marca erro definitivo e não bloqueia a fila com retries inúteis
        await prisma.lead.update({
          where: { id: leadId },
          data: { 
            status: 'ERROR',
            attempts: job.attemptsMade,
            errorMessage: isUnrecoverable 
              ? errMsg 
              : (error?.message || 'Falha após esgotar tentativas de envio no WhatsApp')
          }
        });
        // Se for erro recuperável na última tentativa, lança para notificar o BullMQ
        if (!isUnrecoverable) {
          throw error;
        }
      } else {
        // Falha temporária recuperável (ex: oscilação de rede): reagenda via BullMQ
        await prisma.lead.update({
          where: { id: leadId },
          data: { 
            attempts: job.attemptsMade,
            errorMessage: `Tentativa ${job.attemptsMade}/${maxAttempts} falhou: ${errMsg} (reagendando...)`
          }
        });
        throw error;
      }
    }
  } finally {
    await checkCampaignCompletion(campaignId);
  }

}, { connection, concurrency: 5 }); // 5 workers paralelos no máximo

campaignWorker.on('failed', async (job, err) => {
  if (job) {
    console.error(`[JOB FAILED] Job ${job.id} falhou definitivamente após tentativas:`, err);
    try {
      const { leadId, campaignId } = job.data;
      if (leadId) {
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            status: 'ERROR',
            errorMessage: err?.message || 'Falha definitiva após todas as tentativas'
          }
        });
      }
      if (campaignId) {
        await checkCampaignCompletion(campaignId);
      }
    } catch (dbErr) {
      console.error('Erro ao registrar falha definitiva do lead:', dbErr);
    }
  }
});


