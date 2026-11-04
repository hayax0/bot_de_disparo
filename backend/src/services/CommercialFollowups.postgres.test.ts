import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import router from '../routes/campaigns';
import { readCommercial, updateCommercial, commercialListSchema, listCommercialContacts, commercialDateSchema } from './CommercialContacts';
import { AnonymizationService } from './AnonymizationService';

const baseInput = { stage: 'INTERESTED' as const, notes: 'Retorno combinado pelo cliente.', meetingBooked: true, version: 0, nextContactAt: '2026-10-30' };

test('Lembretes e oportunidades: calendário civil, isolamento e deduplicação reais', async t => {
  const [database] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.equal(database.name, 'bot_prospeccao_test');
  const users = await Promise.all([0, 1].map(i => prisma.user.create({ data: {
    email: `followup-${randomUUID()}-${i}@test.local`, password: 'hash', name: 'Conta preservada',
    emailVerifiedAt: new Date(), subscriptionStatus: 'CANCELED', subscriptionExpiresAt: new Date('2025-01-01T00:00:00Z'),
    planId: 'PRO', monthlyDispatchQuota: 3000, dispatchesUsedInCycle: 47,
    wallet: { create: { monthlyBalance: 40, purchasedBalance: 15 } }, workspaces: { create: { name: 'Empresa preservada' } },
  }, include: { workspaces: true } })));
  const [a, b] = users.map(user => user.workspaces[0]);
  const first = await prisma.campaign.create({ data: { workspaceId: a.id, name: 'Primeira lista' } });
  const second = await prisma.campaign.create({ data: { workspaceId: a.id, name: 'Lista recente' } });
  const foreign = await prisma.campaign.create({ data: { workspaceId: b.id, name: 'Lista privada' } });
  const original = await prisma.lead.create({ data: { campaignId: first.id, title: 'Empresa Antiga', phone: '5521999980001', status: 'REPLIED', messageContent: 'Mensagem preservada', createdAt: new Date('2026-10-01T00:00:00Z') } });
  const recent = await prisma.lead.create({ data: { campaignId: second.id, title: 'Empresa Atual', phone: '+55 (21) 99998-0001', status: 'PENDING', createdAt: new Date('2026-10-02T00:00:00Z') } });
  const overdue = await prisma.lead.create({ data: { campaignId: first.id, title: 'Atrasado', phone: '5521999980002', status: 'SENT' } });
  const upcoming = await prisma.lead.create({ data: { campaignId: first.id, title: 'Futuro', phone: '5521999980003', status: 'READ' } });
  const unscheduled = await prisma.lead.create({ data: { campaignId: first.id, title: 'Sem data', phone: '5521999980004' } });
  await prisma.lead.createMany({ data: [
    { campaignId: first.id, title: 'Anonimizado', phone: 'anon_5521999980005' },
    { campaignId: first.id, title: 'Inválido', phone: '000' },
    { campaignId: foreign.id, title: 'Empresa de outra conta', phone: original.phone },
  ] });
  const snapshot = async () => ({
    user: await prisma.user.findUnique({ where: { id: users[0].id }, include: { wallet: true, workspaces: true } }),
    leads: await prisma.lead.findMany({ where: { campaign: { workspaceId: a.id } }, orderBy: { id: 'asc' } }),
    campaigns: await prisma.campaign.findMany({ where: { workspaceId: a.id }, orderBy: { id: 'asc' } }),
    reservations: await prisma.creditReservation.count({ where: { userId: users[0].id } }),
    transactions: await prisma.creditTransaction.count({ where: { userId: users[0].id } }),
  });
  const before = await snapshot();
  const app = express(); app.use(express.json()); app.use('/campaigns', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/campaigns`;
  const request = (url: string, method = 'GET', body?: unknown, i = 0) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ userId: users[i].id, authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' })}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const url = `/${first.id}/leads/${original.id}/commercial`;
  t.after(async () => {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await prisma.$disconnect();
  });

  await t.test('Rejeita datas impossíveis e filtros/paginação inválidos; exige autenticação', async () => {
    assert.equal((await fetch(base + '/commercial-contacts')).status, 401);
    for (const date of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-01', '2026-10-00', '2026-10-30T00:00:00Z', '0000-01-01']) {
      assert.equal((await request(url, 'PUT', { ...baseInput, nextContactAt: date })).status, 400, date);
      assert.equal((await request(`/commercial-contacts?today=${date}`)).status, 400, date);
    }
    assert.equal(commercialDateSchema.safeParse('2028-02-29').success, true);
    for (const query of ['page=0', 'page=1.5', 'limit=101', 'limit=0', 'stage=SENT', 'meeting=MAYBE', 'reminder=TOMORROW', 'search=' + 'x'.repeat(101), 'workspaceId=' + b.id]) {
      assert.equal((await request(`/commercial-contacts?${query}`)).status, 400, query);
    }
    assert.equal((await request(url, 'PUT', baseInput, 1)).status, 404);
  });
  await t.test('Persiste datas sem fuso, mantém contratos antigos e limpa retorno ao concluir', async () => {
    const saved = await request(url, 'PUT', baseInput); assert.equal(saved.status, 200);
    assert.equal((await saved.json()).commercial.nextContactAt, '2026-10-30');
    assert.equal((await readCommercial(prisma, a.id, second.id, recent.id)).commercial.nextContactAt, '2026-10-30');
    // O cliente antigo não envia o campo: não pode remover um lembrete novo silenciosamente.
    const { nextContactAt: ignored, ...legacyInput } = baseInput;
    const legacy = await request(url, 'PUT', { ...legacyInput, version: 1 }); assert.equal(legacy.status, 200);
    assert.equal((await legacy.json()).commercial.nextContactAt, '2026-10-30');
    await updateCommercial(prisma, a.id, first.id, overdue.id, { ...baseInput, stage: 'IN_CONVERSATION', meetingBooked: false, nextContactAt: '2026-10-29' });
    await updateCommercial(prisma, a.id, first.id, upcoming.id, { ...baseInput, stage: 'NO_RESPONSE', meetingBooked: false, nextContactAt: '2026-10-31' });
    const cleared = await updateCommercial(prisma, a.id, first.id, upcoming.id, { ...baseInput, stage: 'NO_RESPONSE', meetingBooked: false, nextContactAt: null, version: 1 });
    assert.equal(cleared.nextContactAt, null);
    await updateCommercial(prisma, a.id, first.id, upcoming.id, { ...baseInput, stage: 'NO_RESPONSE', meetingBooked: false, nextContactAt: '2026-10-31', version: 2 });
    const leadPage = await (await request(`/${first.id}/leads`)).json();
    assert.equal(leadPage.leads.find((lead: any) => lead.id === original.id).commercial.nextContactAt, '2026-10-30');
  });
  await t.test('Deduplica antes de filtrar e paginar, exclui anonimizados e mantém counts globais', async () => {
    const response = await request('/commercial-contacts?today=2026-10-30&limit=2'); assert.equal(response.status, 200);
    const firstPage = await response.json();
    assert.equal(firstPage.total, 4); assert.equal(firstPage.contacts.length, 2);
    assert.deepEqual(firstPage.counts, { today: 1, overdue: 1, scheduled: 3 });
    assert.equal(firstPage.contacts[0].leadId, overdue.id);
    assert.equal(firstPage.contacts[1].leadId, recent.id); assert.equal(firstPage.contacts[1].campaignId, second.id);
    assert.equal(firstPage.contacts[1].phone, original.phone);
    const secondPage = await (await request('/commercial-contacts?today=2026-10-30&limit=2&page=2')).json();
    assert.equal(secondPage.total, 4); assert.equal(secondPage.page, 2); assert.equal(secondPage.pageSize, 2);
    assert.equal(new Set([...firstPage.contacts, ...secondPage.contacts].map(row => row.phone)).size, 4);
    assert.ok(secondPage.contacts.some((row: any) => row.leadId === unscheduled.id && row.commercial.nextContactAt === null));
    const noMatches = await (await request('/commercial-contacts?today=2026-10-30&search=NAO-EXISTE&stage=INTERESTED')).json();
    assert.equal(noMatches.total, 0); assert.deepEqual(noMatches.counts, firstPage.counts);
    const beyond = await (await request('/commercial-contacts?today=2026-10-30&page=99')).json();
    assert.equal(beyond.total, 4); assert.equal(beyond.contacts.length, 0);
    const own = await (await request('/commercial-contacts?today=2026-10-30', 'GET', undefined, 1)).json();
    assert.equal(own.total, 1); assert.equal(own.contacts[0].commercial.version, 0);
    assert.deepEqual(own.counts, { today: 0, overdue: 0, scheduled: 0 });
  });
  await t.test('Filtros de calendário, etapa e reunião combinam e busca literal não vira wildcard SQL', async () => {
    for (const [reminder, expected] of [['TODAY', recent.id], ['OVERDUE', overdue.id], ['UPCOMING', upcoming.id], ['UNSCHEDULED', unscheduled.id]]) {
      const data = await (await request(`/commercial-contacts?today=2026-10-30&reminder=${reminder}`)).json();
      assert.equal(data.total, 1); assert.equal(data.contacts[0].leadId, expected);
    }
    const filtered = await (await request('/commercial-contacts?today=2026-10-30&stage=INTERESTED&meeting=YES&search=EMPRESA%20ATUAL')).json();
    assert.equal(filtered.total, 1); assert.equal(filtered.contacts[0].leadId, recent.id);
    const wildcard = await (await request('/commercial-contacts?today=2026-10-30&search=%25')).json(); assert.equal(wildcard.total, 0);
    const [unknown] = await Promise.all([listCommercialContacts(prisma, a.id, commercialListSchema.parse({ today: '2026-10-30', stage: 'UNCLASSIFIED', meeting: 'NO' }))]);
    assert.equal(unknown.total, 1); assert.equal(unknown.contacts[0].leadId, unscheduled.id);
  });
  await t.test('Duas edições de retorno concorrentes preservam versão e não alteram envios ou créditos', async () => {
    const current = (await readCommercial(prisma, a.id, first.id, original.id)).commercial;
    const results = await Promise.allSettled(['2026-11-01', '2026-11-02'].map(nextContactAt => updateCommercial(prisma, a.id, first.id, original.id, { ...baseInput, version: current.version, nextContactAt })));
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal((results.find(row => row.status === 'rejected') as PromiseRejectedResult).reason.status, 409);
    assert.equal((await request(url, 'PUT', { ...baseInput, version: current.version })).status, 409);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('Anonimização elimina o lembrete e o contato do quadro sem afetar outra conta', async () => {
    await AnonymizationService.anonymizeContact({ phone: original.phone, workspaceId: a.id, requestedByUserId: users[0].id });
    const data = await (await request('/commercial-contacts?today=2026-10-30')).json();
    assert.equal(data.total, 3); assert.ok(!data.contacts.some((row: any) => row.phone === original.phone));
    assert.equal(await prisma.commercialContact.count({ where: { workspaceId: a.id, phone: original.phone } }), 0);
    assert.equal((await (await request('/commercial-contacts?today=2026-10-30', 'GET', undefined, 1)).json()).total, 1);
  });
});
