import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import router from '../routes/templates';
import { createMessageTemplate, deleteMessageTemplate, updateMessageTemplate } from './MessageTemplates';

const input = { title: 'Retorno de apresentação', service: 'Criação de sites', content: 'Olá {nome}, conseguiu olhar os exemplos que combinamos?' };
test('Modelos pessoais: CRUD versionado e isolamento no PostgreSQL real', async t => {
  const [database] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.equal(database.name, 'bot_prospeccao_test');
  const users = await Promise.all([0, 1].map(i => prisma.user.create({ data: { email: `templates-${randomUUID()}-${i}@test.local`, password: 'hash', emailVerifiedAt: new Date(), subscriptionStatus: 'PAST_DUE', planId: 'PRO', wallet: { create: { monthlyBalance: 13, purchasedBalance: 7 } }, workspaces: { create: { name: 'Modelos isolados' } } }, include: { workspaces: true } })));
  const [a, b] = users.map(user => user.workspaces[0]);
  const campaign = await prisma.campaign.create({ data: { workspaceId: a.id, name: 'Preservada' } });
  const lead = await prisma.lead.create({ data: { campaignId: campaign.id, title: 'Contato preservado', phone: '5521999990821', messageContent: 'Mensagem já salva', status: 'PENDING' } });
  const beforeUser = await prisma.user.findUnique({ where: { id: users[0].id }, include: { wallet: true, workspaces: true } });
  const beforeLead = await prisma.lead.findUnique({ where: { id: lead.id } });
  const beforeCampaign = await prisma.campaign.findUnique({ where: { id: campaign.id } });
  const app = express(); app.use(express.json()); app.use('/templates', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/templates`;
  const request = (url = '', method = 'GET', body?: unknown, i = 0) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ userId: users[i].id, authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' })}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let saved: { id: string; version: number };
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); await prisma.$disconnect(); });
  await t.test('Exige autenticação e dados estritos, sem plano ativo para organizar modelos', async () => {
    assert.equal((await fetch(base)).status, 401);
    for (const body of [{ ...input, workspaceId: b.id }, { ...input, title: ' ' }, { ...input, title: 'a'.repeat(81) }, { ...input, service: 's'.repeat(81) }, { ...input, content: ' ' }, { ...input, content: 'a'.repeat(2001) }]) assert.equal((await request('', 'POST', body)).status, 400);
    const response = await request('', 'POST', { ...input, title: `  ${input.title}  ` }); assert.equal(response.status, 201);
    const data = await response.json(); saved = data.template;
    assert.equal(data.template.title, input.title); assert.equal(data.template.version, 1);
    assert.equal((await (await request()).json()).templates.length, 1);
    assert.equal((await (await request('', 'GET', undefined, 1)).json()).templates.length, 0);
  });
  await t.test('IDs de outra conta e tentativa de atribuir workspace não autorizam acesso', async () => {
    assert.equal((await request(`/${saved.id}`, 'PUT', { ...input, version: 1 }, 1)).status, 404);
    assert.equal((await request(`/${saved.id}`, 'DELETE', { version: 1 }, 1)).status, 404);
    assert.equal((await request(`/${saved.id}`, 'PUT', { ...input, version: 1, workspaceId: b.id })).status, 400);
    assert.equal((await request(`/${saved.id}`, 'PUT', { ...input, version: 0 })).status, 400);
    assert.equal((await request(`/${saved.id}`, 'DELETE', { version: 0 })).status, 400);
  });
  await t.test('Dois saves da mesma versão têm um vencedor e rascunho antigo recebe 409', async () => {
    const results = await Promise.allSettled(['A', 'B'].map(title => updateMessageTemplate(prisma, a.id, saved.id, { ...input, title, version: 1 })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.status, 409);
    const current = await prisma.messageTemplate.findUniqueOrThrow({ where: { id: saved.id } }); assert.equal(current.version, 2);
    assert.equal((await request(`/${saved.id}`, 'PUT', { ...input, content: 'Não pode substituir', version: 1 })).status, 409);
    assert.equal((await request(`/${saved.id}`, 'DELETE', { version: 1 })).status, 409);
    assert.deepEqual(await prisma.messageTemplate.findUnique({ where: { id: saved.id } }), current);
  });
  await t.test('Atualização e exclusão concorrentes não apagam uma edição nova', async () => {
    const current = await prisma.messageTemplate.findUniqueOrThrow({ where: { id: saved.id } });
    const results = await Promise.allSettled([
      updateMessageTemplate(prisma, a.id, saved.id, { ...input, version: current.version, content: 'Uma nova versão da abordagem.' }),
      deleteMessageTemplate(prisma, a.id, saved.id, current.version),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const remaining = await prisma.messageTemplate.findUnique({ where: { id: saved.id } });
    if (remaining) { assert.equal(remaining.version, current.version + 1); assert.equal(remaining.content, 'Uma nova versão da abordagem.'); await deleteMessageTemplate(prisma, a.id, remaining.id, remaining.version); }
    assert.equal(await prisma.messageTemplate.count({ where: { id: saved.id } }), 0);
  });
  await t.test('Limite de 200 é respeitado em criações simultâneas e entre workspaces', async () => {
    await prisma.messageTemplate.createMany({ data: Array.from({ length: 199 }, (_, i) => ({ workspaceId: a.id, ...input, title: `Modelo ${i}` })) });
    const results = await Promise.allSettled([0, 1].map(() => createMessageTemplate(prisma, a.id, input)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.status, 409);
    assert.equal(await prisma.messageTemplate.count({ where: { workspaceId: a.id } }), 200);
    assert.equal((await request('', 'POST', input)).status, 409);
    assert.equal((await request('', 'POST', input, 1)).status, 201);
  });
  await t.test('Organizar modelos preserva carteira, assinatura, campanhas e mensagens', async () => {
    assert.deepEqual(await prisma.user.findUnique({ where: { id: users[0].id }, include: { wallet: true, workspaces: true } }), beforeUser);
    assert.deepEqual(await prisma.lead.findUnique({ where: { id: lead.id } }), beforeLead);
    assert.deepEqual(await prisma.campaign.findUnique({ where: { id: campaign.id } }), beforeCampaign);
    await prisma.user.delete({ where: { id: users[1].id } });
    assert.equal(await prisma.messageTemplate.count({ where: { workspaceId: b.id } }), 0);
  });
});
