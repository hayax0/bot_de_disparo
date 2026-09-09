import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';

export class CampaignStartError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

// STARTING impede o worker de enviar enquanto o lote ainda está sendo preparado.
export async function startCampaign(db: PrismaClient, queue: Queue, id: string, workspaceId: string) {
  const campaign = await db.campaign.findFirst({ where: { id, workspaceId } });
  if (!campaign) throw new CampaignStartError('Campanha não encontrada.', 404);
  if (['RUNNING', 'STARTING'].includes(campaign.status)) throw new CampaignStartError('Esta campanha já está em execução ou iniciando.', 409);
  const session = await db.whatsappSession.findUnique({ where: { workspaceId } });
  if (session?.status !== 'CONNECTED') throw new CampaignStartError('O WhatsApp não está conectado. Conecte seu aparelho antes de iniciar os envios.', 400);
  const leads = await db.lead.findMany({
    where: { campaignId: id, status: { in: ['PENDING', 'QUEUED'] } }, orderBy: { createdAt: 'asc' },
  });
  if (!leads.length) return { message: 'Nenhum lead pendente nesta campanha.', jobsQueued: 0 };
  const claimed = await db.campaign.updateMany({
    where: { id, workspaceId, status: { notIn: ['RUNNING', 'STARTING'] } }, data: { status: 'STARTING' },
  });
  if (!claimed.count) throw new CampaignStartError('Esta campanha já está em execução ou iniciando.', 409);
  const ids = leads.map(lead => lead.id);
  try {
    await db.lead.updateMany({ where: { id: { in: ids }, status: { in: ['PENDING', 'QUEUED'] } }, data: { status: 'QUEUED' } });
    let delay = 1000;
    const jobs = leads.map((lead, index) => {
      if (index > 0) delay += (campaign.delayMin + Math.random() * (campaign.delayMax - campaign.delayMin)) * 1000;
      const job = {
        name: 'send-message', data: { leadId: lead.id, campaignId: id, workspaceId },
        opts: { jobId: `${id}_${lead.id}`, delay: Math.round(delay), attempts: 3,
          backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true, removeOnFail: false },
      };
      if ((index + 1) % 8 === 0) delay += 600000 + Math.random() * 300000;
      return job;
    });
    for (let offset = 0; offset < jobs.length; offset += 200) {
      const results = await Promise.allSettled(jobs.slice(offset, offset + 200).map(async job => {
        const existing = await queue.getJob(job.opts.jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'active') throw new Error('Um envio anterior ainda está finalizando.');
          await existing.remove(); // Reaplica a cadência também aos jobs de uma preparação interrompida.
        }
        return queue.add(job.name, job.data, job.opts);
      }));
      if (results.some(result => result.status === 'rejected')) throw new Error('Falha ao preparar a fila.');
    }
    const started = await db.campaign.updateMany({ where: { id, status: 'STARTING' }, data: { status: 'RUNNING' } });
    if (!started.count) throw new Error('Preparação interrompida.');
    return { message: 'Campanha iniciada com sucesso!', jobsQueued: jobs.length };
  } catch {
    // Enquanto STARTING/PAUSED, nenhum job deste lote pode enviar mensagens.
    await db.campaign.updateMany({ where: { id, status: 'STARTING' }, data: { status: 'PAUSED' } });
    await db.lead.updateMany({ where: { id: { in: ids }, status: 'QUEUED' }, data: { status: 'PENDING' } });
    throw new CampaignStartError('Não foi possível preparar todos os envios. A campanha foi pausada; tente iniciar novamente.', 503);
  }
}
