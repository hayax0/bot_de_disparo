import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockMethod } from '../test-support/mockMethod';
import { prisma } from '../lib/prisma';
import { CreditWalletService, InsufficientCreditsError, WalletSuspendedError } from './CreditWalletService';

test('CreditWalletService: resumo de usuário comum calcula saldos e disponibilidade corretamente', async (t) => {
  const fakeUser = {
    id: 'user-1',
    email: 'cliente@test.com',
    role: 'USER',
    planId: 'PRO',
    subscriptionStatus: 'ACTIVE',
    subscriptionExpiresAt: new Date(Date.now() + 10 * 86400000),
    dispatchesUsedInCycle: 120,
    monthlyDispatchQuota: 5000,
    wallet: {
      id: 'wallet-1',
      userId: 'user-1',
      monthlyBalance: 200,
      purchasedBalance: 150,
      reservedBalance: 50,
      monthlyExpiresAt: new Date(Date.now() + 10 * 86400000),
    }
  };

  mockMethod(t, prisma.user, 'findUnique', async () => fakeUser);

  const summary = await CreditWalletService.getWalletSummary('user-1');

  assert.equal(summary.userId, 'user-1');
  assert.equal(summary.totalBalance, 350); // 200 + 150
  assert.equal(summary.availableBalance, 300); // 350 - 50 reservado
  assert.equal(summary.monthlyBalance, 200);
  assert.equal(summary.purchasedBalance, 150);
  assert.equal(summary.reservedBalance, 50);
  assert.equal(summary.isUnlimited, false);
  assert.equal(summary.isLegacy, false);
  assert.equal(summary.isActiveSubscription, true);
  assert.equal(summary.planId, 'PRO');
});

test('CreditWalletService: administradores recebem status ilimitado sem bloqueio', async (t) => {
  const adminUser = {
    id: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN',
    planId: 'ADMIN_LIFETIME',
    subscriptionStatus: 'LIFETIME',
    dispatchesUsedInCycle: 500,
    monthlyDispatchQuota: 0,
    wallet: { id: 'w-admin', userId: 'admin-1', monthlyBalance: 0, purchasedBalance: 0, reservedBalance: 0 }
  };

  mockMethod(t, prisma.user, 'findUnique', async () => adminUser);

  const summary = await CreditWalletService.getWalletSummary('admin-1');

  assert.equal(summary.isUnlimited, true);
  assert.equal(summary.totalBalance, 999999);
  assert.equal(summary.availableBalance, 999999);
});

test('CreditWalletService: conta legada Davi preserva condição contratada sem créditos', async (t) => {
  const legacyUser = {
    id: 'legacy-davi',
    email: 'davi@test.com',
    role: 'USER',
    planId: 'LEGACY_DAVI',
    subscriptionStatus: 'ACTIVE',
    subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
    dispatchesUsedInCycle: 800,
    monthlyDispatchQuota: 0,
    wallet: null
  };

  mockMethod(t, prisma.user, 'findUnique', async () => legacyUser);
  mockMethod(t, CreditWalletService, 'getOrCreateWallet', async () => ({ id: 'w-leg', userId: 'legacy-davi' }));

  const summary = await CreditWalletService.getWalletSummary('legacy-davi');

  assert.equal(summary.isLegacy, true);
  assert.equal(summary.isUnlimited, false);
  assert.equal(summary.planId, 'LEGACY_DAVI');
  assert.equal(summary.totalBalance, 0);
  assert.equal(summary.availableBalance, 0);
});

test('CreditWalletService: reserva de créditos bloqueia saldo suficiente e rejeita saldo insuficiente', async (t) => {
  let wallet = {
    id: 'w-1',
    userId: 'u-1',
    monthlyBalance: 50,
    purchasedBalance: 20,
    reservedBalance: 0,
  };

  const user = {
    id: 'u-1',
    role: 'USER',
    planId: 'START',
    subscriptionStatus: 'ACTIVE',
    subscriptionExpiresAt: new Date(Date.now() + 86400000),
    wallet
  };

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      $executeRaw: async () => 1,
      user: { findUnique: async () => user },
      creditWallet: {
        update: async ({ data }: any) => {
          wallet.reservedBalance += data.reservedBalance.increment;
          return wallet;
        }
      },
      creditTransaction: {
        create: async ({ data }: any) => ({ id: 'tx-123', ...data })
      }
    };
    return fn(tx);
  });

  // Reserva de 40 créditos com saldo disponível de 70 -> Deve aprovar
  const res = await CreditWalletService.reserveCredits({
    userId: 'u-1',
    amount: 40,
    sourceType: 'COMPANY_SEARCH',
    description: 'Busca teste'
  });

  assert.equal(res.success, true);
  assert.equal(res.reservedAmount, 40);
  assert.equal(wallet.reservedBalance, 40);

  // Tentativa de reservar mais 40 com saldo disponível restante de 30 (70 - 40) -> Deve falhar
  await assert.rejects(
    async () => {
      await CreditWalletService.reserveCredits({
        userId: 'u-1',
        amount: 40,
        sourceType: 'COMPANY_SEARCH'
      });
    },
    (err: any) => err instanceof InsufficientCreditsError
  );
});

