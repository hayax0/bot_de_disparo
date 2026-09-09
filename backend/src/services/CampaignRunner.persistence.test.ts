import { mockMethod } from '../test-support/mockMethod';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { WhatsappManager } from './WhatsappManager';

// Substitui só a infraestrutura BullMQ. O processor e a recuperação são os de produção.
let processor: (job: any, token?: string) => Promise<void>;
const bullPath = require.resolve('bullmq');
const originalBull = require('bullmq');
const bullCache = require.cache[bullPath]!;
require.cache[bullPath] = { ...bullCache, exports: { ...originalBull, Worker: class {
  constructor(_name: string, process: typeof processor) { processor = process; }
  on() { return this; }
} } };
const queuePath = require.resolve('./queue');
require.cache[queuePath] = { id: queuePath, filename: queuePath, loaded: true,
  exports: { createConnection: () => ({}), messageQueue: { getJob: async () => null } } } as any;
const { recoverOrphanedLeads } = require('./CampaignRunner');
require.cache[bullPath] = bullCache;

function fixture(t: any) {
  const lead: any = { id: 'l', campaignId: 'c', title: 'Empresa', phone: '5511999999999', status: 'QUEUED', sendStartedAt: null };
  const campaign: any = { id: 'c', workspaceId: 'w', name: 'Campanha', status: 'RUNNING', messageSemSite: 'Olá {nome}',
    workspace: { user: { role: 'ADMIN' } } };
  let dbDown = false;
  const matches = (where: any) => {
    if (where.sendStartedAt === null && lead.sendStartedAt !== null) return false;
    if (where.status?.in && !where.status.in.includes(lead.status)) return false;
    if (where.status?.notIn?.includes(lead.status)) return false;
    if (typeof where.status === 'string' && where.status !== lead.status) return false;
    return true;
  };
  mockMethod(t, prisma.lead, 'findUnique', async () => ({ ...lead }));
  mockMethod(t, prisma.lead, 'findMany', async () => [{ ...lead }]);
  mockMethod(t, prisma.lead, 'count', async () => ['PENDING', 'QUEUED', 'SENDING'].includes(lead.status) ? 1 : 0);
  mockMethod(t, prisma.lead, 'updateMany', async ({ where, data }: any) => {
    if (dbDown) throw new Error('database unavailable');
    if (!matches(where)) return { count: 0 };
    Object.assign(lead, data);
    return { count: 1 };
  });
  mockMethod(t, prisma.lead, 'update', async ({ data }: any) => {
    if (dbDown) throw new Error('database unavailable');
    Object.assign(lead, data); return lead;
  });
  mockMethod(t, prisma.campaign, 'findUnique', async () => campaign);
  mockMethod(t, prisma.campaign, 'findMany', async () => [campaign]);
  mockMethod(t, prisma.campaign, 'updateMany', async () => ({ count: 0 }));
  mockMethod(t, prisma.campaign, 'update', async () => campaign);
  mockMethod(t, prisma.dispatchHistory, 'upsert', async () => {
    if (dbDown) throw new Error('database unavailable');
    return {};
  });
  mockMethod(t, prisma, '$transaction', async (operations: any) => Promise.all(operations));
  const job = { data: { leadId: 'l', campaignId: 'c', workspaceId: 'w' }, attemptsMade: 0, opts: { attempts: 3 } };
  return { lead, campaign, job, setDbDown: (value: boolean) => { dbDown = value; } };
}

test('Worker: envio + falha no banco + retry + recovery não duplicam mensagem', async t => {
  const f = fixture(t);
  let sends = 0;
  mockMethod(t, WhatsappManager, 'sendMessage', async (_workspace, _phone, _message, beforeSend) => {
    await beforeSend!('outgoing-id');
    assert.equal(f.lead.wppMessageId, 'outgoing-id');
    assert.ok(f.lead.sendStartedAt instanceof Date);
    sends++;
    f.setDbDown(true);
    return { messageId: 'outgoing-id', jid: 'test-jid' };
  });
  await assert.rejects(processor(f.job), /database unavailable/);
  assert.equal(f.lead.status, 'SENDING');
  f.setDbDown(false);
  await processor({ ...f.job, attemptsMade: 1 });
  assert.equal(f.lead.status, 'ERROR');
  assert.match(f.lead.errorMessage, /reenvio automático bloqueado/);
  await recoverOrphanedLeads();
  await processor({ ...f.job, attemptsMade: 2 });
  assert.equal(sends, 1);
});

test('Worker: consulta temporariamente indisponível mantém QUEUED até última tentativa', async t => {
  const f = fixture(t);
  mockMethod(t, WhatsappManager, 'sendMessage', async () => { throw new Error('Consulta ao WhatsApp indisponível temporariamente.'); });
  await assert.rejects(processor(f.job));
  assert.equal(f.lead.status, 'QUEUED');
  assert.equal(f.lead.sendStartedAt, null);
  await assert.rejects(processor({ ...f.job, attemptsMade: 2 }));
  assert.equal(f.lead.status, 'ERROR');
  assert.equal(f.lead.attempts, 3);
});

test('Worker: ACK READ antes do commit não volta para SENT', async t => {
  const f = fixture(t);
  mockMethod(t, WhatsappManager, 'sendMessage', async (_workspace, _phone, _message, beforeSend) => {
    await beforeSend!('early-ack-id');
    f.lead.status = 'READ';
    return { messageId: 'early-ack-id', jid: 'test-jid' };
  });
  await processor(f.job);
  assert.equal(f.lead.status, 'READ');
});

test('Recovery: SENDING órfão não volta para PENDING; QUEUED sem envio pode retomar', async t => {
  const f = fixture(t);
  f.lead.status = 'SENDING';
  await recoverOrphanedLeads();
  assert.equal(f.lead.status, 'ERROR');
  f.lead.status = 'QUEUED';
  await recoverOrphanedLeads();
  assert.equal(f.lead.status, 'PENDING');
});

test('Worker: preparação de campanha adia job sem consumir tentativa nem enviar', async t => {
  const f = fixture(t);
  f.campaign.status = 'STARTING';
  let delayed = false;
  const send = mockMethod(t, WhatsappManager, 'sendMessage', async () => { throw new Error('Não deveria enviar'); });
  await assert.rejects(processor({ ...f.job, moveToDelayed: async () => { delayed = true; } }, 'lock'));
  assert.equal(delayed, true);
  assert.equal(send.mock.callCount(), 0);
  assert.equal(f.lead.status, 'QUEUED');
});
