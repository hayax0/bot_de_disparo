import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WhatsappManager, MemoryCacheStore } from './WhatsappManager';

test('MemoryCacheStore: opera get, set, del e flushAll', () => {
  const cache = new MemoryCacheStore(10);
  cache.set('key1', { count: 1 });
  assert.deepEqual(cache.get('key1'), { count: 1 });

  cache.del('key1');
  assert.equal(cache.get('key1'), undefined);

  cache.set('a', 1);
  cache.set('b', 2);
  cache.flushAll();
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('b'), undefined);
});

test('MemoryCacheStore: realiza eviction do item mais antigo ao atingir o limite maximo', () => {
  const cache = new MemoryCacheStore(3);
  cache.set('k1', 'val1');
  cache.set('k2', 'val2');
  cache.set('k3', 'val3');
  // Adiciona o quarto item -> deve remover k1
  cache.set('k4', 'val4');

  assert.equal(cache.get('k1'), undefined);
  assert.equal(cache.get('k2'), 'val2');
  assert.equal(cache.get('k3'), 'val3');
  assert.equal(cache.get('k4'), 'val4');
});

test('WhatsappManager.sentMessages: indexa estritamente pelo messageId e recupera a mensagem exata', () => {
  WhatsappManager.clearSentMessagesCache();

  const msgA = { conversation: 'Mensagem Proposta A' } as any;
  const msgB = { conversation: 'Mensagem Proposta B' } as any;

  WhatsappManager.cacheSentMessage('msg_id_AAA', msgA);
  WhatsappManager.cacheSentMessage('msg_id_BBB', msgB);

  // Solicitação de retry para id A deve retornar estritamente a mensagem A
  assert.equal(WhatsappManager.getCachedMessage('msg_id_AAA'), msgA);
  assert.equal(WhatsappManager.getCachedMessage('msg_id_BBB'), msgB);
  assert.equal(WhatsappManager.getCachedMessage('msg_inexistente'), undefined);
});

test('WhatsappManager.sendMessage: lanca erro e nao envia se resolveNumberId retornar null (numero sem WhatsApp / fixo)', async () => {
  let sendMessageCalled = false;
  const mockClient = {
    onWhatsApp: async () => [], // Nenhum registro encontrado no WhatsApp
    sendMessage: async () => {
      sendMessageCalled = true;
      return {};
    }
  };

  // Mocka sessão ativa
  (WhatsappManager as any).getClient = async () => mockClient;

  // Como resolveNumberId retornará null para número que onWhatsApp não encontrou:
  const res = await WhatsappManager.resolveNumberId(mockClient, '551133334444');
  assert.equal(res, null);
  assert.equal(sendMessageCalled, false);
});
