import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUserAdmin, isSubscriptionActive, calculateSubscriptionPeriod } from './SubscriptionManager';

test('isUserAdmin: reconhece emails de administradores/VIPs configurados', () => {
  assert.equal(isUserAdmin('caiocampos1009@gmail.com'), true);
  assert.equal(isUserAdmin('CAIOCAMPOS1009@GMAIL.COM'), true);
  assert.equal(isUserAdmin('Vitoriacampos241003@gmail.com'), true);
  assert.equal(isUserAdmin('vitoriacampos241003@gmail.com'), true);
  assert.equal(isUserAdmin('vieiralacerda192@gmail.com'), true);
  assert.equal(isUserAdmin('VIEIRALACERDA192@GMAIL.COM'), true);
  assert.equal(isUserAdmin('vmariacamll@gmail.com'), true);
  assert.equal(isUserAdmin('VMARIACAMLL@GMAIL.COM'), true);
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

test('isSubscriptionActive: cancelamento mantém acesso até expiresAt e bloqueia após expirar', () => {
  const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  // CANCELED com data futura -> ACESSO PERMITIDO (respeita período já pago)
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'CANCELED', subscriptionExpiresAt: futureDate }), true);

  // CANCELED com data passada -> BLOQUEADO
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'CANCELED', subscriptionExpiresAt: pastDate }), false);

  // CANCELED sem data -> BLOQUEADO
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'CANCELED', subscriptionExpiresAt: null }), false);
});

test('isSubscriptionActive: assinantes sem data futura ou com status INACTIVE/PAST_DUE são bloqueados', () => {
  const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  
  // ACTIVE mas sem data de expiração -> BLOQUEADO
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'ACTIVE', subscriptionExpiresAt: null }), false);
  
  // ACTIVE mas com data no passado -> BLOQUEADO
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'ACTIVE', subscriptionExpiresAt: pastDate }), false);

  // Status INACTIVE, PAST_DUE -> BLOQUEADOS
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'INACTIVE', subscriptionExpiresAt: null }), false);
  assert.equal(isSubscriptionActive({ email: 'cliente@gmail.com', role: 'USER', subscriptionStatus: 'PAST_DUE', subscriptionExpiresAt: null }), false);
});

test('calculateSubscriptionPeriod: prioriza data exata de next_payment_at da Cakto', () => {
  const fixedFuture = new Date('2026-11-20T14:30:00Z');
  const result = calculateSubscriptionPeriod({
    next_payment_at: fixedFuture.toISOString()
  });

  assert.equal(result.expiresAt.toISOString(), fixedFuture.toISOString());
});

test('calculateSubscriptionPeriod: calcula períodos dinâmicos (anual, trimestral, mensal) sem hardcode de 30 dias', () => {
  const baseDate = new Date('2026-05-10T10:00:00Z');

  // Plano Anual
  const annual = calculateSubscriptionPeriod({
    created_at: baseDate.toISOString(),
    plan: { interval: 'year', interval_count: 1 }
  }, baseDate);
  assert.equal(annual.expiresAt.getUTCFullYear(), 2027);
  assert.equal(annual.expiresAt.getUTCMonth(), 4); // Maio

  // Plano Trimestral
  const quarterly = calculateSubscriptionPeriod({
    created_at: baseDate.toISOString(),
    plan: { interval: 'quarter', interval_count: 1 }
  }, baseDate);
  assert.equal(quarterly.expiresAt.getUTCMonth(), 7); // Agosto (+3 meses)

  // Plano Mensal
  const monthly = calculateSubscriptionPeriod({
    created_at: baseDate.toISOString(),
    plan: { interval: 'month', interval_count: 1 }
  }, baseDate);
  assert.equal(monthly.expiresAt.getUTCMonth(), 5); // Junho (+1 mês civil)
});
