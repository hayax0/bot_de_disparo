import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENV } from '../config/env';
import { EmailService } from './EmailService';

test('EmailService: ENV.CAKTO_CHECKOUT_URL está devidamente configurado com link oficial da Cakto', () => {
  assert.equal(typeof ENV.CAKTO_CHECKOUT_URL, 'string');
  assert.equal(ENV.CAKTO_CHECKOUT_URL.includes('pay.cakto.com.br'), true);
});

test('EmailService: sendRegistrationInvitationEmail retorna erro gracioso quando RESEND_API_KEY não estiver configurada', async () => {
  const originalKey = ENV.RESEND_API_KEY;
  (ENV as any).RESEND_API_KEY = '';

  const result = await EmailService.sendRegistrationInvitationEmail({
    email: 'novo.cliente@teste.com',
    name: 'Cliente Teste'
  });

  assert.equal(result.success, false);
  assert.equal(result.error, 'RESEND_API_KEY não configurada');

  (ENV as any).RESEND_API_KEY = originalKey;
});

test('EmailService: sendExpirationReminderEmail aceita janela de 5 dias e 1 dia', async () => {
  const originalKey = ENV.RESEND_API_KEY;
  (ENV as any).RESEND_API_KEY = '';

  const result5Days = await EmailService.sendExpirationReminderEmail({
    email: 'cliente@teste.com',
    name: 'Cliente Teste',
    expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    daysRemaining: 5
  });

  assert.equal(result5Days.success, false);
  assert.equal(result5Days.error, 'RESEND_API_KEY não configurada');

  const result1Day = await EmailService.sendExpirationReminderEmail({
    email: 'cliente@teste.com',
    name: 'Cliente Teste',
    expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    daysRemaining: 1
  });

  assert.equal(result1Day.success, false);
  assert.equal(result1Day.error, 'RESEND_API_KEY não configurada');

  (ENV as any).RESEND_API_KEY = originalKey;
});
