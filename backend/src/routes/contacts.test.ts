import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import contactsRouter from './contacts';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { mockMethod } from '../test-support/mockMethod';

async function serveContactsApp(t: any) {
  const app = express();
  app.use(express.json());
  app.use('/contacts', contactsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/contacts`;
}

test('POST /contacts/blacklist: rejeita criação de bloqueio GLOBAL por usuário não-admin', async (t) => {
  const regularUser = { id: 'u-user', email: 'user@test.com', role: 'USER', authVersion: 0, subscriptionStatus: 'ACTIVE', workspaces: [{ id: 'w-1' }] };
  mockMethod(t, prisma.user, 'findUnique', async () => regularUser);

  const token = jwt.sign({ userId: 'u-user', authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' });
  const base = await serveContactsApp(t);

  const res = await fetch(`${base}/blacklist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      phone: '5511999998888',
      scope: 'GLOBAL'
    })
  });

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.includes('Apenas administradores'), true);
});

test('POST /contacts/blacklist: permite criação de bloqueio WORKSPACE por usuário autenticado', async (t) => {
  const regularUser = { id: 'u-user', email: 'user@test.com', role: 'USER', authVersion: 0, subscriptionStatus: 'ACTIVE', workspaces: [{ id: 'w-1' }] };
  mockMethod(t, prisma.user, 'findUnique', async () => regularUser);
  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    return fn({
      blacklist: {
        create: async (data: any) => ({ id: 'bl-new', ...data.data })
      },
      lead: {
        updateMany: async () => ({ count: 2 })
      },
      auditLog: {
        create: async () => ({ id: 'aud-1' })
      }
    });
  });

  const token = jwt.sign({ userId: 'u-user', authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' });
  const base = await serveContactsApp(t);

  const res = await fetch(`${base}/blacklist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      phone: '5511999998888',
      scope: 'WORKSPACE'
    })
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.message.includes('sucesso'), true);
});
