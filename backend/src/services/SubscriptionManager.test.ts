import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUserAdmin, isSubscriptionActive } from './SubscriptionManager';

test('isUserAdmin: reconhece emails de administradores/VIPs configurados', () => {
  assert.equal(isUserAdmin('caiocampos1009@gmail.com'), true);
  assert.equal(isUserAdmin('CAIOCAMPOS1009@GMAIL.COM'), true);
  assert.equal(isUserAdmin('Vitoriacampos241003@gmail.com'), true);
  assert.equal(isUserAdmin('vitoriacampos241003@gmail.com'), true);
  assert.equal(isUserAdmin('vieiralacerda192@gmail.com'), true);
  assert.equal(isUserAdmin('VIEIRALACERDA192@GMAIL.COM'), true);
  assert.equal(isUserAdmin('cliente@gmail.com'), false);
  assert.equal(isUserAdmin('davianicetofirme@hotmail.com'), false);
  assert.equal(isUserAdmin(''), false);
});

test('isSubscriptionActive: administradores e contas VIP/lifetime têm acesso irrestrito', () => {
  // Usuário com e-mail VIP/Admin tem acesso irrestrito independente do status
  assert.equal(isSubscriptionActive({ email: 'caiocampos1009@gmail.com', role: 'USER', subscriptionStatus: 'INACTIVE', subscriptionExpiresAt: null }), true);
  assert.equal(isSubscriptionActive({ email: 'vitoriacampos241003@gmail.com', role: 'USER', subscriptionStatus: 'CANCELED', subscriptionExpiresAt: null }), true);
  assert.equal(isSubscriptionActive({ email: 'vieiralacerda192@gmail.com', role: 'USER', subscriptionStatus: 'PAST_DUE', subscriptionExpiresAt: null }), true);

  // Role ADMIN ou status LIFETIME têm acesso irrestrito
  assert.equal(isSubscriptionActive({ role: 'ADMIN', subscriptionStatus: 'INACTIVE', subscriptionExpiresAt: null }), true);
  assert.equal(isSubscriptionActive({ role: 'USER', subscriptionStatus: 'LIFETIME', subscriptionExpiresAt: null }), true);
});

test('isSubscriptionActive: assinantes comuns com plano ACTIVE e data futura têm acesso', () => {
  const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'ACTIVE', subscriptionExpiresAt: futureDate }), true);
});

test('isSubscriptionActive: assinantes sem data futura ou com plano vencido/cancelado são estritamente bloqueados', () => {
  const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  
  // ACTIVE mas sem data de expiração -> BLOQUEADO
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'ACTIVE', subscriptionExpiresAt: null }), false);
  
  // ACTIVE mas com data no passado -> BLOQUEADO
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'ACTIVE', subscriptionExpiresAt: pastDate }), false);

  // Status INACTIVE, CANCELED, PAST_DUE -> BLOQUEADOS
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'INACTIVE', subscriptionExpiresAt: null }), false);
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'CANCELED', subscriptionExpiresAt: null }), false);
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'PAST_DUE', subscriptionExpiresAt: null }), false);
});
