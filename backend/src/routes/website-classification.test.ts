import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import campaignsRouter from './campaigns';
import historyRouter from './history';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { mockMethod } from '../test-support/mockMethod';

const cases = [
  { website: 'https://api.whatsapp.com/send?phone=5521989399273', hasWebsite: false },
  { website: 'https://wa.me/5521989399273', hasWebsite: false },
  { website: 'https://www.instagram.com/empresa', hasWebsite: false },
  { website: 'https://facebook.com/empresa', hasWebsite: false },
  { website: 'https://linktr.ee/empresa', hasWebsite: false },
  { website: 'https://maps.app.goo.gl/abc', hasWebsite: false },
  { website: 'https://empresa.com.br', hasWebsite: true },
  { website: null, hasWebsite: false },
];
async function serve(t: any) {
  mockMethod(t, prisma.user, 'findUnique', async () => ({ id: 'owner', email: 'owner@test.local', role: 'USER', authVersion: 0, subscriptionStatus: 'ACTIVE', emailVerifiedAt: new Date(), workspaces: [{ id: 'workspace' }] }));
  const app = express(); app.use('/campaigns', campaignsRouter); app.use('/history', historyRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, headers: { Authorization: `Bearer ${jwt.sign({ userId: 'owner', authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' })}` } };
}

test('Monitoramento retorna classificação canônica de site e preserva URLs originais', async t => {
  const leads = cases.map((item, i) => ({ id: `lead-${i}`, title: 'Empresa', website: item.website, phone: `552199999000${i}`, status: 'PENDING' }));
  mockMethod(t, prisma.campaign, 'findFirst', async (query: any) => { assert.equal(query.where.workspaceId, 'workspace'); return { id: 'campaign', workspaceId: 'workspace' }; });
  mockMethod(t, prisma.lead, 'count', async () => leads.length);
  mockMethod(t, prisma.lead, 'findMany', async () => leads);
  mockMethod(t, prisma.lead, 'groupBy', async () => []);
  mockMethod(t, prisma.dispatchHistory, 'findMany', async () => []);
  const { base, headers } = await serve(t);
  const response = await fetch(`${base}/campaigns/campaign/leads`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.leads.map((lead: any) => ({ website: lead.website, hasWebsite: lead.hasWebsite })), cases);
  assert.ok(leads.every(lead => !('hasWebsite' in lead)), 'A projeção não pode modificar registros originais');
});

test('Histórico não transforma links de contato/redes sociais em site próprio', async t => {
  mockMethod(t, prisma.dispatchHistory, 'findMany', async (query: any) => { assert.equal(query.where.workspaceId, 'workspace'); return cases.map((item, i) => ({ id: `history-${i}`, website: item.website })); });
  mockMethod(t, prisma.dispatchHistory, 'count', async () => cases.length);
  mockMethod(t, prisma.dispatchHistory, 'aggregate', async () => ({ _sum: { sendCount: cases.length } }));
  const { base, headers } = await serve(t);
  const response = await fetch(`${base}/history`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.items.map((item: any) => ({ website: item.website, hasWebsite: item.hasWebsite })), cases);
});
