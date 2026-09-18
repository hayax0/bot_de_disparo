import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import campaignsRouter from './campaigns';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { mockMethod } from '../test-support/mockMethod';

async function serveCampaigns(t: any) {
  const app = express();
  app.use(express.json());
  app.use('/campaigns', campaignsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/campaigns`;
}

test('POST /campaigns: validação Zod bloqueia campanha sem nome com 400', async (t) => {
  const fakeUser = { id: 'u-1', email: 'user@test.com', role: 'ADMIN', authVersion: 0, subscriptionStatus: 'ACTIVE', emailVerifiedAt: new Date(), workspaces: [{ id: 'w-1' }] };
  mockMethod(t, prisma.user, 'findUnique', async () => fakeUser);

  const token = jwt.sign({ userId: 'u-1', authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' });
  const base = await serveCampaigns(t);

  const res = await fetch(base, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name: '', messageComSite: 'Olá', delayMin: 90, delayMax: 180 })
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'O nome da campanha é obrigatório.');
});

test('POST /campaigns: validação Zod bloqueia campanha se delayMax for menor que delayMin', async (t) => {
  const fakeUser = { id: 'u-1', email: 'user@test.com', role: 'ADMIN', authVersion: 0, subscriptionStatus: 'ACTIVE', emailVerifiedAt: new Date(), workspaces: [{ id: 'w-1' }] };
  mockMethod(t, prisma.user, 'findUnique', async () => fakeUser);

  const token = jwt.sign({ userId: 'u-1', authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' });
  const base = await serveCampaigns(t);

  const res = await fetch(base, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name: 'Campanha Teste', messageComSite: 'Olá', delayMin: 120, delayMax: 60 })
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'O tempo máximo de delay deve ser igual ou maior que o tempo mínimo.');
});

test('POST /campaigns/:id/leads/import: rejeita arquivo com mais de 2.000 registros', async (t) => {
  const fakeUser = { id: 'u-1', email: 'user@test.com', role: 'ADMIN', authVersion: 0, subscriptionStatus: 'ACTIVE', emailVerifiedAt: new Date(), workspaces: [{ id: 'w-1' }] };
  mockMethod(t, prisma.user, 'findUnique', async () => fakeUser);
  mockMethod(t, prisma.campaign, 'findFirst', async () => ({ id: 'c-1', workspaceId: 'w-1' }));

  const token = jwt.sign({ userId: 'u-1', authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' });
  const base = await serveCampaigns(t);

  // Gera 2001 leads em JSON
  const leadsOverLimit = Array.from({ length: 2001 }, (_, i) => ({
    title: `Lead ${i}`,
    phone: `1199999${String(i).padStart(4, '0')}`
  }));
  const blob = new Blob([JSON.stringify(leadsOverLimit)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('file', blob, 'leads_2001.json');

  const res = await fetch(`${base}/c-1/leads/import`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.includes('mais de 2.000 registros'), true);
});

test('POST /campaigns/preview-import: gera diagnóstico preciso e mutuamente exclusivo', async (t) => {
  const fakeUser = { id: 'u-1', email: 'user@test.com', role: 'ADMIN', authVersion: 0, subscriptionStatus: 'ACTIVE', emailVerifiedAt: new Date(), workspaces: [{ id: 'w-1' }] };
  mockMethod(t, prisma.user, 'findUnique', async () => fakeUser);
  mockMethod(t, prisma.dispatchHistory, 'findMany', async () => [
    { phone: '5511999990001', lastSentAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), sendCount: 1, lastCampaignName: 'Campanha Antiga' }
  ]);

  const token = jwt.sign({ userId: 'u-1', authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' });
  const base = await serveCampaigns(t);

  // CSV com:
  // 1. Válido com histórico (já contatado há 40 dias, recontactAfterDays = 30 -> apto)
  // 2. Válido novo
  // 3. Duplicado do 2
  // 4. Inválido (sem telefone)
  const csvData = [
    'Empresa,Telefone,Website,Bairro',
    '"Padaria Estrela","(11) 99999-0001","https://estrela.com.br","Centro"',
    '"Oficina Silva","11988880002","","Moema"',
    '"Oficina Silva Repetida","11988880002","","Moema"',
    '"Empresa Sem Telefone","","",""'
  ].join('\n');

  const blob = new Blob([csvData], { type: 'text/csv' });
  const formData = new FormData();
  formData.append('file', blob, 'teste_preview.csv');
  formData.append('recontactAfterDays', '30');

  const res = await fetch(`${base}/preview-import`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });

  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.totalRows, 4);
  assert.equal(body.validCount, 2);
  assert.equal(body.duplicateCount, 1);
  assert.equal(body.invalidCount, 1);
  assert.equal(body.recontactBlockedCount, 0);
  assert.equal(body.alreadyContactedCount, 1); // 1 dos válidos já foi contatado
  assert.equal(body.issues.length, 2);
  assert.equal(body.sampleLeads.length, 2);
});

test('POST /campaigns/preview-message: valida variáveis e renderiza simulação', async (t) => {
  const fakeUser = { id: 'u-1', email: 'user@test.com', role: 'ADMIN', authVersion: 0, subscriptionStatus: 'ACTIVE', emailVerifiedAt: new Date(), workspaces: [{ id: 'w-1', name: 'Agência Digital' }] };
  mockMethod(t, prisma.user, 'findUnique', async () => fakeUser);
  mockMethod(t, prisma.workspace, 'findUnique', async () => ({ id: 'w-1', name: 'Agência Digital', user: { name: 'João Dev' } }));

  const token = jwt.sign({ userId: 'u-1', authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' });
  const base = await serveCampaigns(t);

  // 1. Template válido com spintax e variáveis oficiais
  const validRes = await fetch(`${base}/preview-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      messageComSite: 'Olá {nome}! Vi seu site {website} em {bairro}. Meu nome é {meuNome} da {minhaEmpresa}.',
      messageSemSite: '{Oi|Olá} {nome}! Notamos que sua empresa em {bairro} não tem site.'
    })
  });

  assert.equal(validRes.status, 200);
  const validBody = await validRes.json();
  assert.equal(validBody.valid, true);
  assert.equal(validBody.previews.comSite.rendered.includes('Odonto Estética Silva'), true);
  assert.equal(validBody.previews.comSite.rendered.includes('https://odontoesteticasilva.com.br'), true);
  assert.equal(validBody.previews.comSite.rendered.includes('João Dev'), true);
  assert.equal(validBody.previews.comSite.rendered.includes('Agência Digital'), true);

  // 2. Template com variáveis desconhecidas
  const invalidRes = await fetch(`${base}/preview-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      messageComSite: 'Olá {cidade}, segue nosso contato {telefone}!'
    })
  });

  assert.equal(invalidRes.status, 200);
  const invalidBody = await invalidRes.json();
  assert.equal(invalidBody.valid, false);
  assert.equal(invalidBody.warnings.some((w: string) => w.includes('{cidade}')), true);
  assert.equal(invalidBody.warnings.some((w: string) => w.includes('{telefone}')), true);
});

test('GET /campaigns/:id/leads: retorna paginação server-side e KPIs com QUEUED', async (t) => {
  const fakeUser = { id: 'u-1', email: 'user@test.com', role: 'ADMIN', authVersion: 0, subscriptionStatus: 'ACTIVE', emailVerifiedAt: new Date(), workspaces: [{ id: 'w-1' }] };
  mockMethod(t, prisma.user, 'findUnique', async () => fakeUser);
  mockMethod(t, prisma.campaign, 'findFirst', async () => ({ id: 'c-1', workspaceId: 'w-1', name: 'Campanha 1' }));
  
  // Mock count, findMany e groupBy
  mockMethod(t, prisma.lead, 'count', async () => 3);
  mockMethod(t, prisma.lead, 'findMany', async () => [
    { id: 'lead-1', campaignId: 'c-1', title: 'Empresa A', phone: '5511999991111', status: 'QUEUED', createdAt: new Date() },
    { id: 'lead-2', campaignId: 'c-1', title: 'Empresa B', phone: '5511999992222', status: 'SENT', createdAt: new Date() }
  ]);
  mockMethod(t, prisma.lead, 'groupBy', async () => [
    { status: 'QUEUED', _count: { status: 1 } },
    { status: 'SENT', _count: { status: 1 } },
    { status: 'DELIVERED', _count: { status: 1 } }
  ]);
  mockMethod(t, prisma.dispatchHistory, 'findMany', async () => []);

  const token = jwt.sign({ userId: 'u-1', authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' });
  const base = await serveCampaigns(t);

  const res = await fetch(`${base}/c-1/leads?page=1&limit=2`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.pagination.page, 1);
  assert.equal(body.pagination.limit, 2);
  assert.equal(body.pagination.total, 3);
  assert.equal(body.pagination.totalPages, 2);
  assert.equal(body.leads.length, 2);
  assert.equal(body.counts.queued, 1);
  assert.equal(body.counts.sent, 1);
  assert.equal(body.counts.delivered, 1);
  assert.equal(body.counts.total, 3);
});
