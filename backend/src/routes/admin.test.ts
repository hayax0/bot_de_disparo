import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireAdmin } from './admin';
import { isUserAdmin } from '../services/SubscriptionManager';
import { ENV } from '../config/env';
import { prisma } from '../lib/prisma';
import { mockMethod } from '../test-support/mockMethod';

ENV.ADMIN_EMAILS = [
  'caiocampos1009@gmail.com',
  'vitoriacampos241003@gmail.com',
  'vieiralacerda192@gmail.com',
  'vmariacamll@gmail.com',
  'dyonsonandrade@gmail.com'
];

test('Admin Security: requireAdmin rejeita requisição sem autenticação (401)', async () => {
  let statusReceived = 0;
  let jsonReceived: any = null;

  const req: any = { user: undefined };
  const res: any = {
    status: (s: number) => {
      statusReceived = s;
      return {
        json: (j: any) => { jsonReceived = j; }
      };
    }
  };

  await requireAdmin(req, res, () => {
    assert.fail('next() não deveria ser chamado para usuário não autenticado');
  });

  assert.equal(statusReceived, 401);
  assert.equal(jsonReceived?.error, 'Não autenticado.');
});

test('Admin Security: isUserAdmin reconhece estritamente os admins autorizados', () => {
  assert.equal(isUserAdmin('caiocampos1009@gmail.com'), true);
  assert.equal(isUserAdmin('vieiralacerda192@gmail.com'), true);
  assert.equal(isUserAdmin('usuario_comum@gmail.com'), false);
  assert.equal(isUserAdmin('hacker@invasao.com'), false);
});

test('Admin Security: ADMIN fora da lista ADMIN_EMAILS deve retornar 403', async (t) => {
  mockMethod(t, prisma.user, 'findUnique', async () => ({
    id: 'user-admin-fora',
    email: 'admin_estranho@invasor.com',
    role: 'ADMIN',
    emailVerifiedAt: new Date()
  }));

  let statusReceived = 0;
  let jsonReceived: any = null;
  const req: any = { user: { userId: 'user-admin-fora' } };
  const res: any = {
    status: (s: number) => {
      statusReceived = s;
      return { json: (j: any) => { jsonReceived = j; } };
    }
  };

  let nextCalled = false;
  await requireAdmin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false, 'next() não deve ser chamado para ADMIN fora da lista');
  assert.equal(statusReceived, 403);
  assert.equal(jsonReceived?.error, 'Acesso estritamente restrito a administradores.');
});

test('Admin Security: USER dentro da lista ADMIN_EMAILS deve retornar 403', async (t) => {
  mockMethod(t, prisma.user, 'findUnique', async () => ({
    id: 'user-na-lista',
    email: 'caiocampos1009@gmail.com', // Dentro da lista, mas com role USER
    role: 'USER',
    emailVerifiedAt: new Date()
  }));

  let statusReceived = 0;
  let jsonReceived: any = null;
  const req: any = { user: { userId: 'user-na-lista' } };
  const res: any = {
    status: (s: number) => {
      statusReceived = s;
      return { json: (j: any) => { jsonReceived = j; } };
    }
  };

  let nextCalled = false;
  await requireAdmin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false, 'next() não deve ser chamado para USER mesmo estando na lista');
  assert.equal(statusReceived, 403);
  assert.equal(jsonReceived?.error, 'Acesso estritamente restrito a administradores.');
});

test('Admin Security: ADMIN dentro da lista ADMIN_EMAILS deve ter acesso permitido', async (t) => {
  mockMethod(t, prisma.user, 'findUnique', async () => ({
    id: 'admin-legitimo',
    email: 'caiocampos1009@gmail.com',
    role: 'ADMIN',
    emailVerifiedAt: new Date()
  }));

  let statusReceived = 0;
  const req: any = { user: { userId: 'admin-legitimo' } };
  const res: any = {
    status: (s: number) => {
      statusReceived = s;
      return { json: () => {} };
    }
  };

  let nextCalled = false;
  await requireAdmin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true, 'next() DEVE ser chamado para ADMIN dentro da lista');
  assert.equal(statusReceived, 0, 'Nenhum erro de status deve ser emitido');
});
