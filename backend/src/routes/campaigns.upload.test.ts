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
  const fakeUser = { id: 'u-1', email: 'user@test.com', role: 'ADMIN', authVersion: 0, subscriptionStatus: 'ACTIVE', workspaces: [{ id: 'w-1' }] };
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
  const fakeUser = { id: 'u-1', email: 'user@test.com', role: 'ADMIN', authVersion: 0, subscriptionStatus: 'ACTIVE', workspaces: [{ id: 'w-1' }] };
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
  const fakeUser = { id: 'u-1', email: 'user@test.com', role: 'ADMIN', authVersion: 0, subscriptionStatus: 'ACTIVE', workspaces: [{ id: 'w-1' }] };
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
