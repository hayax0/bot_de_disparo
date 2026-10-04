import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockMethod } from '../test-support/mockMethod';
import { prisma } from '../lib/prisma';
import { CreditWalletService, InsufficientCreditsError } from './CreditWalletService';

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

test('CreditWalletService: expiração de monthlyExpiresAt exclui saldo mensal do availableBalance', async (t) => {
  const expiredUser = {
    id: 'user-expired',
    email: 'vencido@test.com',
    role: 'USER',
    planId: 'PRO',
    subscriptionStatus: 'ACTIVE',
    subscriptionExpiresAt: new Date(Date.now() + 10 * 86400000),
    dispatchesUsedInCycle: 0,
    monthlyDispatchQuota: 5000,
    wallet: {
      id: 'wallet-exp',
      userId: 'user-expired',
      monthlyBalance: 200,
      purchasedBalance: 80,
      reservedBalance: 10,
      // Venceu ontem!
      monthlyExpiresAt: new Date(Date.now() - 86400000),
    }
  };

  mockMethod(t, prisma.user, 'findUnique', async () => expiredUser);

  const summary = await CreditWalletService.getWalletSummary('user-expired');

  // Total balance contábil ainda reflete os saldos brutos, mas availableBalance desconsidera mensal expirado
  assert.equal(summary.availableBalance, 70); // 80 comprados - 10 reservados = 70
});

test('CreditWalletService: administradores recebem status ilimitado com saldo real sem 999999 fictício', async (t) => {
  const adminUser = {
    id: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN',
    planId: null,
    subscriptionStatus: 'LIFETIME',
    dispatchesUsedInCycle: 500,
    monthlyDispatchQuota: 0,
    wallet: { id: 'w-admin', userId: 'admin-1', monthlyBalance: 0, purchasedBalance: 0, reservedBalance: 0 }
  };

  mockMethod(t, prisma.user, 'findUnique', async () => adminUser);

  const summary = await CreditWalletService.getWalletSummary('admin-1');

  assert.equal(summary.isUnlimited, true);
  assert.equal(summary.totalBalance, 0); // saldo real sem números fictícios
  assert.equal(summary.availableBalance, 0);
});

test('CreditWalletService: conta legada Davi preserva condição contratada sem créditos e sem busca grátis', async (t) => {
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
  mockMethod(t, CreditWalletService, 'getOrCreateWallet', async () => ({
    id: 'w-leg',
    userId: 'legacy-davi',
    monthlyBalance: 0,
    purchasedBalance: 0,
    reservedBalance: 0,
    monthlyExpiresAt: null
  }));

  const summary = await CreditWalletService.getWalletSummary('legacy-davi');

  assert.equal(summary.isLegacy, true);
  assert.equal(summary.isUnlimited, false);
  assert.equal(summary.planId, 'LEGACY_DAVI');
  assert.equal(summary.totalBalance, 0);
  assert.equal(summary.availableBalance, 0);
});

test('CreditWalletService: reserva de créditos cria CreditReservation persistida com idempotência', async (t) => {
  let wallet = {
    id: 'w-1',
    userId: 'u-1',
    monthlyBalance: 50,
    purchasedBalance: 20,
    reservedBalance: 0,
    monthlyExpiresAt: new Date(Date.now() + 86400000)
  };

  const user = {
    id: 'u-1',
    role: 'USER',
    planId: 'START',
    subscriptionStatus: 'ACTIVE',
    subscriptionExpiresAt: new Date(Date.now() + 86400000),
    wallet
  };

  const reservations: any[] = [];

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      $executeRaw: async () => 1,
      creditReservation: {
        findUnique: async ({ where }: any) => reservations.find(r => r.idempotencyKey === where.idempotencyKey),
        create: async ({ data }: any) => {
          const res = { id: `res-${reservations.length + 1}`, ...data };
          reservations.push(res);
          return res;
        }
      },
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

  // 1. Reserva de 40 créditos com saldo disponível de 70 -> Deve aprovar
  const res1 = await CreditWalletService.reserveCredits({
    userId: 'u-1',
    amount: 40,
    idempotencyKey: 'idemp-res-1',
    sourceType: 'COMPANY_SEARCH',
    description: 'Busca teste'
  });

  assert.equal(res1.success, true);
  assert.equal(res1.reservedAmount, 40);
  assert.equal(wallet.reservedBalance, 40);
  assert.ok(res1.reservationId);

  // 2. Repetição com a MESMA chave de idempotência -> Retorna imediatamente sem duplicar débito de reserva
  const resRepeat = await CreditWalletService.reserveCredits({
    userId: 'u-1',
    amount: 40,
    idempotencyKey: 'idemp-res-1',
    sourceType: 'COMPANY_SEARCH',
    description: 'Busca teste'
  });

  assert.equal(resRepeat.reservationId, res1.reservationId);
  assert.equal(wallet.reservedBalance, 40); // não duplicou para 80!

  // 3. Tentativa de reservar mais 40 com saldo disponível restante de 30 (70 - 40) -> Deve falhar
  await assert.rejects(
    async () => {
      await CreditWalletService.reserveCredits({
        userId: 'u-1',
        amount: 40,
        idempotencyKey: 'idemp-res-2',
        sourceType: 'COMPANY_SEARCH'
      });
    },
    (err: any) => err instanceof InsufficientCreditsError
  );
});

