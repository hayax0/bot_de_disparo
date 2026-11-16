import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { ENV } from '../config/env';
import { prisma } from '../lib/prisma';
import whatsappRouter from '../routes/whatsapp';
import { AnonymizationService } from './AnonymizationService';
import { directWhatsappPhone, getInboxMessages, inboxJobId, recordInboxMessage, trackInboxCampaign } from './WhatsappInbox';
import { processInboxReply } from './WhatsappInboxWorker';
import { WhatsappManager } from './WhatsappManager';
import { messageQueue } from './queue';
import { outgoingInboxMedia } from './WhatsappInboxMedia';

test('WhatsApp Inbox: PostgreSQL, escopo da conta, histórico e resposta idempotente', async t => {
  const [database] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.equal(database!.name, 'bot_prospeccao_test');

  const users = await Promise.all([0, 1].map(index => prisma.user.create({
    data: { email: `inbox-${randomUUID()}@test.local`, password: 'hash', emailVerifiedAt: new Date(),
      subscriptionStatus: 'LIFETIME', workspaces: { create: { name: `Inbox ${index}` } } },
    include: { workspaces: true },
  })));
  const workspaceId = users[0]!.workspaces[0]!.id;
  const accountId = '5521999110001';
  const phone = '5521999110002';
  await prisma.whatsappSession.create({ data: { workspaceId, accountId, status: 'CONNECTED' } });
  const campaign = await prisma.campaign.create({ data: { workspaceId, name: 'Prospecção local' } });
  const lead = await prisma.lead.create({ data: { campaignId: campaign.id, title: 'Contato da campanha', phone } });
  const app = express();
  app.use(express.json());
  app.use('/whatsapp', whatsappRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await prisma.$disconnect();
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/whatsapp/inbox/conversations`;
  function request(path = '', method = 'GET', body?: unknown, userIndex = 0) {
    const token = jwt.sign({ userId: users[userIndex]!.id, authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' });
    return fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  }

  const contactJid = `${phone}@s.whatsapp.net`;
  const observed = { workspaceId, accountId, phone, contactJid, direction: 'IN' as const, text: 'Quero mais informações.', createdAt: new Date() };
  await recordInboxMessage({ ...observed, providerId: 'untracked' });
  assert.deepEqual((await (await request()).json()).conversations, []);
  const thread = await trackInboxCampaign({ workspaceId, accountId, phone, name: lead.title, leadId: lead.id, campaignId: campaign.id, contactJid });
  assert.ok(thread);
  const path = `/${thread.id}`;
  const fresh = { ...observed, createdAt: new Date() };
  await recordInboxMessage({ ...fresh, providerId: 'old', createdAt: new Date(Date.now() - 60_000) });
  await Promise.all([recordInboxMessage({ ...fresh, providerId: 'received' }), recordInboxMessage({ ...fresh, providerId: 'received' })]);
  await recordInboxMessage({ ...fresh, providerId: 'campaign', direction: 'OUT', text: 'Olá! Posso explicar a proposta?' });
  assert.equal(directWhatsappPhone('12345678901@g.us'), null);
  assert.equal(directWhatsappPhone('12345678901@broadcast'), null);
  assert.equal(directWhatsappPhone('12345678901@lid'), null);
  const live = { key: { id: 'mobile', remoteJid: contactJid, fromMe: true }, message: { conversation: 'Enviada do celular' }, messageTimestamp: Math.floor(Date.now() / 1000) };
  const event = { type: 'notify' as const, messages: [live,
    { ...live, key: { ...live.key, remoteJid: '12345678901@g.us' } },
    { ...live, key: { ...live.key, remoteJid: 'status@broadcast' } },
    { ...live, key: { ...live.key, remoteJid: '12345678901@newsletter' } },
  ] };
  assert.deepEqual(getInboxMessages(event).map(message => message.direction), ['OUT']);
  assert.deepEqual(getInboxMessages({ ...event, type: 'append' }).map(message => message.direction), ['OUT']);
  assert.deepEqual(getInboxMessages({ ...event, requestId: 'history-sync' }), []);

  const chat = await (await request(path)).json();
  assert.equal(chat.lead.campaign.name, campaign.name);
  assert.deepEqual(chat.messages.map((message: { text: string }) => message.text).sort(), ['Olá! Posso explicar a proposta?', observed.text].sort());
  assert.equal((await request(path, 'GET', undefined, 1)).status, 404);
  const photo = Buffer.from([255, 216, 255, 217]);
  const avatar = t.mock.method(WhatsappManager, 'getInboxProfilePhoto', async (
    workspace: string, account: string, target: { phone: string; contactJid: string | null } | 'self',
  ) => {
    assert.equal(workspace, workspaceId);
    assert.equal(account, accountId);
    return target === 'self' ? null : { data: photo, mimeType: 'image/jpeg' as const };
  });
  const contactPhoto = await request(path + '/avatar/contact');
  assert.equal(contactPhoto.status, 200);
  assert.equal(contactPhoto.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await contactPhoto.arrayBuffer()), photo);
  assert.equal((await request(path + '/avatar/self')).status, 204);
  assert.equal((await request(path + '/avatar/contact', 'GET', undefined, 1)).status, 404);
  assert.equal(avatar.mock.callCount(), 2);

  const queueName = `inbox-test-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL || `redis://${ENV.REDIS_HOST || '127.0.0.1'}:${ENV.REDIS_PORT || 6379}`;
  const connection = () => new IORedis(redisUrl, { maxRetriesPerRequest: null, connectTimeout: 3000 });
  const connections = [connection(), connection(), connection()] as const;
  const queue = new Queue(queueName, { connection: connections[0] });
  const events = new QueueEvents(queueName, { connection: connections[1] });
  const worker = new Worker(queueName, job => processInboxReply(job.data.inboxMessageId), { connection: connections[2], autorun: false });
  t.after(async () => {
    try {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    } finally {
      for (const client of connections) client.disconnect();
    }
  });
  t.mock.method(messageQueue, 'add', queue.add.bind(queue));
  t.mock.method(WhatsappManager, 'getStatus', async () => ({ status: 'CONNECTED', qrCode: null }));
  const reply = { requestId: randomUUID(), text: 'Claro, vamos conversar.' };
  const [first, second] = await Promise.all([
    request(path + '/messages', 'POST', reply), request(path + '/messages', 'POST', reply),
  ]);
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  const queued = await first.json();
  assert.equal((await second.json()).id, queued.id);
  assert.equal((await request(path + '/messages', 'POST', { ...reply, text: 'Outro texto' })).status, 409);
  const send = t.mock.method(WhatsappManager, 'sendMessage', async (
    workspace: string, destination: string, text: string, before: (id: string, jid: string) => Promise<void>, expectedAccount: string,
  ) => {
    assert.deepEqual([workspace, destination, text, expectedAccount], [workspaceId, phone, reply.text, accountId]);
    await before('manual', contactJid);
    await recordInboxMessage({ ...fresh, providerId: 'manual', direction: 'OUT', text });
    return { messageId: 'manual', jid: contactJid, accountId };
  });
  const job = await queue.getJob(inboxJobId(queued.id));
  assert.ok(job);
  const finished = job.waitUntilFinished(events, 8000);
  void worker.run();
  await finished;
  await processInboxReply(queued.id);
  assert.equal(send.mock.callCount(), 1);
  assert.equal((await prisma.whatsappInboxMessage.findUniqueOrThrow({ where: { id: queued.id } })).status, 'SENT');
  assert.equal(await prisma.whatsappInboxMessage.count({ where: { conversationId: thread.id } }), 3);
  assert.deepEqual(await WhatsappManager.recoverMessageContent({ id: 'manual', remoteJid: contactJid, fromMe: true }, workspaceId, accountId),
    { extendedTextMessage: { text: reply.text } });
  assert.equal(await WhatsappManager.recoverMessageContent({ id: 'manual', remoteJid: contactJid, fromMe: true }, workspaceId, '5521999110010'), undefined);

  const fileBytes = Buffer.from('Documento de teste');
  const fileRequestId = randomUUID();
  const sendAttachment = (data: Buffer) => {
    const form = new FormData();
    form.append('requestId', fileRequestId);
    form.append('attachment', new Blob([new Uint8Array(data)], { type: 'text/html' }), 'proposta.txt');
    return fetch(base + path + '/messages', { method: 'POST', body: form,
      headers: { Authorization: `Bearer ${jwt.sign({ userId: users[0]!.id, authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' })}` },
    });
  };
  t.mock.method(WhatsappManager, 'sendMessage', async (
    workspace: string, destination: string, content: unknown, before: (id: string, jid: string) => Promise<void>, expectedAccount: string,
  ) => {
    assert.deepEqual([workspace, destination, expectedAccount], [workspaceId, phone, accountId]);
    assert.deepEqual(content, { document: fileBytes, mimetype: 'application/octet-stream', fileName: 'proposta.txt' });
    await before('document-provider', contactJid);
    return { messageId: 'document-provider', jid: contactJid, accountId };
  });
  const fileSent = once(worker, 'completed', { signal: AbortSignal.timeout(8000) });
  const fileResponse = await sendAttachment(fileBytes);
  assert.equal(fileResponse.status, 202);
  const fileMessage = await fileResponse.json();
  const [fileJob] = await fileSent;
  assert.equal(fileJob.id, inboxJobId(fileMessage.id));
  assert.equal((await prisma.whatsappInboxMessage.findUniqueOrThrow({ where: { id: fileMessage.id } })).status, 'SENT');
  assert.deepEqual(fileMessage.attachment, {
    name: 'proposta.txt', kind: 'DOCUMENT', mimeType: 'application/octet-stream', size: fileBytes.length,
  });
  const filePath = path + '/messages/' + fileMessage.id + '/attachment';
  const retrieved = await request(filePath);
  assert.equal(retrieved.status, 200);
  assert.equal(retrieved.headers.get('content-type'), 'application/octet-stream');
  assert.match(retrieved.headers.get('content-disposition') || '', /^attachment/);
  assert.deepEqual(Buffer.from(await retrieved.arrayBuffer()), fileBytes);
  assert.equal((await request(filePath, 'GET', undefined, 1)).status, 404);
  assert.equal((await sendAttachment(Buffer.from('outro documento'))).status, 409);
  assert.deepEqual(outgoingInboxMedia({ kind: 'VOICE', name: 'gravacao.ogg', mimeType: 'audio/ogg', data: fileBytes }, ''), {
    audio: fileBytes, ptt: true, mimetype: 'audio/ogg; codecs=opus',
  });

  await prisma.whatsappSession.update({ where: { workspaceId }, data: { accountId: '5521999110003' } });
  assert.equal((await request(path)).status, 404);
  assert.equal((await request('', 'POST', { phone, accountId })).status, 409);
  t.mock.method(WhatsappManager, 'resolveInboxContact', async () => '5521999110004@s.whatsapp.net');
  const added = await request('', 'POST', { phone: '21999110004', name: 'Contato externo', accountId: '5521999110003' });
  assert.equal(added.status, 201);
  assert.equal((await (await request()).json()).conversations.length, 1);

  await AnonymizationService.anonymizeContact({ workspaceId, phone });
  assert.equal(await prisma.whatsappInboxMessage.count({ where: { conversationId: thread.id } }), 0);
  assert.equal(await prisma.whatsappInboxAttachment.count({ where: { messageId: fileMessage.id } }), 0);
  await recordInboxMessage({ ...fresh, providerId: 'after-anonymization' });
  assert.equal(await prisma.whatsappConversation.count({ where: { workspaceId, phone } }), 0);
});
