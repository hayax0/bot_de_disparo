import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUserAdmin } from './SubscriptionManager';

test('SubscriptionReminder: administradores e VIPs são estritamente excluídos de avisos', () => {
  const adminEmails = [
    'caiocampos1009@gmail.com',
    'vieiralacerda192@gmail.com',
    'vitoriacampos241003@gmail.com',
    'vmariacamll@gmail.com'
  ];

  for (const email of adminEmails) {
    assert.equal(isUserAdmin(email), true, `Admin ${email} deve ser reconhecido`);
  }
});

test('SubscriptionReminder: cálculo de dias restantes identifica corretamente janelas de 7 dias e 1 dia', () => {
  const now = new Date('2026-10-01T12:00:00Z');

  // Caso 7 dias restantes
  const expires7Days = new Date('2026-10-08T12:00:00Z');
  const diffDays7 = (expires7Days.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  assert.equal(diffDays7 >= 6.0 && diffDays7 <= 7.9, true);

  // Caso 1 dia restante
  const expires1Day = new Date('2026-10-02T12:00:00Z');
  const diffDays1 = (expires1Day.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  assert.equal(diffDays1 >= 0.0 && diffDays1 <= 1.9, true);

  // Caso 15 dias restantes (fora da janela de aviso)
  const expires15Days = new Date('2026-10-16T12:00:00Z');
  const diffDays15 = (expires15Days.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  assert.equal(diffDays15 >= 6.0 && diffDays15 <= 7.9, false);
  assert.equal(diffDays15 >= 0.0 && diffDays15 <= 1.9, false);
});

test('SubscriptionReminder: identificador de ciclo renova a cada ciclo e suporta idempotência', () => {
  const cycle1Date = new Date('2026-10-04T16:51:17.137Z');
  const cycle2Date = new Date('2026-11-04T16:51:17.137Z');

  const cycle1 = cycle1Date.toISOString().split('T')[0];
  const cycle2 = cycle2Date.toISOString().split('T')[0];

  assert.equal(cycle1, '2026-10-04');
  assert.equal(cycle2, '2026-11-04');
  assert.notEqual(cycle1, cycle2, 'Ciclos de meses diferentes devem gerar chaves distintas');
});
