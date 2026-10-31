import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { AiFollowupService } from './AiFollowupService';
import { AiCopyService, setTestAiProvider } from './AiCopyService';
import { AnonymizationService } from './AnonymizationService';

test('Sugestão de retorno: cobrança atômica, concorrência, privacidade e recuperação real', async t => {
  const [database] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.equal(database.name, 'bot_prospeccao_test');
  const user = await prisma.user.create({ data: { email: `followup-ai-${randomUUID()}@test.local`, password: 'hash', name: 'Consultor', emailVerifiedAt: new Date(), planId: 'PRO', subscriptionStatus: 'ACTIVE', subscriptionExpiresAt: new Date(Date.now() + 86400000), wallet: { create: { monthlyBalance: 20 } }, workspaces: { create: { name: 'Agência' } } }, include: { workspaces: true } });
  const workspace = user.workspaces[0];
  const campaign = await prisma.campaign.create({ data: { name: 'Histórico', workspaceId: workspace.id } });
  const lead = await prisma.lead.create({ data: { campaignId: campaign.id, title: 'Empresa', phone: '5521999933333', status: 'REPLIED', sentAt: new Date(), sendStartedAt: new Date(), messageContent: 'Mensagem realmente enviada', wppMessageId: 'original' } });
  const input = { userId: user.id, workspaceId: workspace.id, campaignId: campaign.id, leadId: lead.id, instruction: 'Retomar a apresentação de criação de sites, perguntando se faz sentido conversar.', idempotencyKey: randomUUID() };
  const wallet = () => prisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } });
  t.after(async () => { setTestAiProvider(null); await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect(); });
  let calls = 0;
  setTestAiProvider(async received => { calls++; assert.equal(received.purpose, 'FOLLOW_UP'); return 'Olá, faz sentido retomarmos a conversa sobre o site da empresa?'; });
  await t.test('Mensagem enviada permanece intocada, uma cobrança e replay devolve a mesma sugestão', async () => {
    const beforeLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    const beforeCampaign = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    const result = await AiFollowupService.suggest(input);
    assert.match(result.messageContent, /retomarmos/); assert.equal(calls, 1);
    assert.deepEqual(await prisma.lead.findUnique({ where: { id: lead.id } }), beforeLead);
    assert.deepEqual(await prisma.campaign.findUnique({ where: { id: campaign.id } }), beforeCampaign);
    assert.equal((await wallet()).monthlyBalance, 19); assert.equal((await wallet()).reservedBalance, 0);
    const replay = await AiFollowupService.suggest(input); assert.equal(replay.messageContent, result.messageContent); assert.equal(replay.isExisting, true); assert.equal(calls, 1);
    await assert.rejects(AiFollowupService.suggest({ ...input, instruction: 'Outra solicitação divergente.' }), /outros dados/);
    await assert.rejects(AiCopyService.regenerateSingleLead(input), /já foi enviado/);
  });
  await t.test('Rejeita tenant, orientação inválida e contato bloqueado antes de reservar', async () => {
    const before = await wallet();
    await assert.rejects(AiFollowupService.suggest({ ...input, workspaceId: randomUUID(), idempotencyKey: randomUUID() }), /não encontrado/);
    await assert.rejects(AiFollowupService.suggest({ ...input, instruction: 'oi' }), /orientação/);
    await prisma.blacklist.create({ data: { workspaceId: workspace.id, scope: 'WORKSPACE', phone: '+55 (21) 99993-3333', reason: 'MANUAL', source: 'USER_ACTION' } });
    await assert.rejects(AiFollowupService.suggest({ ...input, idempotencyKey: randomUUID() }), /bloqueado/);
    assert.deepEqual(await wallet(), before); assert.equal(calls, 1);
    await prisma.blacklist.deleteMany({ where: { workspaceId: workspace.id } });
  });
  await t.test('Duas solicitações com a mesma chave não duplicam provedor nem reserva', async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const key = randomUUID();
    setTestAiProvider(async () => { calls++; entered(); await barrier; return 'Podemos retomar a apresentação nesta semana?'; });
    const first = AiFollowupService.suggest({ ...input, idempotencyKey: key }); await started;
    await assert.rejects(AiFollowupService.suggest({ ...input, idempotencyKey: key }), /em processamento/);
    assert.equal((await wallet()).reservedBalance, 1); release(); const result = await first;
    assert.equal((await wallet()).reservedBalance, 0); assert.equal((await wallet()).monthlyBalance, 18);
    assert.equal((await AiFollowupService.suggest({ ...input, idempotencyKey: key })).messageContent, result.messageContent);
    assert.equal(calls, 2);
  });
  await t.test('Falha no provedor libera crédito; retry da mesma chave não cobra nem chama novamente', async () => {
    const key = randomUUID(); setTestAiProvider(async () => { calls++; throw new Error('Falha simulada'); });
    await assert.rejects(AiFollowupService.suggest({ ...input, idempotencyKey: key }), /Falha simulada/);
    assert.equal((await wallet()).monthlyBalance, 18); assert.equal((await wallet()).reservedBalance, 0);
    await assert.rejects(AiFollowupService.suggest({ ...input, idempotencyKey: key }), /nova sugestão/); assert.equal(calls, 3);
  });
  await t.test('Interrupção após claim é encerrada, reserva liberada, sem repetir chamada paga', async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }); const barrier = new Promise<void>(resolve => { release = resolve; });
    const key = randomUUID(); setTestAiProvider(async () => { calls++; entered(); await barrier; return 'Uma sugestão que não será persistida.'; });
    const pending = AiFollowupService.suggest({ ...input, idempotencyKey: key }); await started;
    await AiFollowupService.recoverInterrupted(new Date(Date.now() + 1000));
    assert.equal((await wallet()).reservedBalance, 0); release(); await assert.rejects(pending, /encerrada/);
    assert.equal((await wallet()).monthlyBalance, 18); assert.equal(calls, 4);
    await assert.rejects(AiFollowupService.suggest({ ...input, idempotencyKey: key }), /nova sugestão/);
  });
  await t.test('Exclusão da campanha durante o provedor libera a reserva mesmo com operação em cascade', async () => {
    const disposableCampaign = await prisma.campaign.create({ data: { workspaceId: workspace.id, name: 'Lista temporária' } });
    const disposableLead = await prisma.lead.create({ data: { campaignId: disposableCampaign.id, title: 'Contato temporário', phone: '5521999911111', status: 'SENT' } });
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }); const barrier = new Promise<void>(resolve => { release = resolve; });
    setTestAiProvider(async () => { entered(); await barrier; return 'Retorno temporário.'; });
    const pending = AiFollowupService.suggest({ ...input, campaignId: disposableCampaign.id, leadId: disposableLead.id, idempotencyKey: randomUUID() }); await started;
    await prisma.campaign.delete({ where: { id: disposableCampaign.id } });
    release(); await assert.rejects(pending, /removido/);
    assert.equal((await wallet()).monthlyBalance, 18); assert.equal((await wallet()).reservedBalance, 0);
  });
  await t.test('Recupera reserva órfã após cascade e interrupção sem operação para consultar', async () => {
    const temporaryCampaign = await prisma.campaign.create({ data: { workspaceId: workspace.id, name: 'Interrompida' } });
    const temporaryLead = await prisma.lead.create({ data: { campaignId: temporaryCampaign.id, title: 'Temporário', phone: '5521999912222' } });
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }); const barrier = new Promise<void>(resolve => { release = resolve; });
    setTestAiProvider(async () => { entered(); await barrier; return 'Texto temporário.'; });
    const pending = AiFollowupService.suggest({ ...input, campaignId: temporaryCampaign.id, leadId: temporaryLead.id, idempotencyKey: randomUUID() }); await started;
    await prisma.campaign.delete({ where: { id: temporaryCampaign.id } });
    await AiFollowupService.recoverInterrupted(new Date(Date.now() + 1000));
    assert.equal((await wallet()).reservedBalance, 0); release(); await assert.rejects(pending, /removido/);
    assert.equal((await wallet()).monthlyBalance, 18);
  });
  await t.test('Anonimização concorrente remove dados e impede persistência tardia/cobrança', async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }); const barrier = new Promise<void>(resolve => { release = resolve; });
    const key = randomUUID(); setTestAiProvider(async () => { calls++; entered(); await barrier; return 'Conteúdo para apagar.'; });
    const pending = AiFollowupService.suggest({ ...input, idempotencyKey: key }); await started;
    await AnonymizationService.anonymizeContact({ phone: lead.phone, workspaceId: workspace.id });
    release(); await assert.rejects(pending, /removido/);
    const operations = await prisma.aiOperation.findMany({ where: { userId: user.id, type: 'FOLLOW_UP' } });
    assert.ok(operations.every(op => !op.resultSummary && !op.offerDescription));
    assert.equal((await wallet()).monthlyBalance, 18); assert.equal((await wallet()).reservedBalance, 0);
    await assert.rejects(AiFollowupService.suggest({ ...input, idempotencyKey: randomUUID() }), /removido/);
    assert.equal(calls, 5);
  });
});
