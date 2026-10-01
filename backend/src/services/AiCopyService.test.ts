import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/prisma';
import { AiCopyService, setTestAiProvider } from './AiCopyService';
import { CreditWalletService } from './CreditWalletService';
import { CompanySearchService, setTestPlacesProvider } from './CompanySearchService';
import { ApifyCredentialService } from './ApifyCredentialService';
import { ENV } from '../config/env';

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

// Helper para criação de fixtures isoladas
async function createTestFixtures(prefix: string) {
  const unique = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const user = await prisma.user.create({
    data: {
      email: `${unique}@test.local`,
      password: 'hash',
      name: `User ${unique}`,
      role: 'USER',
      planId: 'PRO',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date(Date.now() + 86400000),
    },
  });

  const wallet = await CreditWalletService.getOrCreateWallet(user.id);
  await prisma.creditWallet.update({
    where: { id: wallet.id },
    data: { monthlyBalance: 20, reservedBalance: 0 },
  });

  const workspace = await prisma.workspace.create({
    data: {
      userId: user.id,
      name: `Workspace ${unique}`,
    },
  });

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      name: `Campanha ${unique}`,
      status: 'PAUSED',
    },
  });

  return { user, wallet, workspace, campaign, unique };
}

// 1. Duas solicitações simultâneas com a mesma chave executam apenas uma operação
test('Cenário 1: Duas solicitações simultâneas com a mesma chave executam apenas uma operação', async () => {
  let aiCallCount = 0;
  setTestAiProvider(async (input) => {
    aiCallCount++;
    return `Olá da ${input.leadTitle}!`;
  });

  const { user, workspace, campaign, unique } = await createTestFixtures('c1');
  const lead1 = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead 1', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });
  const lead2 = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead 2', phone: `551199${unique.slice(-7)}2`, status: 'PENDING' },
  });

  const idempotencyKey = `idemp_batch_${unique}`;

  try {
    const [res1, res2] = await Promise.all([
      AiCopyService.initiateBatchGeneration({
        userId: user.id,
        workspaceId: workspace.id,
        campaignId: campaign.id,
        offerDescription: 'Consultoria de prospecção comercial',
        toneStyle: 'CONSULTATIVE',
        idempotencyKey,
        processSyncForTest: true,
      }),
      AiCopyService.initiateBatchGeneration({
        userId: user.id,
        workspaceId: workspace.id,
        campaignId: campaign.id,
        offerDescription: 'Consultoria de prospecção comercial',
        toneStyle: 'CONSULTATIVE',
        idempotencyKey,
        processSyncForTest: true,
      }),
    ]);

    assert.strictEqual(res1.operationId, res2.operationId);
    // Exatamente 2 chamadas de IA foram feitas (1 por lead), e não 4
    assert.strictEqual(aiCallCount, 2);

    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 18);
  } finally {
    setTestAiProvider(null);
  }
});

// 2. Repetir uma operação concluída não gera nem cobra novamente
test('Cenário 2: Repetir uma operação concluída não gera nem cobra novamente', async () => {
  let callCountC2 = 0;
  setTestAiProvider(async (input) => {
    callCountC2++;
    return `Olá para ${input.leadTitle}!`;
  });

  const { user, workspace, campaign, unique } = await createTestFixtures('c2');
  await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead 1', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });

  const idempotencyKey = `idemp_replay_${unique}`;

  try {
    const res1 = await AiCopyService.initiateBatchGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      offerDescription: 'Sites e Landing Pages',
      toneStyle: 'DIRECT',
      idempotencyKey,
      processSyncForTest: true,
    });
    assert.strictEqual(res1.status, 'COMPLETED');
    assert.strictEqual(callCountC2, 1);

    const summary1 = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary1.monthlyBalance, 19);

    // Repete exatamente a mesma operação
    const res2 = await AiCopyService.initiateBatchGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      offerDescription: 'Sites e Landing Pages',
      toneStyle: 'DIRECT',
      idempotencyKey,
      processSyncForTest: true,
    });

    assert.strictEqual(res2.operationId, res1.operationId);
    assert.strictEqual(res2.isExisting, true);
    // Não executou o provedor de IA novamente
    assert.strictEqual(callCountC2, 1);

    const summary2 = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary2.monthlyBalance, 19);
  } finally {
    setTestAiProvider(null);
  }
});