test('CreditWalletService: liquidação de reserva prioriza estritamente créditos mensais antes dos comprados', async (t) => {
  let wallet = {
    id: 'w-priority',
    userId: 'u-prio',
    monthlyBalance: 30, // 30 mensais
    purchasedBalance: 50, // 50 comprados
    reservedBalance: 60, // 60 reservados anteriormente
  };

  const user = {
    id: 'u-prio',
    role: 'USER',
    planId: 'PRO',
    subscriptionStatus: 'ACTIVE',
    subscriptionExpiresAt: new Date(Date.now() + 86400000),
    wallet
  };

  let transactionsCreated: any[] = [];

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      $executeRaw: async () => 1,
      user: { findUnique: async () => user },
      creditWallet: {
        update: async ({ data }: any) => {
          wallet = { ...wallet, ...data };
          return wallet;
        }
      },
      creditTransaction: {
        create: async ({ data }: any) => {
          transactionsCreated.push(data);
          return { id: `tx-${transactionsCreated.length}`, ...data };
        }
      }
    };
    return fn(tx);
  });

  // Consumir 45 créditos de uma reserva de 60:
  // Deve consumir: 30 do saldo mensal (esgotando-o) + 15 do saldo comprado (restando 35)
  // E liberar 15 não utilizados da reserva
  const settleRes = await CreditWalletService.settleReservation({
    userId: 'u-prio',
    reservedAmount: 60,
    actualConsumedAmount: 45,
    sourceType: 'COMPANY_SEARCH',
    description: '45 empresas aproveitáveis encontradas'
  });

  assert.equal(settleRes.success, true);
  assert.equal(settleRes.consumedAmount, 45);
  assert.equal(settleRes.releasedAmount, 15);

  // Saldos finais
  assert.equal(wallet.monthlyBalance, 0); // 30 - 30
  assert.equal(wallet.purchasedBalance, 35); // 50 - 15
  assert.equal(wallet.reservedBalance, 0); // 60 - 60

  // Auditoria
  const consumptionTx = transactionsCreated.find(tx => tx.type === 'CONSUMPTION');
  assert.ok(consumptionTx);
  assert.equal(consumptionTx.amount, -45);
  assert.equal(consumptionTx.monthlyAmount, 30);
  assert.equal(consumptionTx.purchasedAmount, 15);
  assert.equal(consumptionTx.balanceType, 'MIXED');

  const releaseTx = transactionsCreated.find(tx => tx.type === 'RESERVATION_RELEASE');
  assert.ok(releaseTx);
  assert.equal(releaseTx.amount, 15);
});

test('CreditWalletService: concessão mensal e recarga avulsa com idempotência', async (t) => {
  let wallet = {
    id: 'w-grant',
    userId: 'u-grant',
    monthlyBalance: 0,
    purchasedBalance: 100,
    reservedBalance: 0,
  };

  let transactions: any[] = [];

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      $executeRaw: async () => 1,
      creditTransaction: {
        findUnique: async ({ where }: any) => transactions.find(t => t.idempotencyKey === where.idempotencyKey),
        create: async ({ data }: any) => {
          transactions.push(data);
          return data;
        }
      },
      creditWallet: {
        findUnique: async () => wallet,
        create: async () => wallet,
        update: async ({ data }: any) => {
          if (data.purchasedBalance?.increment) {
            wallet.purchasedBalance += data.purchasedBalance.increment;
          }
          if (data.monthlyBalance !== undefined) {
            wallet.monthlyBalance = data.monthlyBalance;
          }
          return wallet;
        }
      }
    };
    return fn(tx);
  });

  // Concessão de créditos comprados
  const p1 = await CreditWalletService.grantPurchasedCredits({
    userId: 'u-grant',
    amount: 600,
    orderId: 'ord-123',
    idempotencyKey: 'idemp-purchase-1'
  });
  assert.equal(p1.newPurchasedBalance, 700);

  // Repetição idêntica com mesma idempotencyKey -> não concede duplicado
  const p2 = await CreditWalletService.grantPurchasedCredits({
    userId: 'u-grant',
    amount: 600,
    orderId: 'ord-123',
    idempotencyKey: 'idemp-purchase-1'
  });
  assert.equal(p2.newPurchasedBalance, 700);
  assert.equal(wallet.purchasedBalance, 700);
});

test('CreditWalletService: ajuste administrativo exige justificativa válida com auditoria', async (t) => {
  let wallet = {
    id: 'w-adj',
    userId: 'u-target',
    monthlyBalance: 10,
    purchasedBalance: 20,
    reservedBalance: 0,
  };

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      $executeRaw: async () => 1,
      creditWallet: {
        findUnique: async () => wallet,
        update: async ({ data }: any) => {
          wallet = { ...wallet, ...data };
          return wallet;
        }
      },
      creditTransaction: {
        create: async ({ data }: any) => data
      }
    };
    return fn(tx);
  });

  // Falha sem justificativa
  await assert.rejects(
    async () => {
      await CreditWalletService.adminAdjustCredits({
        adminUserId: 'admin-1',
        targetUserId: 'u-target',
        monthlyDelta: 50,
        purchasedDelta: 0,
        reason: ''
      });
    },
    /Justificativa obrigatória/
  );

  // Sucesso com justificativa
  const res = await CreditWalletService.adminAdjustCredits({
    adminUserId: 'admin-1',
    targetUserId: 'u-target',
    monthlyDelta: 50,
    purchasedDelta: 100,
    reason: 'Compensação por indisponibilidade técnica temporária'
  });

  assert.equal(res.success, true);
  assert.equal(res.newMonthlyBalance, 60);
  assert.equal(res.newPurchasedBalance, 120);
});
