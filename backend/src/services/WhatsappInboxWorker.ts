import { prisma } from '../lib/prisma';
import { lockCommercialContact } from './CommercialContacts';
import { isSubscriptionActive } from './SubscriptionManager';
import { WhatsappManager } from './WhatsappManager';
import { enqueueInboxReply, inboxJobId, isInboxContactBlocked } from './WhatsappInbox';
import { messageQueue } from './queue';
import { outgoingInboxMedia } from './WhatsappInboxMedia';

export async function failInboxReply(id: string, reason?: string) {
  await prisma.whatsappInboxMessage.updateMany({
    where: { id, status: 'SENDING' },
    data: { status: 'UNCERTAIN', error: 'Confira a conversa antes de reenviar. O WhatsApp pode ter recebido a mensagem.' },
  });
  await prisma.whatsappInboxMessage.updateMany({
    where: { id, status: 'QUEUED' },
    data: { status: 'FAILED', error: reason || 'Não foi possível enviar a mensagem. Tente novamente.' },
  });
}

export async function processInboxReply(id: string) {
  const message = await prisma.whatsappInboxMessage.findUnique({
    where: { id },
    include: { conversation: { include: { workspace: { include: { user: true } } } } },
  });
  if (!message || (message.status !== 'QUEUED' && message.status !== 'SENDING')) return;
  if (message.status === 'SENDING') return failInboxReply(id);
  const { workspaceId, accountId, phone } = message.conversation;
  try {
    if (!isSubscriptionActive(message.conversation.workspace.user)) throw new Error('A assinatura precisa estar ativa para responder.');
    const attachment = await prisma.whatsappInboxAttachment.findUnique({ where: { messageId: id } });
    const content = attachment ? outgoingInboxMedia(attachment, message.text) : message.text;
    await WhatsappManager.sendMessage(workspaceId, phone, content, async (providerId, contactJid) => {
      await prisma.$transaction(async tx => {
        await lockCommercialContact(tx, workspaceId, phone);
        if (await isInboxContactBlocked(tx, workspaceId, phone)) throw new Error('Este contato está na lista de bloqueio.');
        const claim = await tx.whatsappInboxMessage.updateMany({
          where: { id, status: 'QUEUED' },
          data: { status: 'SENDING', providerId },
        });
        if (claim.count !== 1) throw new Error('A mensagem já foi processada.');
        await tx.whatsappConversation.update({ where: { id: message.conversationId }, data: { contactJid } });
      });
    }, accountId);
    await prisma.whatsappInboxMessage.updateMany({
      where: { id, status: { in: ['SENDING', 'UNCERTAIN'] } }, data: { status: 'SENT', error: null },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    const safeMessages = [
      'A assinatura precisa estar ativa para responder.',
      'Este contato está na lista de bloqueio.',
      'O número conectado mudou.',
      'WhatsApp não está conectado no momento.',
      'Número não possui conta ativa no WhatsApp (ou é telefone fixo)',
    ];
    await failInboxReply(id, safeMessages.includes(detail) ? detail : undefined);
  }
}

export async function recoverInboxReplies() {
  await prisma.whatsappInboxMessage.updateMany({
    where: { status: 'SENDING' },
    data: { status: 'UNCERTAIN', error: 'Confira a conversa antes de reenviar. O WhatsApp pode ter recebido a mensagem.' },
  });
  const queued = await prisma.whatsappInboxMessage.findMany({ where: { status: 'QUEUED' }, select: { id: true } });
  for (const { id } of queued) {
    const job = await messageQueue.getJob(inboxJobId(id));
    if (!job) await enqueueInboxReply(id);
    else if (await job.isFailed()) await failInboxReply(id);
  }
}
