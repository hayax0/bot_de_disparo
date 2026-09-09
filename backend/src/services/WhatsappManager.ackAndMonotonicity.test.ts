import { mockMethod } from '../test-support/mockMethod';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WhatsappManager } from './WhatsappManager';
import { prisma } from '../lib/prisma';
import proto from '@whiskeysockets/baileys';

test('ACK Status: SERVER_ACK atualiza lead de SENDING para SENT', async () => {
  const fakeLead = {
    id: 'lead-1',
    status: 'SENDING',
    phone: '5521997411009',
    wppMessageId: 'msg-ack-1',
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    campaign: { workspaceId: 'ws-1' }
  };

  let updatedData: any = null;

  const originalFindFirst = prisma.lead.findFirst;
  const originalUpdate = prisma.lead.update;

  try {
    (prisma.lead as any).findFirst = async ({ where }: any) => {
      if (where.wppMessageId === 'msg-ack-1' && where.campaign?.workspaceId === 'ws-1') {
        return fakeLead;
      }
      return null;
    };

    (prisma.lead as any).update = async ({ where, data }: any) => {
      if (where.id === 'lead-1') {
        updatedData = data;
        return { ...fakeLead, ...data };
      }
      return null;
    };

    // SERVER_ACK = 2
    await WhatsappManager.handleMessageStatusUpdate('ws-1', 'msg-ack-1', 2);

    assert.ok(updatedData, 'Deve ter executado update no lead');
    assert.equal(updatedData.status, 'SENT');
    assert.ok(updatedData.sentAt instanceof Date);
  } finally {
    prisma.lead.findFirst = originalFindFirst;
    prisma.lead.update = originalUpdate;
  }
});

test('ACK Status: DELIVERY_ACK atualiza lead de SENT para DELIVERED com deliveredAt', async () => {
  const fakeLead = {
    id: 'lead-2',
    status: 'SENT',
    phone: '5521997411009',
    wppMessageId: 'msg-ack-2',
    sentAt: new Date('2026-09-08T10:00:00Z'),
    deliveredAt: null,
    readAt: null,
    campaign: { workspaceId: 'ws-1' }
  };

  let updatedData: any = null;

  const originalFindFirst = prisma.lead.findFirst;
  const originalUpdate = prisma.lead.update;

  try {
    (prisma.lead as any).findFirst = async () => fakeLead;
    (prisma.lead as any).update = async ({ data }: any) => {
      updatedData = data;
      return { ...fakeLead, ...data };
    };

    // DELIVERY_ACK = 3
    await WhatsappManager.handleMessageStatusUpdate('ws-1', 'msg-ack-2', 3);

    assert.ok(updatedData);
    assert.equal(updatedData.status, 'DELIVERED');
    assert.ok(updatedData.deliveredAt instanceof Date);
  } finally {
    prisma.lead.findFirst = originalFindFirst;
    prisma.lead.update = originalUpdate;
  }
});

test('ACK Status: READ atualiza lead para READ com readAt e deliveredAt', async () => {
  const fakeLead = {
    id: 'lead-3',
    status: 'DELIVERED',
    phone: '5521997411009',
    wppMessageId: 'msg-ack-3',
    sentAt: new Date('2026-09-08T10:00:00Z'),
    deliveredAt: new Date('2026-09-08T10:00:05Z'),
    readAt: null,
    campaign: { workspaceId: 'ws-1' }
  };

  let updatedData: any = null;

  const originalFindFirst = prisma.lead.findFirst;
  const originalUpdate = prisma.lead.update;

  try {
    (prisma.lead as any).findFirst = async () => fakeLead;
    (prisma.lead as any).update = async ({ data }: any) => {
      updatedData = data;
      return { ...fakeLead, ...data };
    };

    // READ = 4
    await WhatsappManager.handleMessageStatusUpdate('ws-1', 'msg-ack-3', 4);

    assert.ok(updatedData);
    assert.equal(updatedData.status, 'READ');
    assert.ok(updatedData.readAt instanceof Date);
    assert.equal(updatedData.deliveredAt, fakeLead.deliveredAt);
  } finally {
    prisma.lead.findFirst = originalFindFirst;
    prisma.lead.update = originalUpdate;
  }
});

test('Monotonia: ACK atrasado SERVER_ACK não faz regressão em lead DELIVERED', async () => {
  const fakeLead = {
    id: 'lead-4',
    status: 'DELIVERED',
    phone: '5521997411009',
    wppMessageId: 'msg-ack-4',
    sentAt: new Date('2026-09-08T10:00:00Z'),
    deliveredAt: new Date('2026-09-08T10:00:05Z'),
    readAt: null,
    campaign: { workspaceId: 'ws-1' }
  };

  let updateCalled = false;

  const originalFindFirst = prisma.lead.findFirst;
  const originalUpdate = prisma.lead.update;

  try {
    (prisma.lead as any).findFirst = async () => fakeLead;
    (prisma.lead as any).update = async () => {
      updateCalled = true;
    };

    // Chegada tardia de SERVER_ACK = 2
    await WhatsappManager.handleMessageStatusUpdate('ws-1', 'msg-ack-4', 2);

    assert.equal(updateCalled, false, 'Não deve atualizar nem regredir status DELIVERED para SENT');
  } finally {
    prisma.lead.findFirst = originalFindFirst;
    prisma.lead.update = originalUpdate;
  }
});