test('CreditWalletService: liquidação consome mensal antes de comprado e desfaz o hold da reserva', async (t) => {
  let wallet = {
    id: 'w-priority',
    userId: 'u-prio',
    monthlyBalance: 30, // Saldo mensal bruto
    purchasedBalance: 50, // Saldo comprado bruto
    reservedBalance: 60, // 60 créditos em hold
    monthlyExpiresAt: new Date(Date.now() + 86400000)
  };

  const reservation = {
    id: 'res-settle-1',
    userId: 'u-prio',
    walletId: 'w-priority',
    idempotencyKey: 'idemp-res-prio',
    amount: 60,
    requestedAmount: 60,
    reservedAmount: 60,
    monthlyAmount: 30,
    purchasedAmount: 30,
    consumedAmount: 0,
    status: 'PENDING',
    monthlyExpiresAt: new Date(Date.now() + 86400000)
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
      creditReservation: {
        findUnique: async () => reservation,
        updateMany: async ({ where, data }: any) => {
          if (reservation.status === 'PENDING') {
            Object.assign(reservation, data);
            return { count: 1 };
          }
          return { count: 0 };
        },
        update: async ({ data }: any) => {
          Object.assign(reservation, data);
          return reservation;
        }
      },
      user: { findUnique: async () => user },
      creditWallet: {
        findUnique: async () => wallet,
        update: async ({ data }: any) => {
          const monthlyDelta = (data.monthlyBalance?.increment || 0) - (data.monthlyBalance?.decrement || 0);
          const purchasedDelta = (data.purchasedBalance?.increment || 0) - (data.purchasedBalance?.decrement || 0);
          const reservedDelta = (data.reservedBalance?.increment || 0) - (data.reservedBalance?.decrement || 0);
          wallet = {
            ...wallet,
            monthlyBalance: wallet.monthlyBalance + monthlyDelta,
            purchasedBalance: wallet.purchasedBalance + purchasedDelta,
            reservedBalance: wallet.reservedBalance + reservedDelta
          };
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
  // Deve consumir: 30 do saldo mensal + 15 do saldo comprado (restando 35)
  // E desfaz o hold integral de 60
  const settleRes = await CreditWalletService.settleReservation({
    reservationId: 'res-settle-1',
    actualConsumedAmount: 45,
    description: '45 empresas aproveitáveis encontradas'
  });

  assert.equal(settleRes.success, true);
  assert.equal(settleRes.consumedAmount, 45);
  assert.equal(settleRes.releasedAmount, 15);
  assert.equal(reservation.status, 'SETTLED');

  // Saldos finais na carteira (Clean Hold):
  // monthlyBalance: 30 - 30 = 0
  // purchasedBalance: 50 - 15 = 35
  // reservedBalance: 60 - 60 = 0
  assert.equal(wallet.monthlyBalance, 0);
  assert.equal(wallet.purchasedBalance, 35);
  assert.equal(wallet.reservedBalance, 0);

  // Repetição da liquidação é idempotente
  const settleRepeat = await CreditWalletService.settleReservation({
    reservationId: 'res-settle-1',
    actualConsumedAmount: 45
  });
  assert.equal(settleRepeat.isIdempotent, true);
  assert.equal(settleRepeat.consumedAmount, 45);
});

test('CreditWalletService: liberação total de reserva estorna valor exato e é idempotente', async (t) => {
  let wallet = {
    id: 'w-rel',
    userId: 'u-rel',
    monthlyBalance: 20,
    purchasedBalance: 40,
    reservedBalance: 25,
  };

  const reservation = {
    id: 'res-rel-1',
    userId: 'u-rel',
    walletId: 'w-rel',
    idempotencyKey: 'idemp-rel-1',
    amount: 25,
    reservedAmount: 25,
    monthlyAmount: 0,
    purchasedAmount: 25,
    status: 'PENDING'
  };

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      $executeRaw: async () => 1,
      creditReservation: {
        findUnique: async () => reservation,
        updateMany: async ({ where, data }: any) => {
          if (reservation.status === 'PENDING') {
            Object.assign(reservation, data);
            return { count: 1 };
          }
          return { count: 0 };
        },
        update: async ({ data }: any) => {
          Object.assign(reservation, data);
          return reservation;
        }
      },
      creditWallet: {
        findUnique: async () => wallet,
        update: async ({ data }: any) => {
          const reservedDelta = (data.reservedBalance?.increment || 0) - (data.reservedBalance?.decrement || 0);
          wallet = {
            ...wallet,
            reservedBalance: wallet.reservedBalance + reservedDelta
          };
          return wallet;
        }
      },
      creditTransaction: {
        create: async ({ data }: any) => data
      }
    };
    return fn(tx);
  });

  const rel = await CreditWalletService.releaseReservation({
    reservationId: 'res-rel-1',
    reason: 'Falha externa no provedor'
  });

  assert.equal(rel.success, true);
  assert.equal(rel.releasedAmount, 25);
  assert.equal(wallet.reservedBalance, 0);
  assert.equal(reservation.status, 'RELEASED');

  // Repetição é idempotente
  const relRepeat = await CreditWalletService.releaseReservation({
    reservationId: 'res-rel-1'
  });
  assert.equal(relRepeat.isIdempotent, true);
  assert.equal(wallet.reservedBalance, 0);
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
