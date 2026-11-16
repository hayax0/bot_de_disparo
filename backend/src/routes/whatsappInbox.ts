import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireActiveSubscription } from '../middlewares/auth';
import { whatsappInboxWriteLimiter } from '../middlewares/rateLimiter';
import { commercialPhone, lockCommercialContact } from '../services/CommercialContacts';
import { addInboxConversation, enqueueInboxReply, isInboxContactBlocked } from '../services/WhatsappInbox';
import { WhatsappManager } from '../services/WhatsappManager';
import { InboxMediaError, inboxMediaFields, inboxMediaLimit, prepareInboxUpload } from '../services/WhatsappInboxMedia';

export const whatsappInboxRouter = Router();
whatsappInboxRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const listQuery = z.object({ search: z.string().trim().max(100).default(''), page: z.coerce.number().int().min(1).max(10000).default(1) });
const addContact = z.object({ phone: z.string().trim().regex(/^\+?[\d(). -]{10,30}$/), name: z.string().trim().max(100).optional(), accountId: z.string().regex(/^\d{10,15}$/) });
const newReply = z.object({ text: z.string().trim().max(4000).default(''), requestId: z.uuid(), voice: z.literal('true').optional() });
const messageQuery = z.object({ before: z.uuid().optional() });
const publicMessage = { id: true, direction: true, status: true, text: true, error: true, createdAt: true, attachment: { select: inboxMediaFields } } as const;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: inboxMediaLimit, files: 1, fields: 3, fieldSize: 20000, parts: 5 } }).single('attachment');
let activeUploads = 0;

async function accountFor(workspaceId: string) {
  const session = await prisma.whatsappSession.findUnique({ where: { workspaceId }, select: { accountId: true } });
  return session?.accountId || null;
}

async function conversationFor(workspaceId: string, id: string) {
  const accountId = await accountFor(workspaceId);
  return accountId ? prisma.whatsappConversation.findFirst({ where: { id, workspaceId, accountId } }) : null;
}

whatsappInboxRouter.get('/conversations', async (req, res) => {
  const params = listQuery.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: 'Busca inválida.' }); return; }
  const workspaceId = req.user!.workspaceId;
  const accountId = await accountFor(workspaceId);
  if (!accountId) { res.json({ accountId: null, conversations: [], hasMore: false }); return; }
  const { search, page } = params.data;
  const phone = search.replace(/\D/g, '');
  const rows = await prisma.whatsappConversation.findMany({
    where: { workspaceId, accountId, ...(search ? {
      OR: [{ name: { contains: search, mode: 'insensitive' } }, ...(phone ? [{ phone: { contains: phone } }] : [])],
    } : {}) },
    select: {
      id: true, name: true, phone: true, lastMessageAt: true,
      messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { text: true, direction: true, attachment: { select: inboxMediaFields } } },
    },
    orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    take: 31,
    skip: (page - 1) * 30,
  });
  res.json({ accountId, conversations: rows.slice(0, 30), hasMore: rows.length > 30 });
});

whatsappInboxRouter.post('/conversations', requireActiveSubscription, whatsappInboxWriteLimiter, async (req, res) => {
  const input = addContact.safeParse(req.body);
  const phone = input.success && commercialPhone(input.data.phone);
  if (!input.success || !phone) { res.status(400).json({ error: 'Informe um número de WhatsApp válido com DDD.' }); return; }
  const workspaceId = req.user!.workspaceId;
  const accountId = await accountFor(workspaceId);
  if (!accountId || input.data.accountId !== accountId || (await WhatsappManager.getStatus(workspaceId)).status !== 'CONNECTED') {
    res.status(409).json({ error: 'Confira o número conectado antes de adicionar o contato.' }); return;
  }
  if (phone === accountId) { res.status(400).json({ error: 'Informe o número do cliente.' }); return; }
  let jid: string | null;
  try { jid = await WhatsappManager.resolveInboxContact(workspaceId, accountId, phone); }
  catch { res.status(503).json({ error: 'Não foi possível consultar o número no WhatsApp. Tente novamente.' }); return; }
  if (!jid) { res.status(422).json({ error: 'Não encontramos esse número no WhatsApp.' }); return; }
  const conversation = await addInboxConversation(workspaceId, accountId, phone, jid, input.data.name);
  if (!conversation) { res.status(403).json({ error: 'Este contato está na lista de bloqueio.' }); return; }
  res.status(201).json({ id: conversation.id });
});

whatsappInboxRouter.get('/conversations/:id', async (req, res) => {
  const params = messageQuery.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: 'Histórico inválido.' }); return; }
  const workspaceId = req.user!.workspaceId;
  const conversation = typeof req.params.id === 'string' ? await conversationFor(workspaceId, req.params.id) : null;
  if (!conversation) { res.status(404).json({ error: 'Conversa não encontrada.' }); return; }

  const { before } = params.data;
  if (before && !await prisma.whatsappInboxMessage.findFirst({ where: { id: before, conversationId: conversation.id }, select: { id: true } })) {
    res.status(404).json({ error: 'Mensagem não encontrada.' }); return;
  }
  const [messages, lead, commercial, blocked] = await Promise.all([
    prisma.whatsappInboxMessage.findMany({
      where: { conversationId: conversation.id }, select: publicMessage,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    }),
    conversation.leadId && conversation.campaignId ? prisma.lead.findFirst({
      where: { id: conversation.leadId, campaignId: conversation.campaignId, campaign: { workspaceId } },
      select: { id: true, title: true, phone: true, campaign: { select: { id: true, name: true } } },
    }) : null,
    prisma.commercialContact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone: conversation.phone } }, select: { nextContactAt: true },
    }),
    isInboxContactBlocked(prisma, workspaceId, conversation.phone),
  ]);
  res.json({
    conversation: { id: conversation.id, name: conversation.name, phone: conversation.phone },
    messages: messages.slice(0, 50).reverse(), hasOlder: messages.length > 50,
    lead, nextContactAt: commercial?.nextContactAt?.toISOString().slice(0, 10) || null, blocked,
  });
});

