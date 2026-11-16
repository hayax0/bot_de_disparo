import { jidDecode, type BaileysEventMap } from '@whiskeysockets/baileys';
import type { Prisma, WhatsappConversation } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { commercialPhone, lockCommercialContact } from './CommercialContacts';
import { messageQueue } from './queue';
import { downloadInboxMedia, observedInboxMedia } from './WhatsappInboxMedia';

export const inboxReplyJob = 'whatsapp-inbox-reply';
export const inboxJobId = (id: string) => `inbox_${id}`;

export function directWhatsappPhone(jid: string | null | undefined) {
  if (!jid) return null;
  const decoded = jidDecode(jid);
  if (decoded?.server !== 's.whatsapp.net' || !/^\d{10,15}$/.test(decoded.user)) return null;
  return commercialPhone(decoded.user);
}

export async function isInboxContactBlocked(tx: Prisma.TransactionClient, workspaceId: string, phone: string) {
  return Boolean(await tx.blacklist.findFirst({
    where: { phone, OR: [{ scope: 'GLOBAL' }, { scope: 'WORKSPACE', workspaceId }] },
    select: { id: true },
  }));
}

export function getInboxMessages(event: BaileysEventMap['messages.upsert'], now = Date.now()) {
  // Baileys usa append para mensagens emitidas localmente e recebidas durante a desconexão.
  // A data de início da conversa é conferida na persistência.
  if (event.requestId) return [];
  return event.messages.flatMap(msg => {
    const { id, remoteJid, fromMe, senderPn } = msg.key;
    if (!id || !remoteJid || !/@(?:s\.whatsapp\.net|lid)$/.test(remoteJid)) return [];
    const phone = directWhatsappPhone(remoteJid) || (!fromMe ? directWhatsappPhone(senderPn) : null);
    const media = observedInboxMedia(msg.message);
    const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? media?.text ?? '';
    const timestamp = Number(msg.messageTimestamp) * 1000;
    if ((!media && !text.trim()) || !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now + 60000) return [];
    return [{ phone, contactJid: remoteJid, providerId: id, direction: fromMe ? 'OUT' as const : 'IN' as const, text, media, createdAt: new Date(timestamp) }];
  });
}

export async function addInboxConversation(workspaceId: string, accountId: string, phone: string, contactJid: string, name?: string) {
  return prisma.$transaction(async tx => {
    await lockCommercialContact(tx, workspaceId, phone);
    if (await isInboxContactBlocked(tx, workspaceId, phone)) return null;
    return tx.whatsappConversation.upsert({
      where: { workspaceId_accountId_phone: { workspaceId, accountId, phone } },
      create: { workspaceId, accountId, phone, contactJid, name: name || null },
      update: { contactJid, ...(name ? { name } : {}) },
    });
  });
}

async function saveObservedMessage(tx: Prisma.TransactionClient, conversation: WhatsappConversation, input: {
  providerId: string; direction: 'IN' | 'OUT'; text: string; createdAt: Date;
}, attachment?: NonNullable<Awaited<ReturnType<typeof downloadInboxMedia>>>) {
  await tx.whatsappInboxMessage.upsert({
    where: { conversationId_providerId: { conversationId: conversation.id, providerId: input.providerId } },
    create: { ...input, conversationId: conversation.id, status: input.direction === 'IN' ? 'RECEIVED' : 'SENT',
      ...(attachment ? { attachment: { create: attachment } } : {}) },
    update: { status: input.direction === 'IN' ? 'RECEIVED' : 'SENT', error: null },
  });
  await tx.whatsappConversation.updateMany({
    where: { id: conversation.id, lastMessageAt: { lt: input.createdAt } },
    data: { lastMessageAt: input.createdAt },
  });
}

export async function recordInboxMessage(input: {
  workspaceId: string; accountId: string; phone: string | null; contactJid: string;
  providerId: string; direction: 'IN' | 'OUT'; text: string; createdAt: Date;
  media?: ReturnType<typeof observedInboxMedia>;
}) {
  const { workspaceId, accountId, phone } = input;
  const found = await prisma.whatsappConversation.findFirst({
    where: { workspaceId, accountId, OR: [...(phone ? [{ phone }] : []), { contactJid: input.contactJid }] },
    orderBy: { createdAt: 'asc' },
    select: { id: true, phone: true, createdAt: true },
  });
  if (!found || input.createdAt.getTime() < Math.floor(found.createdAt.getTime() / 1000) * 1000) return;
  const existing = input.media && await prisma.whatsappInboxMessage.findUnique({
    where: { conversationId_providerId: { conversationId: found.id, providerId: input.providerId } }, select: { id: true },
  });
  const attachment = input.media && !existing ? await downloadInboxMedia(input.media).catch(() => null) : null;
  const text = input.media && !attachment && !existing
    ? [input.text, `${input.media.name} indisponível no Abordai.`].filter(Boolean).join('\n')
    : input.text;
  await prisma.$transaction(async tx => {
    await lockCommercialContact(tx, workspaceId, found.phone);
    const conversation = await tx.whatsappConversation.findUnique({ where: { id: found.id } });
    if (conversation) await saveObservedMessage(tx, conversation, {
      providerId: input.providerId, direction: input.direction, text, createdAt: input.createdAt,
    }, attachment || undefined);
  });
}

type CampaignConversation = {
  workspaceId: string; accountId: string; phone: string; name: string;
  leadId: string; campaignId: string; contactJid: string;
};

export async function trackInboxCampaign(input: CampaignConversation) {
  const { workspaceId, accountId, phone, name, leadId, campaignId } = input;
  return prisma.$transaction(async tx => {
    await lockCommercialContact(tx, workspaceId, phone);
    const lead = await tx.lead.findFirst({
      where: { id: leadId, campaignId, campaign: { workspaceId } },
      select: { phone: true },
    });
    if (!lead || !commercialPhone(lead.phone)) return null;
    if (await isInboxContactBlocked(tx, workspaceId, phone)) return null;
    return tx.whatsappConversation.upsert({
      where: { workspaceId_accountId_phone: { workspaceId, accountId, phone } },
      create: { workspaceId, accountId, phone, name, leadId, campaignId, contactJid: input.contactJid },
      update: { leadId, campaignId, contactJid: input.contactJid },
    });
  });
}

export function enqueueInboxReply(id: string) {
  return messageQueue.add(inboxReplyJob, { inboxMessageId: id }, {
    jobId: inboxJobId(id), removeOnComplete: true, removeOnFail: { age: 86400 },
  });
}
