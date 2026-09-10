import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authenticate, requireRole, requireActiveSubscription } from './auth';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { mockMethod } from '../test-support/mockMethod';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.data = payload;
      return this;
    }
  };
  return res;
}

test('authenticate: sem token retorna 401', async (t) => {
  const req: any = { headers: {} };
  const res = createMockRes();
  let nextCalled = false;

  await authenticate(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(res.data.error, 'Não autorizado. Faça login para continuar.');
  assert.equal(nextCalled, false);
});

test('authenticate: token válido carrega usuário e workspace do banco', async (t) => {
  const fakeUser = {
    id: 'u-abc',
    email: 'cliente@empresa.com',
    role: 'USER',
    authVersion: 1,
    subscriptionStatus: 'ACTIVE',
    workspaces: [{ id: 'ws-123' }]
  };

  mockMethod(t, prisma.user, 'findUnique', async () => fakeUser);

  const token = jwt.sign(
    { userId: 'u-abc', authVersion: 1 },
    ENV.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  const req: any = { headers: { authorization: `Bearer ${token}` } };
  const res = createMockRes();
  let nextCalled = false;

  await authenticate(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.ok(req.user);
  assert.equal(req.user.userId, 'u-abc');
  assert.equal(req.user.workspaceId, 'ws-123');
  assert.equal(req.user.role, 'USER');
  assert.equal(req.user.authVersion, 1);
});

test('authenticate: authVersion desatualizado (troca de senha) invalida sessão com 401', async (t) => {
  // Usuário no banco agora está na versão 2 (após reset de senha)
  const fakeUser = {
    id: 'u-abc',
    email: 'cliente@empresa.com',
    role: 'USER',
    authVersion: 2,
    subscriptionStatus: 'ACTIVE',
    workspaces: [{ id: 'ws-123' }]
  };

  mockMethod(t, prisma.user, 'findUnique', async () => fakeUser);

  // Token emitido antes do reset com authVersion 1
  const token = jwt.sign(
    { userId: 'u-abc', authVersion: 1 },
    ENV.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  const req: any = { headers: { authorization: `Bearer ${token}` } };
  const res = createMockRes();
  let nextCalled = false;

  await authenticate(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.data.error, 'Sessão expirada devido à alteração de credenciais. Faça login novamente.');
});

test('authenticate: retrocompatibilidade para contas existentes com authVersion: 0', async (t) => {
  const fakeUser = {
    id: 'u-old',
    email: 'antigo@empresa.com',
    role: 'USER',
    authVersion: 0,
    subscriptionStatus: 'ACTIVE',
    workspaces: [{ id: 'ws-old' }]
  };

  mockMethod(t, prisma.user, 'findUnique', async () => fakeUser);

  // Token legado sem authVersion no payload
  const token = jwt.sign(
    { userId: 'u-old' },
    ENV.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  const req: any = { headers: { authorization: `Bearer ${token}` } };
  const res = createMockRes();
  let nextCalled = false;

  await authenticate(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.user.userId, 'u-old');
  assert.equal(req.user.authVersion, 0);
});

test('requireRole: bloqueia se a role não for permitida', () => {
  const guard = requireRole(['ADMIN']);

  const reqUser: any = { user: { role: 'USER' } };
  const res = createMockRes();
  let nextCalled = false;

  guard(reqUser, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.data.error, 'Acesso não autorizado para o seu perfil.');
});

test('requireRole: permite se a role estiver na lista', () => {
  const guard = requireRole(['ADMIN', 'SUPERVISOR']);

  const reqUser: any = { user: { role: 'ADMIN' } };
  const res = createMockRes();
  let nextCalled = false;

  guard(reqUser, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});
