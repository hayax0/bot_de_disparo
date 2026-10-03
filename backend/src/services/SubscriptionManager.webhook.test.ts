import { mockMethod } from '../test-support/mockMethod';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { EmailService } from './EmailService';
import { processCaktoWebhook, validateWebhookSecret } from './SubscriptionManager';
import { QuotaService } from './QuotaService';
import { CreditWalletService } from './CreditWalletService';

const secret = 'Test-Secret-With-Exact-Case';
const payload = (id = 'event-1', offer_id = '1165278') => ({ secret, event: 'purchase_approved', data: { id, offer_id, customer: { email: 'buyer@example.test' } } });

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
        assert.equal(key, 'account:buyer@example.test');
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

test('Webhook comercial: compra de plano atualiza planoId, franquia de disparos e concede creditos mensais', async t => {
  const previous = ENV.CAKTO_WEBHOOK_SECRET;
  ENV.CAKTO_WEBHOOK_SECRET = secret;
  t.after(() => { ENV.CAKTO_WEBHOOK_SECRET = previous; });

  let updatedUser: any = null;
  let grantedCredits: any = null;
  let resetQuota: any = null;

  mockMethod(t, prisma, '$transaction', async (operation: any) => {
    const tx = {
      $executeRaw: async () => 1,
      webhookLog: {
        findFirst: async () => null,
        create: async () => ({}),
      },
      user: {
        findUnique: async () => ({
          id: 'u-subscriber',
          email: 'pro@example.test',
          role: 'USER',
          planId: 'START',
          subscriptionStatus: 'ACTIVE',
        }),
        update: async ({ data }: any) => {
          updatedUser = data;
          return { id: 'u-subscriber', email: 'pro@example.test', ...data };
        },
      },
    };
    return await operation(tx);
  });

  mockMethod(t, QuotaService, 'resetCycleDispatches', async (_userId: string, quota?: number) => {
    resetQuota = quota;
  });

  mockMethod(t, CreditWalletService, 'grantMonthlyCredits', async (params: any) => {
    grantedCredits = params;
    return { success: true, grantedAmount: params.amount };
  });

  mockMethod(t, prisma.subscriptionNotification, 'findUnique', async () => ({ id: 'already' }));

  const planPayload = {
    secret,
    event: 'purchase_approved',
    data: {
      id: 'tx-plan-pro',
      offer_id: '1165278', // PRO offer id
      product: { name: 'Plano Profissional' },
      customer: { email: 'pro@example.test', name: 'Pro User' },
    },
  };

  const res = await processCaktoWebhook(planPayload);
  assert.equal(res.success, true);
  assert.equal(updatedUser.planId, 'PRO');
  assert.equal(updatedUser.monthlyDispatchQuota, 3000);
  assert.equal(resetQuota, 3000);
  assert.equal(grantedCredits.amount, 150);
});

test('Webhook comercial: compra de recarga concede creditos comprados e cria pedido', async t => {
  const previous = ENV.CAKTO_WEBHOOK_SECRET;
  ENV.CAKTO_WEBHOOK_SECRET = secret;
  t.after(() => { ENV.CAKTO_WEBHOOK_SECRET = previous; });

  let grantedPackage: any = null;
  let purchaseOrder: any = null;

  mockMethod(t, prisma, '$transaction', async (operation: any) => {
    const tx = {
      $executeRaw: async () => 1,
      webhookLog: {
        findFirst: async () => null,
        create: async () => ({}),
      },
      creditPurchaseOrder: {
        upsert: async ({ create }: any) => {
          purchaseOrder = create;
          return create;
        },
      },
      user: {
        findUnique: async () => ({
          id: 'u-credits',
          email: 'credits@example.test',
          role: 'USER',
          planId: 'PRO',
          subscriptionStatus: 'ACTIVE',
        }),
        update: async ({ data }: any) => ({ id: 'u-credits', ...data }),
      },
    };
    return await operation(tx);
  });

  mockMethod(t, CreditWalletService, 'grantPurchasedCredits', async (params: any) => {
    grantedPackage = params;
    return { success: true, newPurchasedBalance: params.amount };
  });

  const pkgPayload = {
    secret,
    event: 'purchase_approved',
    data: {
      id: 'tx-pkg-300',
      offer_id: '1165367', // PACKAGE_MEDIUM offer id (300 créditos)
      product: { name: '300 Créditos de IA — Recarga Avulsa' },
      customer: { email: 'credits@example.test', name: 'Credit Buyer' },
    },
  };

  const res = await processCaktoWebhook(pkgPayload);
  assert.equal(res.success, true);
  assert.equal(grantedPackage.amount, 300);
  assert.equal(purchaseOrder.packageId, 'PACKAGE_MEDIUM');
  assert.equal(purchaseOrder.credits, 300);
  assert.equal(purchaseOrder.priceCents, 2499);
});

