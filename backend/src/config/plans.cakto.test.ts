import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommercialItem } from './plans';

test('Cakto: referência do pedido não substitui nem conflita com a oferta comercial', () => {
  for (const refId of ['914vPcJ', '9gwgit3', undefined]) {
    const result = resolveCommercialItem({ refId, offer: { id: '33zk2g2' } });
    assert.equal(result.type, 'PLAN');
    assert.equal(result.plan?.id, 'SCALE');
  }
  assert.equal(resolveCommercialItem({ refId: '33zk2g2' }).type, 'UNKNOWN');
});

test('Cakto: checkoutUrl oficial aceita oferta simples e formato com ID numérico', () => {
  for (const url of ['https://pay.cakto.com.br/33zk2g2?callback=ok', 'https://pay.cakto.com.br/33zk2g2_1165304']) {
    assert.equal(resolveCommercialItem({ checkoutUrl: url }).plan?.id, 'SCALE');
  }
  for (const url of ['http://pay.cakto.com.br/33zk2g2', 'https://example.com/33zk2g2', 'https://pay.cakto.com.br/33zk2g2/extra', 'https://pay.cakto.com.br/unknown', 'https://pay.cakto.com.br/33zk2g2_1165278']) {
    assert.equal(resolveCommercialItem({ checkoutUrl: url }).type, 'UNKNOWN');
  }
});

test('Cakto: ofertas desconhecidas ou identificadores comerciais divergentes continuam bloqueados', () => {
  for (const item of [
    { offer: { id: 'unknown' }, product: { name: 'Plano Premium (SCALE)' } },
    { offer: { id: '33zk2g2' }, offer_id: '1165278' },
    { offer: { id: '33zk2g2' }, offer_code: 'unknown' },
  ]) assert.equal(resolveCommercialItem(item).type, 'UNKNOWN');
});