// 3. Mesma chave com outro payload ou usuário é rejeitada
test('Cenário 3: Mesma chave com outro payload ou usuário é rejeitada', async () => {
  setTestAiProvider(async () => 'OK');
  const { user, workspace, campaign, unique } = await createTestFixtures('c3');
  await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead 1', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });

  const idempotencyKey = `idemp_mismatch_${unique}`;

  try {
    await AiCopyService.initiateBatchGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      offerDescription: 'Proposta Original Inicial',
      toneStyle: 'CONSULTATIVE',
      idempotencyKey,
      processSyncForTest: true,
    });

    // Tenta reutilizar com payload diferente (outra oferta)
    await assert.rejects(
      async () => {
        await AiCopyService.initiateBatchGeneration({
          userId: user.id,
          workspaceId: workspace.id,
          campaignId: campaign.id,
          offerDescription: 'Proposta Totalmente Modificada',
          toneStyle: 'CONSULTATIVE',
          idempotencyKey,
        });
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 409);
        assert.ok(err.message.includes('Chave de idempotência já utilizada'));
        return true;
      }
    );

    // Cria outro usuário legítimo com sua própria campanha
    const fixtureUser2 = await createTestFixtures('c3_user2');
    await prisma.lead.create({
      data: { campaignId: fixtureUser2.campaign.id, title: 'Lead User 2', phone: `551199${unique.slice(-7)}9`, status: 'PENDING' },
    });

    // Tenta reutilizar com outro usuário
    await assert.rejects(
      async () => {
        await AiCopyService.initiateBatchGeneration({
          userId: fixtureUser2.user.id,
          workspaceId: fixtureUser2.workspace.id,
          campaignId: fixtureUser2.campaign.id,
          offerDescription: 'Proposta Original Inicial',
          toneStyle: 'CONSULTATIVE',
          idempotencyKey,
        });
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );
  } finally {
    setTestAiProvider(null);
  }
});

// 4. Falha de liquidação não deixa mensagem nova salva sem cobrança
test('Cenário 4: Falha de liquidação não deixa mensagem nova salva sem cobrança', async () => {
  setTestAiProvider(async () => 'Mensagem Nova Gerada Pela IA');
  const { user, workspace, campaign, unique } = await createTestFixtures('c4');
  const lead = await prisma.lead.create({
    data: {
      campaignId: campaign.id,
      title: 'Lead Teste Rollback',
      phone: `551199${unique.slice(-7)}1`,
      status: 'PENDING',
      messageContent: 'Texto Antigo Original Preservado',
    },
  });

  // Força o CreditWalletService.settleReservation a lançar erro simulando falha no banco
  const originalSettle = CreditWalletService.settleReservation;
  CreditWalletService.settleReservation = async () => {
    throw new Error('Falha simulada na liquidação bancária');
  };

  try {
    await assert.rejects(
      async () => {
        await AiCopyService.regenerateSingleLead({
          userId: user.id,
          workspaceId: workspace.id,
          campaignId: campaign.id,
          leadId: lead.id,
          offerDescription: 'Oferta de automação',
          toneStyle: 'DIRECT',
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('Falha simulada na liquidação'));
        return true;
      }
    );

    // Reconsulta o lead: o texto antigo deve ter sido preservado pelo rollback atômico
    const currentLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    assert.strictEqual(currentLead?.messageContent, 'Texto Antigo Original Preservado');

    // A carteira deve continuar com os 20 créditos (nenhum débito indevido)
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 20);
    assert.strictEqual(summary.reservedBalance, 0);
  } finally {
    CreditWalletService.settleReservation = originalSettle;
    setTestAiProvider(null);
  }
});

// 5. Falhas parciais cobram somente resultados efetivamente entregues
test('Cenário 5: Falhas parciais cobram somente resultados efetivamente entregues', async () => {
  const { user, workspace, campaign, unique } = await createTestFixtures('c5');

  const lead1 = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead Sucesso 1', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });
  const lead2 = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead Falha 2', phone: `551199${unique.slice(-7)}2`, status: 'PENDING' },
  });
  const lead3 = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead Sucesso 3', phone: `551199${unique.slice(-7)}3`, status: 'PENDING' },
  });

  setTestAiProvider(async (input) => {
    if (input.leadTitle.includes('Falha')) {
      throw new Error('Erro temporário no provedor externo');
    }
    return `Olá ${input.leadTitle}!`;
  });

  try {
    const res = await AiCopyService.initiateBatchGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      offerDescription: 'Gestão de tráfego e marketing',
      toneStyle: 'FRIENDLY',
      processSyncForTest: true,
    });

    assert.strictEqual(res.completedLeads, 2);
    assert.strictEqual(res.failedLeads, 1);

    const l1 = await prisma.lead.findUnique({ where: { id: lead1.id } });
    const l2 = await prisma.lead.findUnique({ where: { id: lead2.id } });
    const l3 = await prisma.lead.findUnique({ where: { id: lead3.id } });

    assert.ok(l1?.messageContent?.includes('Sucesso 1'));
    assert.strictEqual(l2?.messageContent, null); // Não alterado
    assert.ok(l3?.messageContent?.includes('Sucesso 3'));

    // Debitou estritamente 2 créditos (saldo de 20 foi para 18; o crédito de lead2 foi estornado)
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 18);
    assert.strictEqual(summary.reservedBalance, 0);
  } finally {
    setTestAiProvider(null);
  }
});

