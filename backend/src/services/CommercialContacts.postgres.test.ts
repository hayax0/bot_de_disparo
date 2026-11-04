import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import router from '../routes/campaigns';
import { commercialMetrics, commercialPhone, readCommercial, updateCommercial } from './CommercialContacts';
import { AnonymizationService } from './AnonymizationService';
const input = { stage: 'INTERESTED' as const, notes: 'Pediu uma demonstração curta.', meetingBooked: true, version: 0 };

test('Acompanhamento comercial: persistência, isolamento e métricas no PostgreSQL real', async t => {
  const [database] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.equal(database.name, 'bot_prospeccao_test');
  const users = await Promise.all([0, 1].map(i => prisma.user.create({ data: { email: `commercial-${randomUUID()}-${i}@test.local`, password: 'hash', name: 'Nome preservado', emailVerifiedAt: new Date(), subscriptionStatus: 'ACTIVE', subscriptionExpiresAt: new Date(Date.now() + 86400000), planId: 'PRO', monthlyDispatchQuota: 3000, dispatchesUsedInCycle: 47, wallet: { create: { monthlyBalance: 40, purchasedBalance: 15 } }, workspaces: { create: { name: 'Workspace preservado' } } }, include: { workspaces: true } })));
  const [a, b] = users.map(user => user.workspaces[0]);
  const campaign = await prisma.campaign.create({ data: { workspaceId: a.id, name: 'Clínicas' } });
  const second = await prisma.campaign.create({ data: { workspaceId: a.id, name: 'Outra lista' } });
  const empty = await prisma.campaign.create({ data: { workspaceId: a.id, name: 'Campanha vazia' } });
  const foreign = await prisma.campaign.create({ data: { workspaceId: b.id, name: 'Privada de B' } });
  const lead = await prisma.lead.create({ data: { campaignId: campaign.id, title: 'Clínica Alvo', phone: '5521999990003', status: 'PENDING', messageContent: 'Texto preservado' } });
  const sameContact = await prisma.lead.create({ data: { campaignId: second.id, title: 'Mesmo contato em outra lista', phone: '+55 (21) 99999-0003' } });
  const foreignLead = await prisma.lead.create({ data: { campaignId: foreign.id, title: 'Mesmo telefone em outra conta', phone: lead.phone } });
  const before = await prisma.user.findUnique({ where: { id: users[0].id }, include: { wallet: true, workspaces: true } });
  const beforeLead = await prisma.lead.findUnique({ where: { id: lead.id } });
  const app = express(); app.use(express.json()); app.use('/campaigns', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/campaigns`;
  const request = (url: string, method = 'GET', body?: unknown, i = 0) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ userId: users[i].id, authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' })}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const url = `/${campaign.id}/leads/${lead.id}/commercial`;
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); await prisma.$disconnect(); });

  await t.test('Autenticação, isolamento e payload estrito impedem alterações de conta/envio', async () => {
    assert.equal((await fetch(base + url)).status, 401);
    assert.equal((await request(url, 'GET', undefined, 1)).status, 404);
    assert.equal((await request(url, 'PUT', input, 1)).status, 404);
    assert.equal((await request(`/${second.id}/leads/${lead.id}/commercial`)).status, 404);
    for (const body of [{ ...input, stage: 'SENT' }, { ...input, workspaceId: b.id }, { ...input, notes: 'x'.repeat(4001) }, { ...input, version: -1 }, { ...input, meetingBooked: 'true' }]) assert.equal((await request(url, 'PUT', body)).status, 400);
    assert.equal((await request(`/${campaign.id}/leads?commercialStage=INVALID`)).status, 400);
    assert.equal((await request(`/${campaign.id}/leads?meeting=MAYBE`)).status, 400);
  });
  await t.test('Reutiliza notas entre campanhas da mesma conta, sem alterar saldo, plano ou envio', async () => {
    assert.equal((await (await request(url)).json()).commercial.version, 0);
    const saved = await request(url, 'PUT', input); assert.equal(saved.status, 200); assert.equal((await saved.json()).commercial.version, 1);
    assert.equal((await readCommercial(prisma, a.id, second.id, sameContact.id)).commercial.notes, input.notes);
    assert.equal((await readCommercial(prisma, b.id, foreign.id, foreignLead.id)).commercial.version, 0);
    await updateCommercial(prisma, b.id, foreign.id, foreignLead.id, { ...input, stage: 'NOT_INTERESTED', notes: 'Somente conta B', meetingBooked: false });
    assert.equal((await readCommercial(prisma, a.id, campaign.id, lead.id)).commercial.notes, input.notes);
    assert.deepEqual(await prisma.user.findUnique({ where: { id: users[0].id }, include: { wallet: true, workspaces: true } }), before);
    assert.deepEqual(await prisma.lead.findUnique({ where: { id: lead.id } }), beforeLead);
  });
  await t.test('Concorrência e versão antiga não sobrescrevem anotações', async () => {
    const results = await Promise.allSettled(['A', 'B'].map(notes => updateCommercial(prisma, a.id, campaign.id, lead.id, { ...input, version: 1, notes })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.status, 409);
    const current = (await readCommercial(prisma, a.id, campaign.id, lead.id)).commercial;
    assert.equal((await request(url, 'PUT', { ...input, version: 1, notes: 'Não pode sobrescrever' })).status, 409);
    assert.deepEqual((await readCommercial(prisma, a.id, campaign.id, lead.id)).commercial, current);
    await updateCommercial(prisma, a.id, campaign.id, lead.id, { ...input, version: current.version });
  });
  await t.test('Filtros por etapa, reunião, texto e paginação são aplicados no servidor', async () => {
    await prisma.lead.createMany({ data: [
      { campaignId: campaign.id, title: 'Contato lido', phone: '5521999990001', status: 'READ' },
      { campaignId: campaign.id, title: 'Mesmo número formatado', phone: '+55 (21) 99999-0001', status: 'REPLIED' },
      { campaignId: campaign.id, title: 'Contato respondido', phone: '5521999990002', status: 'REPLIED' },
      { campaignId: campaign.id, title: 'Contato entregue', phone: '5521999990004', status: 'DELIVERED' },
      { campaignId: second.id, title: 'Contato enviado', phone: '5521999990005', status: 'SENT' },
    ] });
    const filtered = await (await request(`/${campaign.id}/leads?commercialStage=INTERESTED&meeting=YES&search=Alvo&limit=1`)).json();
    assert.equal(filtered.pagination.total, 1); assert.equal(filtered.leads[0].id, lead.id); assert.equal(filtered.leads[0].commercial.meetingBooked, true);
    assert.equal((await (await request(`/${campaign.id}/leads?meeting=NO`)).json()).pagination.total, 4);
    const unclassified = await (await request(`/${campaign.id}/leads?commercialStage=UNCLASSIFIED&limit=1&page=2`)).json(); assert.equal(unclassified.pagination.total, 4); assert.equal(unclassified.leads.length, 1);
    const other = await (await request(`/${foreign.id}/leads?commercialStage=NOT_INTERESTED`, 'GET', undefined, 1)).json(); assert.equal(other.leads[0].commercial.notes, 'Somente conta B');
  });
  await t.test('Agregações deduplicam telefones e não inferem interesse/reunião de leitura', async () => {
    const response = await request('/commercial-metrics'); assert.equal(response.status, 200); const metrics = await response.json();
    assert.deepEqual(metrics.summary, { total: 5, sent: 4, replied: 2, interested: 1, meetings: 1 });
    const first = metrics.campaigns.find((row: any) => row.campaignId === campaign.id);
    assert.equal(first.total, 4); assert.equal(first.sent, 3); assert.equal(first.replied, 2); assert.equal(first.responseRate, 66.7); assert.equal(first.interested, 1); assert.equal(first.meetings, 1);
    const another = metrics.campaigns.find((row: any) => row.campaignId === second.id); assert.equal(another.interested, 1); assert.equal(another.replied, 0);
    const noLeads = metrics.campaigns.find((row: any) => row.campaignId === empty.id); assert.equal(noLeads.total, 0); assert.equal(noLeads.responseRate, null);
    assert.ok(!metrics.campaigns.some((row: any) => row.campaignId === foreign.id));
    const other = await commercialMetrics(prisma, b.id); assert.equal(other.summary.interested, 0); assert.equal(other.summary.meetings, 0);
  });
  await t.test('Anonimização apaga notas e impede recriação concorrente, preservando outras contas', async () => {
    const legacyAlias = await prisma.lead.create({ data: { campaignId: campaign.id, title: 'Duplicado legado formatado', phone: '+55 (21) 99999-0003' } });
    await prisma.dispatchHistory.createMany({ data: [lead.phone, '+55 (21) 99999-0003'].map(phone => ({ workspaceId: a.id, phone, companyTitle: 'Empresa a apagar', lastMessage: 'Mensagem privada' })) });
    const current = (await readCommercial(prisma, a.id, campaign.id, lead.id)).commercial;
    const results = await Promise.allSettled([
      AnonymizationService.anonymizeContact({ phone: lead.phone, workspaceId: a.id, requestedByUserId: users[0].id }),
      updateCommercial(prisma, a.id, campaign.id, lead.id, { ...input, version: current.version, notes: 'Concorrente com remoção' }),
    ]);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(await prisma.commercialContact.count({ where: { workspaceId: a.id, phone: lead.phone } }), 0);
    assert.equal((await request(`/${second.id}/leads/${sameContact.id}/commercial`)).status, 404);
    assert.equal((await request(`/${campaign.id}/leads/${legacyAlias.id}/commercial`, 'PUT', input)).status, 404);
    assert.equal(await prisma.lead.count({ where: { id: { in: [lead.id, sameContact.id, legacyAlias.id] }, phone: { startsWith: 'anon_' }, messageContent: null } }), 3);
    assert.equal(await prisma.dispatchHistory.count({ where: { workspaceId: a.id, phone: { startsWith: 'anon_' }, lastMessage: null } }), 2);
    assert.equal((await request(url)).status, 404);
    assert.equal((await request(url, 'PUT', { ...input, version: 0 })).status, 404);
    assert.equal((await readCommercial(prisma, b.id, foreign.id, foreignLead.id)).commercial.notes, 'Somente conta B');
  });
});
test('Normalização comercial preserva identidade sem juntar fixos e celulares', () => {
  assert.equal(commercialPhone('+55 (21) 99999-0003'), '5521999990003');
  assert.equal(commercialPhone('(55) 99999-0003'), '5555999990003');
  assert.equal(commercialPhone('021999990003'), '5521999990003');
  assert.equal(commercialPhone('anon_aabb11223344'), null); assert.equal(commercialPhone('inválido'), null);
});
