import { mockMethod } from '../test-support/mockMethod';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import router from './auth';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';

async function serve(t: any) {
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => { server.close(err => err ? reject(err) : resolve()); server.closeAllConnections(); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`;
}

function makeToken(userId: string, workspaceId: string, authVersion = 0) {
  return jwt.sign(
    { userId, workspaceId, authVersion, role: 'USER' },
    ENV.JWT_SECRET,
    { algorithm: 'HS256' }
  );
}

test('PATCH /auth/workspace: atualiza nome da empresa com sucesso para o usuário autenticado', async t => {
  const userId = 'user-123';
  const workspaceId = 'ws-456';
  const token = makeToken(userId, workspaceId);

  mockMethod(t, prisma.user, 'findUnique', async () => ({
    id: userId,
    email: 'user@example.test',
    authVersion: 0,
    role: 'USER',
    subscriptionStatus: 'ACTIVE',
    emailVerifiedAt: new Date(),
    workspaces: [{ id: workspaceId, name: 'Empresa Antiga' }]
  }));

  mockMethod(t, prisma.workspace, 'findFirst', async ({ where }: any) => {
    if (where.id === workspaceId && where.userId === userId) {
      return { id: workspaceId, name: 'Empresa Antiga', userId };
    }
    return null;
  });

  const updateMock = mockMethod(t, prisma.workspace, 'update', async ({ where, data }: any) => {
    assert.equal(where.id, workspaceId);
    assert.equal(data.name, 'Agência Alta Conversão');
    return { id: workspaceId, name: data.name, updatedAt: new Date() };
  });

  const base = await serve(t);
  const response = await fetch(`${base}/workspace`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name: '  Agência Alta Conversão  ' })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.workspace.name, 'Agência Alta Conversão');
  assert.equal(updateMock.mock.callCount(), 1);
});

test('GET /auth/workspace: retorna dados do workspace do usuário autenticado', async t => {
  const userId = 'user-123';
  const workspaceId = 'ws-456';
  const token = makeToken(userId, workspaceId);

  mockMethod(t, prisma.user, 'findUnique', async () => ({
    id: userId,
    email: 'user@example.test',
    authVersion: 0,
    role: 'USER',
    subscriptionStatus: 'ACTIVE',
    emailVerifiedAt: new Date(),
    workspaces: [{ id: workspaceId, name: 'Minha Empresa Ltda' }]
  }));

  mockMethod(t, prisma.workspace, 'findFirst', async ({ where }: any) => {
    if (where.id === workspaceId && where.userId === userId) {
      return { id: workspaceId, name: 'Minha Empresa Ltda', createdAt: new Date(), updatedAt: new Date() };
    }
    return null;
  });

  const base = await serve(t);
  const response = await fetch(`${base}/workspace`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.workspace.name, 'Minha Empresa Ltda');
});

test('PATCH /auth/workspace: rejeita nome vazio ou menor que 2 caracteres', async t => {
  const userId = 'user-123';
  const workspaceId = 'ws-456';
  const token = makeToken(userId, workspaceId);

  mockMethod(t, prisma.user, 'findUnique', async () => ({
    id: userId,
    email: 'user@example.test',
    authVersion: 0,
    role: 'USER',
    emailVerifiedAt: new Date(),
    workspaces: [{ id: workspaceId, name: 'Empresa Antiga' }]
  }));

  const base = await serve(t);
  const response = await fetch(`${base}/workspace`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name: '   ' })
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.includes('caracteres'), true);
});

test('PATCH /auth/workspace: impede alteração de workspace que pertence a outro usuário', async t => {
  const userId = 'user-123';
  const victimWorkspaceId = 'ws-victim';
  const token = makeToken(userId, victimWorkspaceId);

  mockMethod(t, prisma.user, 'findUnique', async () => ({
    id: userId,
    email: 'user@example.test',
    authVersion: 0,
    role: 'USER',
    emailVerifiedAt: new Date(),
    workspaces: [{ id: victimWorkspaceId, name: 'Outra Empresa' }]
  }));

  mockMethod(t, prisma.workspace, 'findFirst', async () => null);

  const base = await serve(t);
  const response = await fetch(`${base}/workspace`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name: 'Tentativa de Hack' })
  });

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error.includes('Workspace não encontrado'), true);
});
