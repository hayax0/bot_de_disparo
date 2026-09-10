import { mockMethod } from '../test-support/mockMethod';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import router from './auth';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';

ENV.ADMIN_EMAILS = ['caiocampos1009@gmail.com', 'admin@example.test'];

async function serve(t: any) {
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => { server.close(err => err ? reject(err) : resolve()); server.closeAllConnections(); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`;
}

test('POST /register: conta de pagamento não pode receber senha sem comprovar e-mail', async t => {
  mockMethod(t, prisma.user, 'findUnique', async () => ({ id: 'u', password: '$WEBHOOK_TEMP$random', workspaces: [{ id: 'w' }] }));
  const update = mockMethod(t, prisma.user, 'update', async () => { throw new Error('Não deveria atualizar'); });
  const base = await serve(t);
  const response = await fetch(`${base}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'buyer@example.test', password: 'new-password', termsAccepted: true }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'EMAIL_VERIFICATION_REQUIRED');
  assert.equal(update.mock.callCount(), 0);
});

test('POST /register: endereço administrativo não concede ADMIN sem código', async t => {
  mockMethod(t, prisma.user, 'findUnique', async () => null);
  const create = mockMethod(t, prisma.user, 'create', async () => { throw new Error('Não deveria criar'); });
  const base = await serve(t);
  const response = await fetch(`${base}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ENV.ADMIN_EMAILS[0], password: 'new-password', termsAccepted: true }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'EMAIL_VERIFICATION_REQUIRED');
  assert.equal(create.mock.callCount(), 0);
});

test('POST /register: código válido ativa conta paga e não pode redefinir a senha novamente', async t => {
  const email = 'buyer@example.test';
  const code = '123456';
  const user: any = { id: 'u', email, password: '$WEBHOOK_TEMP$random', role: 'USER', subscriptionStatus: 'ACTIVE', workspaces: [{ id: 'w' }] };
  let record: any = { email, codeHash: crypto.createHmac('sha256', ENV.JWT_SECRET).update(`${email}:${code}`).digest('hex'), expiresAt: new Date(Date.now() + 600000), attempts: 0 };
  mockMethod(t, prisma.user, 'findUnique', async () => ({ ...user }));
  const tx: any = {
    $executeRaw: async () => 1,
    registrationVerification: {
      findUnique: async () => record,
      update: async () => { record.attempts++; },
      deleteMany: async ({ where }: any) => {
        if (!record || record.codeHash !== where.codeHash) return { count: 0 };
        record = null; return { count: 1 };
      },
    },
    user: {
      updateMany: async ({ where, data }: any) => {
        if (user.password !== where.password) return { count: 0 };
        Object.assign(user, data); return { count: 1 };
      },
      findUniqueOrThrow: async () => user,
    },
  };
  mockMethod(t, prisma, '$transaction', async (fn: any) => fn(tx));
  const base = await serve(t);
  const register = () => fetch(`${base}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'new-password', verificationCode: code, termsAccepted: true }) });
  const response = await register();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.subscriptionStatus, 'ACTIVE');
  assert.equal(body.user.password, undefined);
  assert.ok(await bcrypt.compare('new-password', user.password));
  assert.equal(record, null);
  assert.equal((await register()).status, 400);
});

test('Login existente continua funcionando; /me não promove usuário pela lista de e-mails', async t => {
  const user = { id: 'u', email: ENV.ADMIN_EMAILS[0], password: await bcrypt.hash('existing-password', 4),
    role: 'USER', subscriptionStatus: 'INACTIVE', workspaces: [{ id: 'w' }] };
  mockMethod(t, prisma.user, 'findUnique', async () => user);
  const update = mockMethod(t, prisma.user, 'update', async () => { throw new Error('Não deveria promover'); });
  const base = await serve(t);
  const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'existing-password' }) });
  assert.equal(login.status, 200);
  const body = await login.json();
  assert.equal(body.user.role, 'USER');
  assert.equal(body.user.password, undefined);
  assert.ok(jwt.verify(body.token, ENV.JWT_SECRET));
  const me = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.role, 'USER');
  assert.equal(update.mock.callCount(), 0);
});
