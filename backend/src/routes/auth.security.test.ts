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
      findUnique: async () => ({ ...user }),
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

import { processCaktoWebhook } from '../services/SubscriptionManager';

test('Login existente continua funcionando; /me não promove usuário pela lista de e-mails', async t => {
  const user = { id: 'u', email: ENV.ADMIN_EMAILS[0], password: await bcrypt.hash('existing-password', 4),
    role: 'USER', subscriptionStatus: 'INACTIVE', emailVerifiedAt: new Date(), authVersion: 0, workspaces: [{ id: 'w' }] };
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

test('POST /register: usuário comum não pode se cadastrar sem código de verificação', async t => {
  mockMethod(t, prisma.user, 'findUnique', async () => null);
  const base = await serve(t);
  const response = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'regular_user@example.test',
      password: 'password123',
      name: 'Novo Usuário',
      termsAccepted: true
    })
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('authenticate: token antigo de conta não verificada não acessa rotas protegidas', async t => {
  const unverifiedUser = {
    id: 'u-unverified',
    email: 'unverified@example.test',
    role: 'USER',
    authVersion: 0,
    subscriptionStatus: 'ACTIVE',
    emailVerifiedAt: null, // Conta sem verificação
    workspaces: [{ id: 'w-1' }]
  };
  mockMethod(t, prisma.user, 'findUnique', async () => unverifiedUser);
  const token = jwt.sign({ userId: 'u-unverified', authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' });

  const base = await serve(t);
  const meResponse = await fetch(`${base}/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(meResponse.status, 403);
  const body = await meResponse.json();
  assert.equal(body.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('Login: conta legada paga sem confirmação é barrada após checagem de senha', async t => {
  const passHash = await bcrypt.hash('client-pass', 4);
  const unverifiedPaidUser = {
    id: 'u-paid-unverified',
    email: 'client@example.test',
    password: passHash,
    role: 'USER',
    authVersion: 0,
    subscriptionStatus: 'ACTIVE',
    emailVerifiedAt: null, // Paga mas não comprovou posse do e-mail
    workspaces: [{ id: 'w-1' }]
  };
  mockMethod(t, prisma.user, 'findUnique', async () => unverifiedPaidUser);
  const base = await serve(t);

  // Tentativa com senha correta -> bloqueado por falta de verificação com orientações de regularização
  const response = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: unverifiedPaidUser.email, password: 'client-pass' })
  });

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('Login: senha incorreta em conta não verificada retorna erro genérico sem vazar estado da conta', async t => {
  const passHash = await bcrypt.hash('correct-pass', 4);
  const unverifiedUser = {
    id: 'u-target',
    email: 'target@example.test',
    password: passHash,
    role: 'USER',
    authVersion: 0,
    subscriptionStatus: 'INACTIVE',
    emailVerifiedAt: null,
    workspaces: [{ id: 'w-1' }]
  };
  mockMethod(t, prisma.user, 'findUnique', async () => unverifiedUser);
  const base = await serve(t);

  // Invasor tentando adivinhar senha
  const response = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: unverifiedUser.email, password: 'wrong-pass' })
  });

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error, 'E-mail ou senha incorretos.');
  assert.equal(body.code, undefined); // Não revela que a conta existe nem que falta verificação
});

test('Defesa contra Hijacking: regularização pelo titular substitui a senha do invasor e invalida seus tokens', async t => {
  const email = 'victim@example.test';
  const attackerPassword = await bcrypt.hash('attacker-secret-pass', 4);
  const victimNewPassword = 'victim-safe-pass-999';
  const code = '987654';

  // Invasor pré-cadastrou a conta
  const user: any = {
    id: 'u-hijack-test',
    email,
    password: attackerPassword,
    role: 'USER',
    subscriptionStatus: 'ACTIVE',
    authVersion: 0,
    emailVerifiedAt: null, // Invasor não confirmou o e-mail
    workspaces: [{ id: 'w-1' }]
  };

  // Invasor possuía um token gerado com authVersion 0
  const attackerToken = jwt.sign({ userId: user.id, authVersion: 0 }, ENV.JWT_SECRET, { algorithm: 'HS256' });

  let record: any = {
    email,
    codeHash: crypto.createHmac('sha256', ENV.JWT_SECRET).update(`${email}:${code}`).digest('hex'),
    expiresAt: new Date(Date.now() + 600000),
    attempts: 0
  };

  mockMethod(t, prisma.user, 'findUnique', async () => user);

  let lockAcquired = false;
  const tx: any = {
    $executeRaw: async (sql: TemplateStringsArray, key: string) => {
      assert.match(sql.join(''), /pg_advisory_xact_lock/);
      if (key && key.startsWith('account:')) {
        assert.equal(key, `account:${email}`);
        lockAcquired = true;
      }
    },
    registrationVerification: {
      findUnique: async () => record,
      update: async () => { record.attempts++; },
      deleteMany: async ({ where }: any) => {
        if (!record || record.codeHash !== where.codeHash) return { count: 0 };
        record = null;
        return { count: 1 };
      }
    },
    user: {
      findUnique: async () => user,
      updateMany: async ({ where, data }: any) => {
        if (user.id !== where.id || user.password !== where.password) return { count: 0 };
        Object.assign(user, {
          password: data.password,
          authVersion: user.authVersion + 1,
          emailVerifiedAt: data.emailVerifiedAt
        });
        return { count: 1 };
      },
      findUniqueOrThrow: async () => user
    }
  };
  mockMethod(t, prisma, '$transaction', async (fn: any) => fn(tx));

  const base = await serve(t);

  // 1. O titular legítimo regulariza a conta no /register com o código de 6 dígitos do seu e-mail
  const regResponse = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: victimNewPassword, verificationCode: code, termsAccepted: true })
  });

  assert.equal(regResponse.status, 200);
  assert.equal(lockAcquired, true, 'Deve ter executado o lock account:email');
  assert.equal(record, null, 'Código de verificação deve ser consumido');
  assert.ok(user.emailVerifiedAt instanceof Date, 'Conta deve estar verificada');
  assert.equal(user.authVersion, 1, 'authVersion deve ter sido incrementado');

  // 2. Token antigo do invasor é REJEITADO
  const meWithAttackerToken = await fetch(`${base}/me`, {
    headers: { Authorization: `Bearer ${attackerToken}` }
  });
  assert.equal(meWithAttackerToken.status, 401, 'Token antigo do invasor deve ser rejeitado');

  // 3. Invasor tentando logar com sua senha antiga é REJEITADO com credenciais inválidas
  const attackerLogin = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'attacker-secret-pass' })
  });
  assert.equal(attackerLogin.status, 401);
  const attackerLoginBody = await attackerLogin.json();
  assert.equal(attackerLoginBody.error, 'E-mail ou senha incorretos.');

  // 4. Titular legítimo consegue logar normalmente com a nova senha definida
  const victimLogin = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: victimNewPassword })
  });
  assert.equal(victimLogin.status, 200);
  const victimLoginBody = await victimLogin.json();
  assert.ok(victimLoginBody.token);
  assert.ok(victimLoginBody.user.emailVerifiedAt);
});

test('Concorrência: confirmação e webhook compartilham lock account:email e ambas as ordens preservam credenciais legítimas', async t => {
  const email = 'concurrency@example.test';
  const secret = 'Test-Secret-With-Exact-Case';
  const previousSecret = ENV.CAKTO_WEBHOOK_SECRET;
  ENV.CAKTO_WEBHOOK_SECRET = secret;
  t.after(() => { ENV.CAKTO_WEBHOOK_SECRET = previousSecret; });

  const payload = {
    secret,
    event: 'purchase_approved',
    data: { id: 'evt-order-test', customer: { email } }
  };

  // --- Ordem 1: Titular confirma primeiro -> Webhook roda em seguida ---
  const userConfirmed: any = {
    id: 'u-ord-1',
    email,
    password: 'victim-verified-password-hash',
    role: 'USER',
    subscriptionStatus: 'INACTIVE',
    authVersion: 1,
    emailVerifiedAt: new Date() // Já verificado pelo titular
  };

  let lockSeen = '';
  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      $executeRaw: async (sql: TemplateStringsArray, key: string) => {
        lockSeen = key;
      },
      webhookLog: {
        findFirst: async () => null,
        create: async () => ({})
      },
      user: {
        findUnique: async () => ({ ...userConfirmed }),
        update: async ({ data }: any) => {
          Object.assign(userConfirmed, data);
          return userConfirmed;
        }
      }
    };
    return fn(tx);
  });
  mockMethod(t, prisma.subscriptionNotification, 'findUnique', async () => null);
  mockMethod(t, prisma.subscriptionNotification, 'create', async () => ({}));

  await processCaktoWebhook(payload);
  assert.equal(lockSeen, `account:${email}`, 'Lock deve usar a chave compartilhada account:email');
  assert.equal(userConfirmed.subscriptionStatus, 'ACTIVE', 'Assinatura deve ser ativada');
  assert.equal(userConfirmed.password, 'victim-verified-password-hash', 'Senha legítima verificada NÃO deve ser alterada');
  assert.equal(userConfirmed.authVersion, 1, 'authVersion NÃO deve ser incrementado');

  // --- Ordem 2: Webhook roda primeiro para conta não confirmada -> Titular confirma em seguida ---
  const userUnverified: any = {
    id: 'u-ord-2',
    email,
    password: 'attacker-old-password-hash',
    role: 'USER',
    subscriptionStatus: 'INACTIVE',
    authVersion: 0,
    emailVerifiedAt: null // Não confirmada
  };

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      $executeRaw: async (sql: TemplateStringsArray, key: string) => {
        lockSeen = key;
      },
      webhookLog: {
        findFirst: async () => null,
        create: async () => ({})
      },
      user: {
        findUnique: async () => ({ ...userUnverified }),
        update: async ({ data }: any) => {
          Object.assign(userUnverified, data);
          return userUnverified;
        }
      }
    };
    return fn(tx);
  });

  await processCaktoWebhook(payload);
  assert.equal(userUnverified.subscriptionStatus, 'ACTIVE');
  assert.ok(userUnverified.password.startsWith('$WEBHOOK_TEMP$'), 'Senha de conta não verificada deve ser substituída por temporária');
  assert.deepEqual(userUnverified.authVersion, { increment: 1 }, 'authVersion deve ser incrementado para invalidar invasor');
});