test('Monotonia: ACK atrasado DELIVERY_ACK não faz regressão em lead READ', async () => {
  const fakeLead = {
    id: 'lead-5',
    status: 'READ',
    phone: '5521997411009',
    wppMessageId: 'msg-ack-5',
    sentAt: new Date('2026-09-08T10:00:00Z'),
    deliveredAt: new Date('2026-09-08T10:00:05Z'),
    readAt: new Date('2026-09-08T10:01:00Z'),
    campaign: { workspaceId: 'ws-1' }
  };

  let updateCalled = false;

  const originalFindFirst = prisma.lead.findFirst;
  const originalUpdate = prisma.lead.update;

  try {
    (prisma.lead as any).findFirst = async () => fakeLead;
    (prisma.lead as any).update = async () => {
      updateCalled = true;
    };

    // Chegada tardia de DELIVERY_ACK = 3
    await WhatsappManager.handleMessageStatusUpdate('ws-1', 'msg-ack-5', 3);

    assert.equal(updateCalled, false, 'Não deve atualizar nem regredir status READ');
  } finally {
    prisma.lead.findFirst = originalFindFirst;
    prisma.lead.update = originalUpdate;
  }
});

test('Idempotência: ACKs duplicados não disparam atualizações redundantes', async () => {
  const fakeLead = {
    id: 'lead-6',
    status: 'SENT',
    phone: '5521997411009',
    wppMessageId: 'msg-ack-6',
    sentAt: new Date('2026-09-08T10:00:00Z'),
    campaign: { workspaceId: 'ws-1' }
  };

  let updateCalls = 0;

  const originalFindFirst = prisma.lead.findFirst;
  const originalUpdate = prisma.lead.update;

  try {
    (prisma.lead as any).findFirst = async () => fakeLead;
    (prisma.lead as any).update = async () => {
      updateCalls++;
    };

    // Segundo SERVER_ACK recebido quando já é SENT
    await WhatsappManager.handleMessageStatusUpdate('ws-1', 'msg-ack-6', 2);

    assert.equal(updateCalls, 0, 'ACK duplicado deve ser estritamente ignorado');
  } finally {
    prisma.lead.findFirst = originalFindFirst;
    prisma.lead.update = originalUpdate;
  }
});

test('Isolamento de Workspaces: ACK de Workspace A não afeta Lead do Workspace B', async () => {
  let queriedWorkspaceId: string | null = null;

  const originalFindFirst = prisma.lead.findFirst;

  try {
    (prisma.lead as any).findFirst = async ({ where }: any) => {
      queriedWorkspaceId = where.campaign?.workspaceId;
      return null;
    };

    await WhatsappManager.handleMessageStatusUpdate('ws-ALPHA', 'msg-shared-id', 3);

    assert.equal(queriedWorkspaceId, 'ws-ALPHA');
  } finally {
    prisma.lead.findFirst = originalFindFirst;
  }
});

test('REPLIED Preservado: ACK recebido após resposta do lead preserva status REPLIED e preenche timestamps', async () => {
  const fakeLead = {
    id: 'lead-replied',
    status: 'REPLIED',
    phone: '5521997411009',
    wppMessageId: 'msg-replied-1',
    sentAt: new Date('2026-09-08T10:00:00Z'),
    deliveredAt: null,
    readAt: null,
    campaign: { workspaceId: 'ws-1' }
  };

  let updatedData: any = null;

  const originalFindFirst = prisma.lead.findFirst;
  const originalUpdate = prisma.lead.update;

  try {
    (prisma.lead as any).findFirst = async () => fakeLead;
    (prisma.lead as any).update = async ({ data }: any) => {
      updatedData = data;
      return { ...fakeLead, ...data };
    };

    // Recebe DELIVERY_ACK = 3
    await WhatsappManager.handleMessageStatusUpdate('ws-1', 'msg-replied-1', 3);

    assert.ok(updatedData);
    assert.equal(updatedData.status, undefined, 'Status não deve ser alterado (permanece REPLIED)');
    assert.ok(updatedData.deliveredAt instanceof Date, 'deliveredAt deve ser preenchido');
  } finally {
    prisma.lead.findFirst = originalFindFirst;
    prisma.lead.update = originalUpdate;
  }
});

