import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { createSendReview, claimReviewedBatch } from './CampaignSendReview';
import { startCampaign } from './CampaignStarter';

test('Revisão de envio: seleção, texto exato, isolamento e concorrência no PostgreSQL real', async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const [database] = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  assert.equal(database.db, 'bot_prospeccao_test');
  const user = await prisma.user.create({ data: { email: `review-${crypto.randomUUID()}@test.local`, password: 'hash', name: 'Ana', role: 'ADMIN', subscriptionStatus: 'LIFETIME' } });
  const workspace = await prisma.workspace.create({ data: { userId: user.id, name: 'Agência Alfa' } });
  await prisma.whatsappSession.create({ data: { workspaceId: workspace.id, status: 'CONNECTED' } });
  t.after(async () => { await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect(); });
  async function fixture() {
    const campaign = await prisma.campaign.create({ data: { workspaceId: workspace.id, name: 'Revisão', messageSemSite: '{Olá|Oi} {nome}! Sou {meuNome} da {minhaEmpresa}. Você atende em {bairro}?' } });
    const leads = await Promise.all([0, 1, 2].map(i => prisma.lead.create({ data: { campaignId: campaign.id, title: `Empresa ${i}`, phone: `552199999000${i}`, neighborhood: 'Centro' } })));
    const review = await createSendReview(prisma, campaign.id, workspace.id, false);
    return { campaign, leads, review };
  }
  await t.test('Só os contatos selecionados entram na fila com o texto exato aprovado', async () => {
    const { campaign, leads, review } = await fixture();
    assert.equal(review.aiCredits, 0);
    assert.ok(review.leads.every(lead => !lead.message.includes('{')));
    const jobs: any[] = [];
    const queue: any = { getJob: async () => null, add: async (...args: any[]) => jobs.push(args) };
    await startCampaign(prisma, queue, campaign.id, workspace.id, false, { token: review.token, leadIds: [leads[0].id] });
    const saved = await prisma.lead.findUniqueOrThrow({ where: { id: leads[0].id } });
    assert.equal(saved.messageContent, review.leads.find(row => row.id === leads[0].id)!.message);
    assert.equal(saved.status, 'QUEUED');
    assert.equal(jobs.length, 1); assert.equal(jobs[0][2].jobId, `${campaign.id}_${leads[0].id}`);
    assert.equal(jobs[0][1].batchId, saved.sendBatchId);
    assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: leads[1].id } })).status, 'PENDING');
  });
  await t.test('BullMQ real recebe somente selecionados com IDs determinísticos e lote aprovado', async () => {
    const { Queue } = require('bullmq');
    const { createConnection } = require('./queue');
    const connection = createConnection();
    const queue = new Queue(`review-test-${crypto.randomUUID()}`, { connection });
    try {
      const { campaign, leads, review } = await fixture();
      await startCampaign(prisma, queue, campaign.id, workspace.id, false, { token: review.token, leadIds: [leads[0].id, leads[2].id] });
      const jobs = await queue.getJobs(['delayed', 'waiting']);
      assert.deepEqual(jobs.map((job: any) => job.id).sort(), [`${campaign.id}_${leads[0].id}`, `${campaign.id}_${leads[2].id}`].sort());
      const saved = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
      assert.ok(jobs.every((job: any) => job.data.batchId === saved.activeSendBatchId));
      assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: leads[1].id } })).status, 'PENDING');
    } finally { await queue.obliterate({ force: true }); await queue.close(); await connection.quit(); }
  });
  await t.test('Revisão expirada exige nova conferência, sem gravar lote', async () => {
    const { campaign, leads, review } = await fixture();
    const originalNow = Date.now;
    try {
      Date.now = () => review.expiresAt + 1;
      await assert.rejects(claimReviewedBatch(prisma, campaign.id, workspace.id, false, { token: review.token, leadIds: [leads[0].id] }), /expirou/);
    } finally { Date.now = originalNow; }
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).activeSendBatchId, null);
  });
  await t.test('Edição posterior, troca de workspace, modo ou assinatura inválida não autorizam envio', async () => {
    const { campaign, leads, review } = await fixture();
    await prisma.lead.update({ where: { id: leads[0].id }, data: { messageContent: 'Texto alterado depois da revisão' } });
    await assert.rejects(claimReviewedBatch(prisma, campaign.id, workspace.id, false, { token: review.token, leadIds: [leads[0].id] }), /mudaram/);
    await assert.rejects(claimReviewedBatch(prisma, campaign.id, 'outro-workspace', false, { token: review.token, leadIds: [leads[0].id] }), /outra campanha/);
    await assert.rejects(claimReviewedBatch(prisma, campaign.id, workspace.id, true, { token: review.token, leadIds: [leads[0].id] }), /outra campanha/);
    await assert.rejects(claimReviewedBatch(prisma, campaign.id, workspace.id, false, { token: review.token + 'x', leadIds: [leads[0].id] }), /inválida/);
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, 'PAUSED');
  });
  await t.test('Seleção vazia, duplicada, estrangeira ou sem mensagem é recusada sem gravar lote', async () => {
    const { campaign, leads, review } = await fixture();
    for (const ids of [[], [leads[0].id, leads[0].id], ['estrangeiro']]) await assert.rejects(claimReviewedBatch(prisma, campaign.id, workspace.id, false, { token: review.token, leadIds: ids }));
    await prisma.campaign.update({ where: { id: campaign.id }, data: { messageSemSite: '' } });
    const empty = await createSendReview(prisma, campaign.id, workspace.id, false);
    await assert.rejects(claimReviewedBatch(prisma, campaign.id, workspace.id, false, { token: empty.token, leadIds: [leads[0].id] }), /vazia/);
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).activeSendBatchId, null);
  });
  await t.test('Inícios simultâneos aprovam um único lote e tentativa de falha não inclui envio ambíguo', async () => {
    const { campaign, leads, review } = await fixture();
    const result = await Promise.allSettled([0, 1].map(() => claimReviewedBatch(prisma, campaign.id, workspace.id, false, { token: review.token, leadIds: [leads[0].id] })));
    assert.equal(result.filter(row => row.status === 'fulfilled').length, 1);
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' } });
    await prisma.lead.update({ where: { id: leads[1].id }, data: { status: 'ERROR', sendStartedAt: new Date(), wppMessageId: 'incerto' } });
    await prisma.lead.update({ where: { id: leads[2].id }, data: { status: 'ERROR' } });
    const retry = await createSendReview(prisma, campaign.id, workspace.id, true);
    assert.ok(!retry.leads.some(lead => lead.id === leads[1].id));
    assert.ok(retry.leads.some(lead => lead.id === leads[2].id));
  });
  await t.test('IA não reserva nem cobra acima da estimativa confirmada após novos contatos', async subtest => {
    const { campaign } = await fixture();
    const { AiCopyService, setTestAiProvider } = require('./AiCopyService');
    setTestAiProvider(async () => { throw new Error('Não pode chamar IA ao ultrapassar o teto aprovado'); });
    subtest.after(() => setTestAiProvider(null));
    const before = await prisma.aiOperation.count({ where: { campaignId: campaign.id } });
    const beforeReservations = await prisma.creditReservation.count({ where: { userId: user.id } });
    await assert.rejects(AiCopyService.initiateBatchGeneration({ userId: user.id, workspaceId: workspace.id, campaignId: campaign.id, offerDescription: 'Criação de sites para clínicas', idempotencyKey: `ceiling-${crypto.randomUUID()}`, maxCredits: 1, customQueue: { add: async () => { throw new Error('Não deveria enfileirar'); } } }), { code: 'AI_ESTIMATE_CHANGED', statusCode: 409 });
    assert.equal(await prisma.aiOperation.count({ where: { campaignId: campaign.id } }), before);
    assert.equal(await prisma.creditReservation.count({ where: { userId: user.id } }), beforeReservations);
  });
  await t.test('Falha na fila preserva a mensagem revisada e devolve apenas o lote selecionado', async () => {
    const { campaign, leads, review } = await fixture();
    const queue: any = { getJob: async () => null, add: async () => { throw new Error('Redis indisponível'); } };
    await assert.rejects(startCampaign(prisma, queue, campaign.id, workspace.id, false, { token: review.token, leadIds: [leads[0].id] }), /pausada/);
    const saved = await prisma.lead.findUniqueOrThrow({ where: { id: leads[0].id } });
    assert.equal(saved.status, 'PENDING');
    assert.equal(saved.messageContent, review.leads.find(lead => lead.id === leads[0].id)!.message);
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, 'PAUSED');
    assert.equal(await prisma.lead.count({ where: { campaignId: campaign.id, status: 'PENDING' } }), 3);
  });
});