whatsappInboxRouter.get('/conversations/:id/messages/:messageId/attachment', async (req, res) => {
  const conversation = await conversationFor(req.user!.workspaceId, req.params.id);
  const media = conversation && await prisma.whatsappInboxAttachment.findFirst({
    where: { messageId: req.params.messageId, message: { conversationId: conversation.id } },
    select: { data: true, name: true, mimeType: true },
  });
  if (!media) { res.status(404).json({ error: 'Arquivo não encontrado.' }); return; }
  res.attachment(media.name).set('Content-Type', media.mimeType).set('X-Content-Type-Options', 'nosniff').send(media.data);
});

whatsappInboxRouter.post('/conversations/:id/messages', requireActiveSubscription, whatsappInboxWriteLimiter, (req, res, next) => {
  if (!req.is('multipart/form-data')) { next(); return; }
  if (activeUploads >= 4) { res.status(503).json({ error: 'Há vários anexos em processamento. Tente novamente em instantes.' }); return; }
  activeUploads++;
  res.once('close', () => { activeUploads--; });
  upload(req, res, error => {
    if (error) {
      const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
      res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'O arquivo pode ter até 8 MB.' : 'Não foi possível ler o anexo.' });
      return;
    }
    next();
  });
}, async (req, res) => {
  const input = newReply.safeParse(req.body);
  if (!input.success || (!input.data.text && !req.file) || (input.data.voice && !req.file)) {
    res.status(400).json({ error: 'Escreva uma mensagem de até 4.000 caracteres ou selecione um arquivo.' }); return;
  }
  const workspaceId = req.user!.workspaceId;
  const conversation = typeof req.params.id === 'string' ? await conversationFor(workspaceId, req.params.id) : null;
  if (!conversation) { res.status(404).json({ error: 'Conversa não encontrada.' }); return; }
  if ((await WhatsappManager.getStatus(workspaceId)).status !== 'CONNECTED') {
    res.status(409).json({ error: 'Reconecte o WhatsApp para responder.' }); return;
  }

  const { text, requestId } = input.data;
  let attachment: Awaited<ReturnType<typeof prepareInboxUpload>> | undefined;
  if (req.file) {
    try { attachment = await prepareInboxUpload(req.file, Boolean(input.data.voice)); }
    catch (error) {
      if (!(error instanceof InboxMediaError)) throw error;
      res.status(error.status).json({ error: error.message }); return;
    }
    if (text && (attachment.kind === 'VOICE' || attachment.kind === 'AUDIO')) {
      res.status(400).json({ error: 'Envie o texto em uma mensagem separada do áudio.' }); return;
    }
  }
  const reply = await prisma.$transaction(async tx => {
    await lockCommercialContact(tx, workspaceId, conversation.phone);
    const existing = await tx.whatsappInboxMessage.findUnique({
      where: { conversationId_requestId: { conversationId: conversation.id, requestId } },
      select: { ...publicMessage, attachment: { select: { ...inboxMediaFields, digest: true } } },
    });
    if (existing) return existing;
    if (!await tx.whatsappConversation.findUnique({ where: { id: conversation.id }, select: { id: true } })) return null;
    if (await isInboxContactBlocked(tx, workspaceId, conversation.phone)) return null;
    const message = await tx.whatsappInboxMessage.create({
      data: { conversationId: conversation.id, direction: 'OUT', status: 'QUEUED', text, requestId,
        ...(attachment ? { attachment: { create: attachment } } : {}) },
      select: { ...publicMessage, attachment: { select: { ...inboxMediaFields, digest: true } } },
    });
    await tx.whatsappConversation.updateMany({
      where: { id: conversation.id, lastMessageAt: { lt: message.createdAt } }, data: { lastMessageAt: message.createdAt },
    });
    return message;
  });
  if (!reply) { res.status(403).json({ error: 'Este contato não está disponível para envio.' }); return; }
  if (reply.text !== text || reply.attachment?.digest !== attachment?.digest) {
    res.status(409).json({ error: 'A tentativa já está vinculada a outra mensagem.' }); return;
  }
  if (reply.status === 'QUEUED') {
    try { await enqueueInboxReply(reply.id); }
    catch { res.status(503).json({ error: 'A fila não confirmou a mensagem. Tente novamente com o mesmo texto.' }); return; }
  }
  const media = reply.attachment;
  res.status(202).json({ ...reply, attachment: media ? { kind: media.kind, name: media.name, mimeType: media.mimeType, size: media.size } : null });
});