test('Webhook comercial: produtos desconhecidos ou substrings de nomes são estritamente rejeitados com 400', async t => {
  const previous = ENV.CAKTO_WEBHOOK_SECRET;
  ENV.CAKTO_WEBHOOK_SECRET = secret;
  t.after(() => { ENV.CAKTO_WEBHOOK_SECRET = previous; });

  mockMethod(t, prisma, '$transaction', async (operation: any) => {
    const tx = {
      $executeRaw: async () => 1,
      webhookLog: { findFirst: async () => null, create: async () => ({}) },
      user: { findUnique: async () => null, create: async () => ({}) },
    };
    return await operation(tx);
  });

  // Produto desconhecido contendo substring "pro"
  const unknownProPayload = {
    secret,
    event: 'purchase_approved',
    data: {
      id: 'tx-unknown-1',
      product: { name: 'Produto desconhecido' },
      customer: { email: 'buyer@example.test' }
    }
  };
  await assert.rejects(processCaktoWebhook(unknownProPayload), { status: 400 });

  // Produto não cadastrado contendo "1000 disparos mensais"
  const unknown1000Payload = {
    secret,
    event: 'purchase_approved',
    data: {
      id: 'tx-unknown-2',
      product: { name: '1000 disparos mensais' },
      customer: { email: 'buyer@example.test' }
    }
  };
  await assert.rejects(processCaktoWebhook(unknown1000Payload), { status: 400 });
});

test('Webhook comercial: reembolso de recarga estorna creditos e atualiza pedido sem cancelar assinatura', async t => {
  const previous = ENV.CAKTO_WEBHOOK_SECRET;
  ENV.CAKTO_WEBHOOK_SECRET = secret;
  t.after(() => { ENV.CAKTO_WEBHOOK_SECRET = previous; });

  let userStatus = 'ACTIVE';
  let orderStatus = 'PAID';
  let revokedParams: any = null;

  mockMethod(t, prisma, '$transaction', async (operation: any) => {
    const tx = {
      $executeRaw: async () => 1,
      webhookLog: { findFirst: async () => null, create: async () => ({}) },
      user: {
        findUnique: async () => ({
          id: 'u-subscriber',
          email: 'sub@example.test',
          subscriptionStatus: userStatus,
          subscriptionExpiresAt: new Date(Date.now() + 86400000),
          planId: 'PRO',
        }),
        update: async ({ data }: any) => {
          if (data.subscriptionStatus) userStatus = data.subscriptionStatus;
          return { id: 'u-subscriber', subscriptionStatus: userStatus };
        },
      },
      creditPurchaseOrder: {
        findFirst: async () => ({
          id: 'order-123',
          userId: 'u-subscriber',
          packageId: 'PACKAGE_SMALL',
          credits: 100,
          status: orderStatus,
          caktoOrderId: 'tx-refund-pkg',
        }),
        update: async ({ data }: any) => {
          orderStatus = data.status;
          return { id: 'order-123', status: orderStatus };
        },
      },
    };
    return await operation(tx);
  });

  mockMethod(t, CreditWalletService, 'revokePurchasedCredits', async (params: any) => {
    revokedParams = params;
    return { success: true, revokedAmount: 100, newPurchasedBalance: 0 };
  });

  const refundPayload = {
    secret,
    event: 'purchase_refunded',
    data: {
      id: 'tx-refund-pkg',
      offer_id: '1165355', // PACKAGE_SMALL
      customer: { email: 'sub@example.test' }
    }
  };

  const res = await processCaktoWebhook(refundPayload);
  assert.equal(res.success, true);
  assert.equal(userStatus, 'ACTIVE'); // Assinatura PRESERVADA!
  assert.equal(orderStatus, 'REFUNDED'); // Pedido atualizado para REFUNDED!
  assert.equal(revokedParams.amount, 100);
});