// 6. Reinício/retry recupera o progresso sem duplicar cobrança
test('Cenário 6: Reinício/retry recupera o progresso sem duplicar cobrança', async () => {
  setTestAiProvider(async (input) => `Copy para ${input.leadTitle}`);
  const { user, workspace, campaign, unique } = await createTestFixtures('c6');

  await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead 1', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });

  try {
    const res = await AiCopyService.initiateBatchGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      offerDescription: 'Oferta de automação',
      processSyncForTest: true,
    });

    // Simula retry do worker na mesma operação
    await AiCopyService.processOperationJob(res.operationId);

    const op = await prisma.aiOperation.findUnique({ where: { id: res.operationId } });
    assert.strictEqual(op?.status, 'COMPLETED');
    assert.strictEqual(op?.creditsConsumed, 1);

    // Saldo debitou apenas 1 crédito no total
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 19);
  } finally {
    setTestAiProvider(null);
  }
});

// 7. Edição/regeneração de lead já enviado é bloqueada
test('Cenário 7: Edição/regeneração de lead já enviado é bloqueada', async () => {
  const { user, workspace, campaign, unique } = await createTestFixtures('c7');

  const leadEnviado = await prisma.lead.create({
    data: {
      campaignId: campaign.id,
      title: 'Cliente Fiel',
      phone: `551199${unique.slice(-7)}1`,
      status: 'SENT',
      sendStartedAt: new Date(Date.now() - 3600000),
      sentAt: new Date(Date.now() - 3500000),
      messageContent: 'Mensagem real enviada que não pode ser alterada',
    },
  });

  // Tentar editar manualmente deve lançar erro
  await assert.rejects(
    async () => {
      await AiCopyService.updateLeadMessage({
        userId: user.id,
        workspaceId: workspace.id,
        campaignId: campaign.id,
        leadId: leadEnviado.id,
        messageContent: 'Texto modificado indevidamente',
      });
    },
    (err: any) => {
      assert.ok(err.message.includes('já foi enviado'));
      return true;
    }
  );

  // Tentar regenerar com IA deve lançar erro
  await assert.rejects(
    async () => {
      await AiCopyService.regenerateSingleLead({
        userId: user.id,
        workspaceId: workspace.id,
        campaignId: campaign.id,
        leadId: leadEnviado.id,
        offerDescription: 'Nova oferta',
      });
    },
    (err: any) => {
      assert.ok(err.message.includes('já foi enviado'));
      return true;
    }
  );

  // Confirma integridade no banco
  const leadAtual = await prisma.lead.findUnique({ where: { id: leadEnviado.id } });
  assert.strictEqual(leadAtual?.messageContent, 'Mensagem real enviada que não pode ser alterada');
});

// 8. Lead que começa a ser enviado durante a geração mantém seu histórico intacto
test('Cenário 8: Lead que começa a ser enviado durante a geração mantém seu histórico intacto', async () => {
  const { user, workspace, campaign, unique } = await createTestFixtures('c8');

  const lead = await prisma.lead.create({
    data: {
      campaignId: campaign.id,
      title: 'Lead Corrida Disparador',
      phone: `551199${unique.slice(-7)}1`,
      status: 'PENDING',
      messageContent: 'Texto Inicial',
    },
  });

  setTestAiProvider(async () => {
    // Simula disparador iniciando o envio concorrentemente
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'SENDING', sendStartedAt: new Date() },
    });
    return 'Texto da IA que chegou tarde demais';
  });

  try {
    const res = await AiCopyService.initiateBatchGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      offerDescription: 'Oferta rápida',
      processSyncForTest: true,
    });

    // Como o lead começou a ser enviado, não pôde ser atualizado
    assert.strictEqual(res.completedLeads, 0);

    const leadFinal = await prisma.lead.findUnique({ where: { id: lead.id } });
    assert.strictEqual(leadFinal?.messageContent, 'Texto Inicial');
    assert.strictEqual(leadFinal?.status, 'SENDING');

    // Crédito foi estornado integralmente (20 créditos continuam intactos)
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 20);
    assert.strictEqual(summary.reservedBalance, 0);
  } finally {
    setTestAiProvider(null);
  }
});

