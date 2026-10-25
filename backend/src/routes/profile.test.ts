import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import router from './profile';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';

const profile = { professionalName: 'Ana', workMode: 'SELF_EMPLOYED', companyName: '', services: 'Criação de sites profissionais', targetAudience: 'Clínicas locais', objective: 'Agendar uma demonstração' };

test('Perfil profissional: isolamento real, validação, adiamento e preservação da conta', async t => {
  const db = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  assert.equal(db[0]?.name, 'bot_prospeccao_test');
  const users = await Promise.all(['a', 'b'].map(suffix => prisma.user.create({ data: {
    email: `profile-${randomUUID()}-${suffix}@test.local`, password: 'hash-original', name: 'Nome original',
    emailVerifiedAt: new Date(), subscriptionStatus: 'ACTIVE', planId: 'PRO', monthlyDispatchQuota: 3000,
    dispatchesUsedInCycle: 123, subscriptionExpiresAt: new Date(Date.now() + 86400000),
    workspaces: { create: { name: 'Empresa anterior' } }, wallet: { create: { monthlyBalance: 45, purchasedBalance: 12 } },
  } })));
  t.after(async () => { await prisma.workspace.deleteMany({ where: { userId: { in: users.map(u => u.id) } } }); await prisma.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } }); });
  const before = await prisma.user.findUnique({ where: { id: users[0]!.id }, include: { wallet: true, workspaces: true } });
  const app = express(); app.use(express.json()); app.use('/profile', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/profile`;
  const request = (user: number, method = 'GET', body?: unknown, path = '') => fetch(base + path, { method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ userId: users[user]!.id, authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' })}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await fetch(base)).status, 401);
  assert.deepEqual(await (await request(0)).json(), { profile: null });
  assert.equal((await request(0, 'POST', {}, '/defer')).status, 200);
  let current = (await (await request(0)).json()).profile;
  assert.ok(current.dismissedAt); assert.equal(current.completedAt, null);
  assert.equal((await request(0, 'PUT', { ...profile, userId: users[1]!.id })).status, 400);
  assert.equal((await request(0, 'PUT', { ...profile, workMode: 'EMPLOYEE' })).status, 400);
  assert.equal((await request(0, 'PUT', { ...profile, services: 'x'.repeat(1001) })).status, 400);
  assert.equal((await request(0, 'PUT', profile)).status, 200);
  current = (await (await request(0)).json()).profile;
  assert.ok(current.completedAt); assert.equal(current.dismissedAt, null); assert.equal(current.userId, users[0]!.id);
  assert.deepEqual(await (await request(1)).json(), { profile: null });
  assert.equal((await request(0, 'PUT', { ...profile, workMode: 'BUSINESS_OWNER', companyName: 'Empresa nova', professionalName: 'Ana Silva' })).status, 200);
  assert.equal((await (await request(0)).json()).profile.companyName, 'Empresa nova');
  const after = await prisma.user.findUnique({ where: { id: users[0]!.id }, include: { wallet: true, workspaces: true } });
  assert.deepEqual(after, before, 'Perfil não pode alterar conta, assinatura, carteira ou workspace');
});