test('API de revisão: autenticação, isolamento, estimativa e início sem aprovação bloqueado', async t => {
  const express = (await import('express')).default;
  const jwt = (await import('jsonwebtoken')).default;
  const { ENV } = require('../config/env');
  const router = require('../routes/campaigns').default;
  const [database] = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  assert.equal(database.db, 'bot_prospeccao_test');
  const users = await Promise.all([0, 1].map(i => prisma.user.create({ data: { email: `review-http-${crypto.randomUUID()}-${i}@test.local`, password: 'hash', role: 'ADMIN', subscriptionStatus: 'LIFETIME', emailVerifiedAt: new Date(), workspaces: { create: { name: 'Teste HTTP' } } }, include: { workspaces: true } })));
  const campaign = await prisma.campaign.create({ data: { workspaceId: users[0].workspaces[0].id, name: 'Privada', messageSemSite: 'Olá {nome}!' } });
  await prisma.lead.create({ data: { campaignId: campaign.id, title: 'Clínica', phone: '5521999990000' } });
  const app = express(); app.use(express.json()); app.use('/campaigns', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); await prisma.$disconnect(); });
  const port = (server.address() as import('node:net').AddressInfo).port;
  const request = (path: string, userIndex = 0, body?: unknown) => fetch(`http://127.0.0.1:${port}/campaigns/${campaign.id}/${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ userId: users[userIndex].id, authVersion: 0 }, ENV.JWT_SECRET)}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request('start', 0, {})).status, 400);
  assert.equal((await request('retry-failed', 0, {})).status, 400);
  assert.equal((await request('send-review', 1, {})).status, 404);
  assert.equal((await request('ai-estimate', 1)).status, 404);
  assert.deepEqual(await (await request('ai-estimate')).json(), { eligibleCount: 1, batchCount: 1, maxCredits: 1, unitCost: 1 });
  const review = await request('send-review', 0, {}); assert.equal(review.status, 200);
  assert.equal((await review.json()).leads[0].message, 'Olá Clínica!');
});