test('Retry Criptográfico: recoverMessageContent recupera do cache em memória', async () => {
  WhatsappManager.clearSentMessagesCache();
  const msgObj = { conversation: 'Proposta rápida via cache' } as any;
  WhatsappManager.cacheSentMessage('msg-cached-100', msgObj);

  const res = await WhatsappManager.recoverMessageContent({ id: 'msg-cached-100' });
  assert.equal(res, msgObj);
});

test('Retry Criptográfico: recoverMessageContent busca no banco de dados quando não está no cache', async () => {
  WhatsappManager.clearSentMessagesCache();

  const originalFindFirst = prisma.lead.findFirst;
  try {
    (prisma.lead as any).findFirst = async ({ where, select }: any) => {
      if (where.wppMessageId === 'msg-db-retry-200' && select?.messageContent) {
        return { messageContent: 'Olá! Mensagem recuperada do banco' };
      }
      return null;
    };

    const res = await WhatsappManager.recoverMessageContent({ id: 'msg-db-retry-200' });
    assert.ok(res);
    assert.equal(res?.extendedTextMessage?.text, 'Olá! Mensagem recuperada do banco');
  } finally {
    prisma.lead.findFirst = originalFindFirst;
  }
});

test('Dois Leads do mesmo telefone possuem IDs independentes e ACKs não colidem', async () => {
  const lead1 = {
    id: 'lead-A',
    status: 'SENT',
    phone: '5521997411009',
    wppMessageId: 'msg-111',
    deliveredAt: null,
    campaign: { workspaceId: 'ws-1' }
  };
  const lead2 = {
    id: 'lead-B',
    status: 'SENT',
    phone: '5521997411009',
    wppMessageId: 'msg-222',
    deliveredAt: null,
    campaign: { workspaceId: 'ws-1' }
  };

  const updatedIds: string[] = [];

  const originalFindFirst = prisma.lead.findFirst;
  const originalUpdate = prisma.lead.update;

  try {
    (prisma.lead as any).findFirst = async ({ where }: any) => {
      if (where.wppMessageId === 'msg-111') return lead1;
      if (where.wppMessageId === 'msg-222') return lead2;
      return null;
    };

    (prisma.lead as any).update = async ({ where }: any) => {
      updatedIds.push(where.id);
      return {};
    };

    // ACK para a mensagem 1
    await WhatsappManager.handleMessageStatusUpdate('ws-1', 'msg-111', 3);
    assert.deepEqual(updatedIds, ['lead-A'], 'Apenas lead-A deve ter sido atualizado');

    // ACK para a mensagem 2
    await WhatsappManager.handleMessageStatusUpdate('ws-1', 'msg-222', 3);
    assert.deepEqual(updatedIds, ['lead-A', 'lead-B'], 'lead-B deve ser atualizado pelo seu próprio messageId');
  } finally {
    prisma.lead.findFirst = originalFindFirst;
    prisma.lead.update = originalUpdate;
  }
});

test('ACKs concorrentes: compare-and-set impede DELIVERY_ACK de sobrescrever READ', async t => {
  const lead: any = { id: 'race', status: 'SENT', phone: '5511999999999', wppMessageId: 'm', deliveredAt: null, readAt: null };
  let first = true;
  mockMethod(t, prisma.lead, 'findFirst', async () => ({ ...lead }));
  mockMethod(t, prisma.lead, 'update', async ({ where, data }: any) => {
    if (first) {
      first = false;
      // Outro evento é processado entre a leitura e a gravação do ACK de entrega.
      await WhatsappManager.handleMessageStatusUpdate('w', 'm', 4);
    }
    if (where.status !== lead.status) throw Object.assign(new Error('CAS conflict'), { code: 'P2025' });
    Object.assign(lead, data);
    return lead;
  });
  await WhatsappManager.handleMessageStatusUpdate('w', 'm', 3);
  assert.equal(lead.status, 'READ');
  assert.ok(lead.readAt instanceof Date);
});

test('ACKs concorrentes: READ relê o estado quando DELIVERY_ACK vence primeiro', async t => {
  const lead: any = { id: 'race', status: 'SENT', phone: '5511999999999', wppMessageId: 'm', deliveredAt: null, readAt: null };
  let first = true;
  mockMethod(t, prisma.lead, 'findFirst', async () => ({ ...lead }));
  mockMethod(t, prisma.lead, 'update', async ({ where, data }: any) => {
    if (first) { first = false; await WhatsappManager.handleMessageStatusUpdate('w', 'm', 3); }
    if (where.status !== lead.status) throw Object.assign(new Error('CAS conflict'), { code: 'P2025' });
    Object.assign(lead, data);
    return lead;
  });
  await WhatsappManager.handleMessageStatusUpdate('w', 'm', 4);
  assert.equal(lead.status, 'READ');
  assert.ok(lead.deliveredAt instanceof Date);
});
