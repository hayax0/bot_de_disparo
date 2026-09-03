import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUserAdmin, isSubscriptionActive } from './SubscriptionManager';

test('isUserAdmin: reconhece emails de administradores configurados', () => {
  assert.equal(isUserAdmin('caiocampos1009@gmail.com'), true);
  assert.equal(isUserAdmin('CAIOCAMPOS1009@GMAIL.COM'), true);
  assert.equal(isUserAdmin('Vitoriacampos241003@gmail.com'), true);
  assert.equal(isUserAdmin('vitoriacampos241003@gmail.com'), true);
  assert.equal(isUserAdmin('vieiralacerda192@gmail.com'), true);
  assert.equal(isUserAdmin('VIEIRALACERDA192@GMAIL.COM'), true);
  assert.equal(isUserAdmin('cliente@gmail.com'), false);
  assert.equal(isUserAdmin(''), false);
});

test('isSubscriptionActive: administradores e contas lifetime têm acesso irrestrito', () => {
  // Admin com qualquer status tem acesso
  assert.equal(isSubscriptionActive({ role: 'ADMIN', subscriptionStatus: 'INACTIVE', subscriptionExpiresAt: null }), true);
  assert.equal(isSubscriptionActive({ role: 'USER', subscriptionStatus: 'LIFETIME', subscriptionExpiresAt: null }), true);
});

test('isSubscriptionActive: clientes comuns com plano ACTIVE e data futura têm acesso', () => {
  const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  assert.equal(isSubscriptionActive({ role: 'USER', subscriptionStatus: 'ACTIVE', subscriptionExpiresAt: futureDate }), true);
  assert.equal(isSubscriptionActive({ role: 'USER', subscriptionStatus: 'ACTIVE', subscriptionExpiresAt: null }), true);
});

test('isSubscriptionActive: clientes com plano vencido ou cancelado são bloqueados', () => {
  const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  assert.equal(isSubscriptionActive({ role: 'USER', subscriptionStatus: 'ACTIVE', subscriptionExpiresAt: pastDate }), false);
  assert.equal(isSubscriptionActive({ role: 'USER', subscriptionStatus: 'INACTIVE', subscriptionExpiresAt: null }), false);
  assert.equal(isSubscriptionActive({ role: 'USER', subscriptionStatus: 'CANCELED', subscriptionExpiresAt: null }), false);
  assert.equal(isSubscriptionActive({ role: 'USER', subscriptionStatus: 'PAST_DUE', subscriptionExpiresAt: null }), false);
});