// 9. Ausência da chave Gemini não produz sucesso fictício nem débito
test('Cenário 9: Ausência da chave Gemini não produz sucesso fictício nem débito', async () => {
  setTestAiProvider(null);
  const originalKey = ENV.GEMINI_API_KEY;
  const originalEnvKey = process.env.GEMINI_API_KEY;

  (ENV as any).GEMINI_API_KEY = '';
  process.env.GEMINI_API_KEY = '';

  const { user, workspace, campaign, unique } = await createTestFixtures('c9');
  await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead 1', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });

  try {
    await assert.rejects(
      async () => {
        await AiCopyService.initiateBatchGeneration({
          userId: user.id,
          workspaceId: workspace.id,
          campaignId: campaign.id,
          offerDescription: 'Oferta sem chave',
          processSyncForTest: true,
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('indisponível no momento'));
        return true;
      }
    );

    // Saldo permanece 20 intacto
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 20);
    assert.strictEqual(summary.reservedBalance, 0);
  } finally {
    (ENV as any).GEMINI_API_KEY = originalKey;
    process.env.GEMINI_API_KEY = originalEnvKey;
  }
});

// 10. Administrador continua ilimitado e Davi preserva o fluxo legado
test('Cenário 10: Administrador continua ilimitado e Davi preserva o fluxo legado', async () => {
  const unique = Date.now();
  const adminUser = await prisma.user.create({
    data: {
      email: `admin_${unique}@local.dev`,
      password: 'hash',
      name: 'Admin Ilimitado',
      role: 'ADMIN',
      planId: 'ENTERPRISE',
      subscriptionStatus: 'ACTIVE',
    },
  });

  const adminSummary = await CreditWalletService.getWalletSummary(adminUser.id);
  assert.strictEqual(adminSummary.isUnlimited, true);

  // Davi preserva o plano legado
  const daviUser = await prisma.user.create({
    data: {
      email: `davi_${unique}@local.dev`,
      password: 'hash',
      name: 'Davi Legado',
      role: 'USER',
      planId: 'LEGACY_DAVI',
      subscriptionStatus: 'ACTIVE',
    },
  });

  const daviSummary = await CreditWalletService.getWalletSummary(daviUser.id);
  assert.strictEqual(daviSummary.isLegacy, true);
});

// 11. Buscas Apify continuam usando a chave pessoal, sem consumir créditos de IA
test('Cenário 11: Buscas Apify continuam usando a chave pessoal, sem consumir créditos de IA', async () => {
  const { user, workspace } = await createTestFixtures('c11');

  // Cadastra credencial pessoal da Apify para o usuário no banco de teste
  await prisma.apifyCredential.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ciphertext: 'ciphertext_teste_apify',
      accountName: 'apify_test_account',
    },
    update: {},
  });

  const originalToken = ApifyCredentialService.token;
  ApifyCredentialService.token = async () => 'apify_mock_token_123';

  setTestPlacesProvider(async () => [
    { title: 'Clínica A', phone: '5511998887777', website: 'https://a.com', neighborhood: 'Centro' },
  ]);

  try {
    const search = await CompanySearchService.initiateSearch({
      userId: user.id,
      workspaceId: workspace.id,
      segment: 'Clínica',
      location: 'São Paulo',
      requestedCount: 10,
    });

    assert.strictEqual(search.billingMode, 'PERSONAL_APIFY');
    assert.strictEqual(search.creditsReserved, 0);
    assert.strictEqual(search.creditsConsumed, 0);

    // Carteira de IA permanece com os 20 créditos intactos!
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 20);
    assert.strictEqual(summary.reservedBalance, 0);
  } finally {
    ApifyCredentialService.token = originalToken;
    setTestPlacesProvider(null);
  }
});

// 12. Dados inválidos ou excessivamente grandes são rejeitados antes da chamada externa
test('Cenário 12: Dados inválidos ou excessivamente grandes são rejeitados antes da chamada externa', async () => {
  let aiCallCount = 0;
  setTestAiProvider(async () => {
    aiCallCount++;
    return 'OK';
  });

  const { user, workspace, campaign, unique } = await createTestFixtures('c12');
  const lead = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead 1', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });

  try {
    // Oferta excessivamente longa (> 1000 caracteres)
    const longOffer = 'a'.repeat(1005);
    await assert.rejects(
      async () => {
        await AiCopyService.initiateBatchGeneration({
          userId: user.id,
          workspaceId: workspace.id,
          campaignId: campaign.id,
          offerDescription: longOffer,
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('entre 5 e 1000'));
        return true;
      }
    );

    // Mensagem manual excessivamente longa (> 2000 caracteres)
    const longMessage = 'b'.repeat(2005);
    await assert.rejects(
      async () => {
        await AiCopyService.updateLeadMessage({
          userId: user.id,
          workspaceId: workspace.id,
          campaignId: campaign.id,
          leadId: lead.id,
          messageContent: longMessage,
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('2000 caracteres'));
        return true;
      }
    );

    // Nenhuma chamada à IA foi realizada
    assert.strictEqual(aiCallCount, 0);
  } finally {
    setTestAiProvider(null);
  }
});
