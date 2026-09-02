import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WhatsappManager } from './WhatsappManager';

// Mock mínimo do Client do whatsapp-web.js: só expõe getNumberId
type Resolved = { [phone: string]: string | null };

function mockClient(map: Resolved) {
  return {
    async getNumberId(phone: string) {
      const v = map[phone];
      return v ? { _serialized: v } : null;
    },
  } as any;
}

test('resolveNumberId: número BR 11 dígitos é prefixado com 55', async () => {
  const client = mockClient({ '5511987654321': '5511987654321@c.us' });
  const res = await WhatsappManager.resolveNumberId(client, '11987654321');
  assert.equal(res, '5511987654321@c.us');
});

test('resolveNumberId: aceita número já formatado com 55', async () => {
  const client = mockClient({ '5511987654321': '5511987654321@c.us' });
  const res = await WhatsappManager.resolveNumberId(client, '5511987654321');
  assert.equal(res, '5511987654321@c.us');
});

test('resolveNumberId: fallback remove o 9º dígito (conta antiga)', async () => {
  // Só existe versão sem o 9
  const client = mockClient({ '551187654321': '551187654321@c.us' });
  const res = await WhatsappManager.resolveNumberId(client, '5511987654321');
  assert.equal(res, '551187654321@c.us');
});

test('resolveNumberId: fallback adiciona o 9º dígito', async () => {
  // Só existe versão com o 9
  const client = mockClient({ '5511987654321': '5511987654321@c.us' });
  const res = await WhatsappManager.resolveNumberId(client, '551187654321');
  assert.equal(res, '5511987654321@c.us');
});

test('resolveNumberId: retorna null quando número não existe no WhatsApp', async () => {
  const client = mockClient({});
  const res = await WhatsappManager.resolveNumberId(client, '11999999999');
  assert.equal(res, null);
});

test('resolveNumberId: limpa formatação (parênteses, traço, espaços)', async () => {
  const client = mockClient({ '5511987654321': '5511987654321@c.us' });
  const res = await WhatsappManager.resolveNumberId(client, '(11) 98765-4321');
  assert.equal(res, '5511987654321@c.us');
});

test('resolveNumberId: tolera exceção do getNumberId e continua tentando', async () => {
  const client = {
    async getNumberId(phone: string) {
      if (phone === '5511987654321') throw new Error('wid error');
      if (phone === '551187654321') return { _serialized: '551187654321@c.us' };
      return null;
    },
  } as any;
  const res = await WhatsappManager.resolveNumberId(client, '5511987654321');
  assert.equal(res, '551187654321@c.us');
});
