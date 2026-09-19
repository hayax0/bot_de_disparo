import test from 'node:test';
import assert from 'node:assert/strict';
import { ContactPolicyService, normalizeOptOutText } from './ContactPolicyService';
import { AnonymizationService, generateAnonymizedPhoneId } from './AnonymizationService';
import { prisma } from '../lib/prisma';
import { mockMethod } from '../test-support/mockMethod';

test('Opt-Out Regex: detecta frases claras de descadastro (LGPD)', () => {
  const validOptOuts = [
    'parar',
    'PARAR',
    'pare',
    'Pare!',
    'stop',
    'Não quero receber',
    'nao quero receber mais mensagens',
    'favor remover meu número',
    'por favor me descadastre',
    'me tira da lista',
    'pare de mandar mensagem',
    'nao envie mais nada aqui',
  ];

  for (const text of validOptOuts) {
    const result = ContactPolicyService.isOptOutMessage(text);
    assert.equal(result.isOptOut, true, `Deveria detectar opt-out em: "${text}"`);
  }
});

test('Opt-Out Regex: previne falsos positivos em frases cotidianas', () => {
  const nonOptOuts = [
    'quero sair do escritório às 18h',
    'vamos parar para almoçar hoje?',
    'não posso parar de trabalhar agora',
    'parabéns pelo trabalho e proposta!',
    'qual é o preço?',
    'já sou cliente de vocês',
    'olá, tudo bem?',
    'me manda mais informações por favor',
  ];

  for (const text of nonOptOuts) {
    const result = ContactPolicyService.isOptOutMessage(text);
    assert.equal(result.isOptOut, false, `Não deveria acusar opt-out em: "${text}"`);
  }
});

test('Blacklist: respeita isolamento entre workspaces e bloqueio global', async (t) => {
  // Mock da consulta ao banco
  mockMethod(t, prisma.blacklist, 'findFirst', async ({ where }: any) => {
    // Telefone '5511999990001' é da blacklist do workspace 'ws-A'
    if (where.phone === '5511999990001') {
      const hasWsA = where.OR?.some((cond: any) => cond.workspaceId === 'ws-A');
      if (hasWsA) return { id: 'bl-1', scope: 'WORKSPACE' };
    }
    // Telefone '5511999999999' é GLOBAL
    if (where.phone === '5511999999999') {
      const hasGlobal = where.OR?.some((cond: any) => cond.scope === 'GLOBAL');
      if (hasGlobal) return { id: 'bl-global', scope: 'GLOBAL' };
    }
    return null;
  });

  // Telefone bloqueado no Workspace A deve constar bloqueado para o Workspace A
  const blockedWsA = await ContactPolicyService.isBlacklisted('5511999990001', 'ws-A');
  assert.equal(blockedWsA, true);

  // Telefone bloqueado no Workspace A NÃO deve estar bloqueado no Workspace B (isolamento)
  const blockedWsB = await ContactPolicyService.isBlacklisted('5511999990001', 'ws-B');
  assert.equal(blockedWsB, false);

  // Telefone bloqueado como GLOBAL deve estar bloqueado em qualquer workspace
  const globalInWsA = await ContactPolicyService.isBlacklisted('5511999999999', 'ws-A');
  const globalInWsB = await ContactPolicyService.isBlacklisted('5511999999999', 'ws-B');
  assert.equal(globalInWsA, true);
  assert.equal(globalInWsB, true);
});

test('Anonimização LGPD: gera ID HMAC estável e irreversível sem expor número', () => {
  const phone = '5511987654321';
  const id1 = generateAnonymizedPhoneId(phone);
  const id2 = generateAnonymizedPhoneId(' (11) 98765-4321 ');

  assert.equal(id1.startsWith('anon_'), true);
  assert.equal(id1, id2); // Idempotente
  assert.equal(id1.includes('98765'), false); // Não vaza o telefone no hash
});
