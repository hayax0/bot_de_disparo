import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/prisma';
import { AiCopyService, setTestAiProvider } from './AiCopyService';
import { CreditWalletService } from './CreditWalletService';

test('AiCopyService: buildPrompts monta prompts com dados ricos do lead e tom selecionado', () => {
  const prompts = AiCopyService.buildPrompts({
    leadTitle: 'Dra. Ana Odontologia LTDA',
    phone: '5511999998888',
    website: 'https://draanaodonto.com.br',
    neighborhood: 'Vila Mariana',
    senderName: 'Carlos',
    senderCompany: 'Agência Web',
    offerDescription: 'Criação de landing page com alta conversão',
    toneStyle: 'CONSULTATIVE',
  });

  assert.ok(prompts.systemPrompt.includes('WhatsApp'));
  assert.ok(prompts.userPrompt.includes('Ana Odontologia'));
  assert.ok(prompts.userPrompt.includes('https://draanaodonto.com.br'));
  assert.ok(prompts.userPrompt.includes('Vila Mariana'));
  assert.ok(prompts.userPrompt.includes('Criação de landing page'));
});

test('AiCopyService: buildPrompts identifica ausência de website próprio', () => {
  const prompts = AiCopyService.buildPrompts({
    leadTitle: 'Mecânica do Zé',
    phone: '5511988887777',
    website: null,
    neighborhood: 'Mooca',
    senderName: 'Carlos',
    senderCompany: 'Agência Web',
    offerDescription: 'Gestão de tráfego pago',
    toneStyle: 'DIRECT',
  });

  assert.ok(prompts.userPrompt.includes('Não possui website próprio'));
  assert.ok(prompts.userPrompt.includes('Mooca'));
});

test('AiCopyService: generateDevelopmentFallback gera mensagem amigável sem chave configurada', async () => {
  const copyComSite = await AiCopyService.callOpenAiApi({
    leadTitle: 'Padaria Estrela',
    phone: '5511977776666',
    website: 'https://padariaestrela.com.br',
    neighborhood: 'Pinheiros',
    senderName: 'Carlos',
    senderCompany: 'Agência Web',
    offerDescription: 'Cardápio digital interativo',
    toneStyle: 'FRIENDLY',
  });

  assert.ok(copyComSite.includes('Estrela'));
  assert.ok(copyComSite.includes('Pinheiros'));
});

test('AiCopyService: fluxo em lote gera mensagens, atualiza leads e debita créditos atomicamente', async () => {
  const unique = Date.now();
  // Mock do provedor de IA para execução determinística
  setTestAiProvider(async (input) => {
    return `Olá da ${input.leadTitle}! Vimos que você atua em ${input.neighborhood || 'sua região'}. Oferecemos: ${input.offerDescription}.`;
  });

  try {
    // 1. Cria usuário com plano PRO e saldo de 10 créditos
    const user = await prisma.user.create({
      data: {
        email: `ai_test_${unique}@test.local`,
        password: 'hash',
        name: 'Usuário Teste IA',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 86400000),
      }
    });

    const wallet = await CreditWalletService.getOrCreateWallet(user.id);
    await prisma.creditWallet.update({
      where: { id: wallet.id },
      data: { monthlyBalance: 10, reservedBalance: 0 }
    });

    const workspace = await prisma.workspace.create({
      data: {
        userId: user.id,
        name: `Workspace IA ${unique}`
      }
    });

    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: workspace.id,
        name: `Campanha IA ${unique}`,
        status: 'PAUSED'
      }
    });

    // 2. Cria 3 leads pendentes
    const lead1 = await prisma.lead.create({
      data: {
        campaignId: campaign.id,
        title: 'Clínica Sorriso 1',
        phone: `551199${String(unique).slice(-7)}1`,
        website: 'https://sorriso1.com.br',
        neighborhood: 'Jardins',
        status: 'PENDING'
      }
    });
    const lead2 = await prisma.lead.create({
      data: {
        campaignId: campaign.id,
        title: 'Clínica Sorriso 2',
        phone: `551199${String(unique).slice(-7)}2`,
        website: null,
        neighborhood: 'Perdizes',
        status: 'PENDING'
      }
    });

    // 3. Executa a geração em lote para os 2 leads
    const result = await AiCopyService.generateBatchForCampaign({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      offerDescription: 'Consultoria de prospecção e vendas',
      toneStyle: 'CONSULTATIVE',
    });

    assert.strictEqual(result.totalRequested, 2);
    assert.strictEqual(result.generatedCount, 2);
    assert.strictEqual(result.failedCount, 0);

    // 4. Valida se os leads foram atualizados com o texto da IA
    const updatedLead1 = await prisma.lead.findUnique({ where: { id: lead1.id } });
    const updatedLead2 = await prisma.lead.findUnique({ where: { id: lead2.id } });

    assert.ok(updatedLead1?.messageContent?.includes('Sorriso 1'));
    assert.strictEqual((updatedLead1 as any)?.aiGenerated, true);
    assert.ok((updatedLead1 as any)?.aiGeneratedAt);

    assert.ok(updatedLead2?.messageContent?.includes('Sorriso 2'));
    assert.strictEqual((updatedLead2 as any)?.aiGenerated, true);

    // 5. Valida que a carteira debitou exatamente 2 créditos (saldo restante = 8, reserved = 0)
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 8);
    assert.strictEqual(summary.reservedBalance, 0);

    // 6. Teste de regeneração de lead individual (consome 1 crédito adicional)
    const regen = await AiCopyService.regenerateSingleLead({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      leadId: lead1.id,
      offerDescription: 'Nova oferta de IA refinada',
      toneStyle: 'DIRECT'
    });
    assert.ok(regen.messageContent.includes('Nova oferta'));

    const summaryAfterRegen = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summaryAfterRegen.monthlyBalance, 7);
    assert.strictEqual(summaryAfterRegen.reservedBalance, 0);

    // 7. Teste de edição manual de mensagem (não consome créditos)
    await AiCopyService.updateLeadMessage({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      leadId: lead1.id,
      messageContent: 'Texto editado manualmente pelo usuário sem IA'
    });

    const leadManual = await prisma.lead.findUnique({ where: { id: lead1.id } });
    assert.strictEqual(leadManual?.messageContent, 'Texto editado manualmente pelo usuário sem IA');

    const summaryManual = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summaryManual.monthlyBalance, 7); // Continua 7!

    // Limpeza
    await prisma.lead.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.creditTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.creditReservation.deleteMany({ where: { userId: user.id } });
    await prisma.creditWallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  } finally {
    setTestAiProvider(null);
  }
});
