import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockMethod } from '../test-support/mockMethod';
import { prisma } from '../lib/prisma';
import { QuotaService } from './QuotaService';

test('QuotaService: cliente comum dentro do limite de disparos é aprovado', async (t) => {
  const user = {
    id: 'user-standard',
    role: 'USER',
    planId: 'START', // Start = 1500 envios
    subscriptionStatus: 'ACTIVE',
    monthlyDispatchQuota: 1500,
    dispatchesUsedInCycle: 1200,
  };

  mockMethod(t, prisma.user, 'findUnique', async () => user);

  const check = await QuotaService.canDispatch('user-standard');

  assert.equal(check.allowed, true);
  assert.equal(check.remaining, 300);
  assert.equal(check.quota, 1500);
  assert.equal(check.used, 1200);
});

test('QuotaService: cliente comum que atingiu o limite é bloqueado com mensagem clara', async (t) => {
  const user = {
    id: 'user-exhausted',
    role: 'USER',
    planId: 'START',
    subscriptionStatus: 'ACTIVE',
    monthlyDispatchQuota: 1500,
    dispatchesUsedInCycle: 1500,
  };

  mockMethod(t, prisma.user, 'findUnique', async () => user);

  const check = await QuotaService.canDispatch('user-exhausted');

  assert.equal(check.allowed, false);
  assert.equal(check.remaining, 0);
  assert.match(check.reason || '', /Franquia mensal de disparos/);
});

test('QuotaService: administradores possuem franquia ilimitada dependendo estritamente do papel ADMIN', async (t) => {
  const admin = {
    id: 'admin-id',
    role: 'ADMIN',
    planId: null,
    subscriptionStatus: 'LIFETIME',
    monthlyDispatchQuota: 0,
    dispatchesUsedInCycle: 85000,
  };

  mockMethod(t, prisma.user, 'findUnique', async () => admin);

  const check = await QuotaService.canDispatch('admin-id');

  assert.equal(check.allowed, true);
  assert.equal(check.isUnlimited, true);
  assert.equal(check.remaining, undefined); // sem 999999 fictício
});

test('QuotaService: remoção do papel ADMIN faz usuário passar a respeitar a cota do plano', async (t) => {
  const formerAdmin = {
    id: 'former-admin',
    role: 'USER', // papel revogado
    planId: 'START',
    subscriptionStatus: 'ACTIVE',
    monthlyDispatchQuota: 1500,
    dispatchesUsedInCycle: 1500,
  };

  mockMethod(t, prisma.user, 'findUnique', async () => formerAdmin);

  const check = await QuotaService.canDispatch('former-admin');

  assert.equal(check.allowed, false);
  assert.equal(check.isUnlimited, undefined);
  assert.equal(check.remaining, 0);
});

test('QuotaService: conta legada Davi possui acesso irrestrito sem bloqueio por cota', async (t) => {
  const legacy = {
    id: 'davi-id',
    role: 'USER',
    planId: 'LEGACY_DAVI',
    subscriptionStatus: 'ACTIVE',
    monthlyDispatchQuota: 0,
    dispatchesUsedInCycle: 22000,
  };

  mockMethod(t, prisma.user, 'findUnique', async () => legacy);

  const check = await QuotaService.canDispatch('davi-id');

  assert.equal(check.allowed, true);
  assert.equal(check.isUnlimited, true);
  assert.equal(check.remaining, undefined);
});

test('QuotaService: resetCycleDispatches zera contador do ciclo', async (t) => {
  let updatedData: any = null;

  mockMethod(t, prisma.user, 'update', async ({ data }: any) => {
    updatedData = data;
    return {};
  });

  await QuotaService.resetCycleDispatches('user-id', 5000);

  assert.equal(updatedData.dispatchesUsedInCycle, 0);
  assert.equal(updatedData.monthlyDispatchQuota, 5000);
  assert.ok(updatedData.cycleResetAt instanceof Date);
});

test('QuotaService: refundDispatchQuota estorna disparo atomicamente', async (t) => {
  let rawQueryCalled = false;
  mockMethod(t, prisma, '$executeRaw', async () => {
    rawQueryCalled = true;
    return 1;
  });

  await QuotaService.refundDispatchQuota('user-test-id');
  assert.equal(rawQueryCalled, true);
});

test('QuotaService [Item 2]: Davi no plano PRO com 3000 disparos usados mantém disparos ilimitados', async (t) => {
  // Configuração idêntica à conta de produção do Davi
  const syntheticDavi = {
    id: 'davi-synthetic-pro',
    email: 'davianicetofirme@hotmail.com',
    role: 'USER',
    planId: 'PRO',
    subscriptionStatus: 'ACTIVE',
    monthlyDispatchQuota: 3000,
    dispatchesUsedInCycle: 3000, // Já atingiu a franquia normal do PRO
    cycleResetAt: new Date(),
    createdAt: new Date(),
  };

  mockMethod(t, prisma.user, 'findUnique', async () => syntheticDavi);

  // 1. canDispatch não deve bloquear
  const check = await QuotaService.canDispatch('davi-synthetic-pro');
  assert.equal(check.allowed, true, 'canDispatch deve permitir envio ilimitado para o Davi');
  assert.equal(check.isUnlimited, true, 'isUnlimited deve ser true');

  // 2. tryConsumeDispatchQuota não deve bloquear
  let userUpdated = false;
  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      $executeRaw: async () => 1,
      user: {
        findUnique: async () => syntheticDavi,
        update: async () => { userUpdated = true; return {}; }
      },
      dispatchReservation: {
        findUnique: async () => null,
        upsert: async () => ({})
      }
    };
    return await fn(tx);
  });

  const consume = await QuotaService.tryConsumeDispatchQuota('davi-synthetic-pro');
  assert.equal(consume.allowed, true, 'tryConsumeDispatchQuota deve permitir consumo irrestrito');
  assert.equal(consume.isUnlimited, true);
  assert.equal(userUpdated, true, 'Deve ter incrementado dispatchesUsedInCycle');
});

test('QuotaService [Item 2]: Cliente comum no plano PRO que atinge 3000 disparos é bloqueado normalmente', async (t) => {
  const commonUser = {
    id: 'common-pro-user',
    email: 'comum@prospector.com',
    role: 'USER',
    planId: 'PRO',
    subscriptionStatus: 'ACTIVE',
    monthlyDispatchQuota: 3000,
    dispatchesUsedInCycle: 3000,
    cycleResetAt: new Date(),
    createdAt: new Date(),
  };

  mockMethod(t, prisma.user, 'findUnique', async () => commonUser);

  const check = await QuotaService.canDispatch('common-pro-user');
  assert.equal(check.allowed, false, 'Cliente comum com 3000/3000 deve ser bloqueado');
  assert.match(check.reason || '', /Franquia mensal de disparos/);
});
