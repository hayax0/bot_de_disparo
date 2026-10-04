import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { once } from 'node:events';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { processCaktoWebhook } from './SubscriptionManager';
import { CreditWalletService } from './CreditWalletService';
import authRouter from '../routes/auth';

test('Recargas: comprador sem assinatura e reembolso anterior ao cadastro', async t => {
  const db = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  assert.equal(db[0]?.current_database, 'bot_prospeccao_test');
  const originalSecret = ENV.CAKTO_WEBHOOK_SECRET;
  ENV.CAKTO_WEBHOOK_SECRET = 'credit-buyer-test-secret';
  const prefix = `credit-buyer-${crypto.randomUUID()}`;
  const emails: string[] = [];
  const buyer = () => { const email = `${prefix}-${emails.length}@example.test`; emails.push(email); return email; };
  const event = (email: string, order: string, kind = 'purchase_approved') => ({
    secret: ENV.CAKTO_WEBHOOK_SECRET, event_id: crypto.randomUUID(), event: kind,
    data: { id: `${prefix}-${order}`, offer_id: '1165355', customer: { email } },
  });
  t.after(async () => {
    ENV.CAKTO_WEBHOOK_SECRET = originalSecret;
    await prisma.webhookLog.deleteMany({ where: { email: { in: emails } } });
    await prisma.registrationVerification.deleteMany({ where: { email: { in: emails } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  await t.test('reembolso antecipado persiste e bloqueia aprovações concorrentes', async () => {
    const email = buyer();
    await Promise.all([1, 2].map(() => processCaktoWebhook(event(email, 'refunded', 'purchase_refunded'))));
    await Promise.all([1, 2].map(() => processCaktoWebhook(event(email, 'refunded'))));
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { wallet: true } });
    assert.equal(user.subscriptionStatus, 'INACTIVE');
    assert.equal(user.subscriptionExpiresAt, null);
    assert.equal(user.planId, null);
    assert.equal(user.wallet?.purchasedBalance || 0, 0);
    const orders = await prisma.creditPurchaseOrder.findMany({ where: { userId: user.id } });
    assert.equal(orders.length, 1);
    assert.equal(orders[0]?.status, 'REFUNDED');
    assert.equal(orders[0]?.paidAt, null);
  });

  await t.test('recarga mantém créditos após cadastro real sem ativar assinatura ou duplicar saldo', async () => {
    const email = buyer();
    await Promise.all([1, 2].map(() => processCaktoWebhook(event(email, 'paid'))));
    const before = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(before.subscriptionStatus, 'INACTIVE');
    assert.equal(before.subscriptionExpiresAt, null);
    assert.equal(before.subscriptionStartedAt, null);
    assert.ok(before.password.startsWith('$WEBHOOK_TEMP$'));
    const code = '123456';
    await prisma.registrationVerification.create({ data: {
      email, codeHash: crypto.createHmac('sha256', ENV.JWT_SECRET).update(`${email}:${code}`).digest('hex'),
      expiresAt: new Date(Date.now() + 600000), requestedAt: new Date(),
    } });
    const app = express(); app.use(express.json()); app.use(authRouter);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    try {
      const address = server.address() as { port: number };
      const response = await fetch(`http://127.0.0.1:${address.port}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'TestPassword123!', verificationCode: code, termsAccepted: true }),
      });
      assert.equal(response.status, 200, await response.text());
    } finally { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
    await processCaktoWebhook(event(email, 'paid'));
    const after = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(after.id, before.id);
    assert.ok(after.emailVerifiedAt);
    assert.equal(after.subscriptionStatus, 'INACTIVE');
    assert.equal(after.subscriptionExpiresAt, null);
    const summary = await CreditWalletService.getWalletSummary(after.id);
    assert.equal(summary.purchasedBalance, 100);
    assert.equal(summary.isActiveSubscription, false);
    assert.equal(await prisma.creditPurchaseOrder.count({ where: { userId: after.id } }), 1);
  });

  await t.test('recargas preservam assinatura e exceções existentes', async () => {
    for (const state of [
      { role: 'USER', planId: 'PRO', subscriptionStatus: 'INACTIVE' },
      { role: 'USER', planId: 'PRO', subscriptionStatus: 'ACTIVE' },
      { role: 'USER', planId: 'LEGACY_DAVI', subscriptionStatus: 'ACTIVE' },
      { role: 'ADMIN', planId: 'ADMIN_LIFETIME', subscriptionStatus: 'LIFETIME' },
    ]) {
      const email = buyer();
      const user = await prisma.user.create({ data: { email, password: 'test', ...state,
        subscriptionExpiresAt: new Date('2030-01-01'), monthlyDispatchQuota: 123, dispatchesUsedInCycle: 12 } });
      await processCaktoWebhook(event(email, email));
      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      for (const key of ['role', 'planId', 'subscriptionStatus', 'subscriptionExpiresAt', 'monthlyDispatchQuota', 'dispatchesUsedInCycle'] as const) {
        assert.deepEqual(after[key], user[key]);
      }
    }
  });
});
