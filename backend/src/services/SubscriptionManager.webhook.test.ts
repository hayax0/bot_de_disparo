import { mockMethod } from '../test-support/mockMethod';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { EmailService } from './EmailService';
import { processCaktoWebhook, validateWebhookSecret } from './SubscriptionManager';

const secret = 'Test-Secret-With-Exact-Case';
const payload = (id = 'event-1') => ({ secret, event: 'purchase_approved', data: { id, customer: { email: 'buyer@example.test' } } });

test('Webhook: sem segredo, segredo errado, variação de caixa e segredos antigos são rejeitados', () => {
  const previous = ENV.CAKTO_WEBHOOK_SECRET;
  ENV.CAKTO_WEBHOOK_SECRET = secret;
  try {
    for (const invalid of [undefined, '', 'wrong', secret.toLowerCase(), 'cakto_webhook_secreto_2026', 'cabe1689-18f6-409b-9f95-0bd29a214cc6']) {
      assert.throws(() => validateWebhookSecret({ event: 'purchase_approved', data: payload().data, ...(invalid === undefined ? {} : { secret: invalid }) }), { status: 401 });
    }
    assert.doesNotThrow(() => validateWebhookSecret(payload()));
    assert.doesNotThrow(() => validateWebhookSecret({ event: 'purchase_approved', data: payload().data }, { authorization: `Bearer ${secret}` }));
    ENV.CAKTO_WEBHOOK_SECRET = '';
    assert.throws(() => validateWebhookSecret(payload()), { status: 503 });
  } finally { ENV.CAKTO_WEBHOOK_SECRET = previous; }
});

test('Webhook real: rollback permite repetir pagamento e resposta/auditoria não expõem credenciais', async t => {
  const previous = ENV.CAKTO_WEBHOOK_SECRET;
  ENV.CAKTO_WEBHOOK_SECRET = secret;
  t.after(() => { ENV.CAKTO_WEBHOOK_SECRET = previous; });
  let logs: any[] = [];
  let user = { id: 'u', email: 'buyer@example.test', password: 'private-hash', role: 'USER', subscriptionStatus: 'INACTIVE' };
  let fail = true;
  let committed = false;
  mockMethod(t, prisma, '$transaction', async (operation: any) => {
    const pendingLogs = [...logs];
    let pendingUser = { ...user };
    const tx = {
      $executeRaw: async () => 1,
      webhookLog: {
        findFirst: async ({ where }: any) => pendingLogs.find(log => log.eventId === where.eventId && log.event === where.event),
        create: async ({ data }: any) => { pendingLogs.push(data); },
      },
      user: {
        findUnique: async () => ({ ...pendingUser }),
        update: async ({ data }: any) => {
          if (fail) throw new Error('database write failed');
          pendingUser = { ...pendingUser, ...data };
          return pendingUser;
        },
      },
    };
    const result = await operation(tx);
    logs = pendingLogs;
    user = pendingUser;
    committed = true;
    return result;
  });
  mockMethod(t, prisma.subscriptionNotification, 'findUnique', async () => null);
  mockMethod(t, prisma.subscriptionNotification, 'create', async () => ({}));
  let mails = 0;
  mockMethod(t, EmailService, 'sendWelcomeEmail', async () => { assert.equal(committed, true); mails++; return { success: true }; });
  await assert.rejects(processCaktoWebhook(payload()), /database write failed/);
  assert.equal(logs.length, 0);
  assert.equal(user.subscriptionStatus, 'INACTIVE');
  assert.equal(mails, 0);
  fail = false;
  const response = await processCaktoWebhook(payload());
  assert.equal(user.subscriptionStatus, 'ACTIVE');
  assert.equal(logs.length, 1);
  assert.equal(mails, 1);
  assert.deepEqual(Object.keys(response).sort(), ['message', 'success']);
  assert.ok(!JSON.stringify(logs).includes(secret));
  assert.ok(!JSON.stringify(response).includes('private-hash'));
  await processCaktoWebhook(payload());
  assert.equal(logs.length, 1);
  assert.equal(mails, 1);
});

test('Webhook: IDs ausentes não são marcados processados', async t => {
  const previous = ENV.CAKTO_WEBHOOK_SECRET;
  ENV.CAKTO_WEBHOOK_SECRET = secret;
  t.after(() => { ENV.CAKTO_WEBHOOK_SECRET = previous; });
  mockMethod(t, prisma, '$transaction', async (operation: any) => operation({ $executeRaw: async () => 1 }));
  await assert.rejects(processCaktoWebhook({ secret, event: 'subscription_renewed', data: { subscription: { id: 'sub' }, customer: { email: 'buyer@example.test' } } }), { status: 400 });
});

test('Webhook concorrente: lock por cliente evita aplicar duas vezes o mesmo evento', async t => {
  const previous = ENV.CAKTO_WEBHOOK_SECRET;
  ENV.CAKTO_WEBHOOK_SECRET = secret;
  t.after(() => { ENV.CAKTO_WEBHOOK_SECRET = previous; });
  let gate = Promise.resolve();
  const logs: any[] = [];
  let updates = 0;
  mockMethod(t, prisma, '$transaction', async (operation: any) => {
    let release = () => {};
    const pending: any[] = [];
    const tx = {
      $executeRaw: async (sql: TemplateStringsArray, key: string) => {
        assert.match(sql.join(''), /pg_advisory_xact_lock/);
        assert.equal(key, 'subscription:buyer@example.test');
        const previousGate = gate;
        gate = new Promise<void>(resolve => { release = resolve; });
        await previousGate;
      },
      webhookLog: {
        findFirst: async ({ where }: any) => logs.find(log => log.eventId === where.eventId && log.event === where.event),
        create: async ({ data }: any) => { pending.push(data); },
      },
      user: {
        findUnique: async () => ({ id: 'u', role: 'ADMIN', subscriptionStatus: 'LIFETIME' }),
        update: async () => { updates++; return {}; },
      },
    };
    try { const result = await operation(tx); logs.push(...pending); return result; }
    finally { release(); }
  });
  const responses = await Promise.all([processCaktoWebhook(payload()), processCaktoWebhook(payload())]);
  assert.ok(responses.every(result => result.success));
  assert.equal(updates, 1);
  assert.equal(logs.length, 1);
});
