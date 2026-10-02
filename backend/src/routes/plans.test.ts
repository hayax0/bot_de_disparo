import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import integrationsRouter from './integrations';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { mockMethod } from '../test-support/mockMethod';
import { QuotaService } from '../services/QuotaService';

async function setup(t: any, overrides = {}) {
  const user = {
    id: 'catalog-user',
    email: 'catalog@example.com',
    role: 'USER',
    planId: 'PRO',
    authVersion: 0,
    emailVerifiedAt: new Date(),
    workspaces: [{ id: 'ws-catalog' }],
    monthlyDispatchQuota: 0,
    dispatchesUsedInCycle: 125,
    ...overrides,
  };
  mockMethod(t, prisma.user, 'findUnique', async () => user);
  mockMethod(t, prisma.user, 'findUniqueOrThrow', async () => user);
  const app = express();
  app.use(express.json()); app.use('/integrations', integrationsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/integrations`;
  const headers = { Authorization: `Bearer ${jwt.sign({ userId: user.id, authVersion: 0 }, ENV.JWT_SECRET)}`, 'Content-Type': 'application/json' };
  return { base, headers };
}

test('catálogo autenticado: planos e pacotes aprovados sem links de checkout', async t => {
  const { base, headers } = await setup(t);
  assert.equal((await fetch(`${base}/plans`)).status, 401);
  const response = await fetch(`${base}/plans`, { headers });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.purchaseEnabled, false);
  assert.deepEqual(data.plans.map((p: any) => [p.id, p.name, p.priceCents, p.monthlyDispatches, p.monthlyCredits, p.maxWhatsappConnections]), [
    ['START', 'Essencial', 2799, 1000, 50, 1], ['PRO', 'Profissional', 5599, 3000, 150, 1], ['SCALE', 'Premium', 9599, 6000, 300, 1],
  ]);
  assert.deepEqual(data.packages.map((p: any) => [p.credits, p.priceCents]), [[100, 999], [300, 2499], [700, 4999]]);
  assert.equal(data.currentPlan.id, 'PRO');
  assert.equal(data.dispatch.remaining, 2875);
  assert.ok(!JSON.stringify(data).includes('checkoutUrl'));
});

test('checkout bloqueado no servidor mesmo com valores manipulados', async t => {
  const { base, headers } = await setup(t);
  for (const body of [{ planId: 'START' }, { packageId: 'PACKAGE_SMALL', credits: 999999, priceCents: 0 }]) {
    const response = await fetch(`${base}/checkout`, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'CHECKOUT_UNAVAILABLE');
  }
});

test('catálogo preserva benefício vitalício por papel ADMIN', async t => {
  const { base, headers } = await setup(t, { role: 'ADMIN' });
  const data = await (await fetch(`${base}/plans`, { headers })).json();
  assert.equal(data.currentPlan.id, 'ADMIN_LIFETIME');
  assert.equal(data.isUnlimited, true);
  assert.equal(data.dispatch.isUnlimited, true);
});

test('catálogo preserva legado e cotas específicas de ciclos existentes', async t => {
  const { base, headers } = await setup(t, { planId: 'LEGACY_DAVI' });
  const data = await (await fetch(`${base}/plans`, { headers })).json();
  assert.equal(data.isLegacy, true);
  assert.equal(data.currentPlan.id, 'LEGACY_DAVI');
  assert.equal(data.dispatch.isUnlimited, true);
  assert.equal((await QuotaService.canDispatch({ id: 'u', planId: 'PRO', monthlyDispatchQuota: 5000, dispatchesUsedInCycle: 4000 })).remaining, 1000);
});

test('novas franquias bloqueiam no limite de cada plano', async () => {
  for (const [planId, limit] of [['START', 1000], ['PRO', 3000], ['SCALE', 6000]] as const) {
    assert.equal((await QuotaService.canDispatch({ id: 'u', planId, dispatchesUsedInCycle: limit - 1 })).remaining, 1);
    assert.equal((await QuotaService.canDispatch({ id: 'u', planId, dispatchesUsedInCycle: limit })).allowed, false);
  }
});
