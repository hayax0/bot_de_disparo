import test from 'node:test';
import assert from 'node:assert';
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
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
  setTestAiProvider(async () => 'Mensagem Mock Isolada');
  try {
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
  } finally {
    setTestAiProvider(null);
  }
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

// 13. Falha de liquidação do lote: não deixa mensagem entregue sem cobrança nem reserva abandonada
test('Cenário 13: Falha de liquidação do lote não deixa mensagem entregue sem cobrança nem reserva abandonada', async () => {
  setTestAiProvider(async () => 'Mensagem Nova de Lote');
  const { user, workspace, campaign, unique } = await createTestFixtures('c13');

  const lead1 = await prisma.lead.create({
    data: {
      campaignId: campaign.id,
      title: 'Lead Lote 1',
      phone: `551199${unique.slice(-7)}1`,
      status: 'PENDING',
      messageContent: 'Mensagem Original Preservada 1',
    },
  });
  const lead2 = await prisma.lead.create({
    data: {
      campaignId: campaign.id,
      title: 'Lead Lote 2',
      phone: `551199${unique.slice(-7)}2`,
      status: 'PENDING',
      messageContent: 'Mensagem Original Preservada 2',
    },
  });

  const originalSettle = CreditWalletService.settleReservation;
  CreditWalletService.settleReservation = async () => {
    throw new Error('Falha forçada na liquidação da reserva de lote');
  };

  try {
    await assert.rejects(
      async () => {
        await AiCopyService.initiateBatchGeneration({
          userId: user.id,
          workspaceId: workspace.id,
          campaignId: campaign.id,
          offerDescription: 'Oferta de automação comercial',
          processSyncForTest: true,
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('Falha forçada na liquidação'));
        return true;
      }
    );

    // Leads reais mantêm suas mensagens originais intactas pelo rollback atômico
    const l1 = await prisma.lead.findUnique({ where: { id: lead1.id } });
    const l2 = await prisma.lead.findUnique({ where: { id: lead2.id } });
    assert.strictEqual(l1?.messageContent, 'Mensagem Original Preservada 1');
    assert.strictEqual(l2?.messageContent, 'Mensagem Original Preservada 2');

    // Operação no banco NÃO marca COMPLETED nem consumo fictício
    const op = await prisma.aiOperation.findFirst({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.strictEqual(op?.status, 'FAILED');
    assert.strictEqual(op?.creditsConsumed, 0);

    // Reserva não fica presa/abandonada: carteira mantém saldo e reservedBalance zerado
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 20);
    assert.strictEqual(summary.reservedBalance, 0);
  } finally {
    CreditWalletService.settleReservation = originalSettle;
    setTestAiProvider(null);
  }
});

// 14. Duas regenerações individuais simultâneas com a mesma chave: uma chamada ao provedor e um débito
test('Cenário 14: Duas regenerações individuais simultâneas com a mesma chave executam uma chamada e um débito', async () => {
  let aiCallCount = 0;
  setTestAiProvider(async (input) => {
    aiCallCount++;
    await new Promise((r) => setTimeout(r, 60)); // Simula latência
    return `Olá ${input.leadTitle}, copy individual única!`;
  });

  const { user, workspace, campaign, unique } = await createTestFixtures('c14');
  const lead = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead Individual', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });

  const idempotencyKey = `idemp_single_${unique}`;

  try {
    const [res1, res2] = await Promise.all([
      AiCopyService.regenerateSingleLead({
        userId: user.id,
        workspaceId: workspace.id,
        campaignId: campaign.id,
        leadId: lead.id,
        offerDescription: 'Consultoria de vendas B2B',
        idempotencyKey,
      }),
      AiCopyService.regenerateSingleLead({
        userId: user.id,
        workspaceId: workspace.id,
        campaignId: campaign.id,
        leadId: lead.id,
        offerDescription: 'Consultoria de vendas B2B',
        idempotencyKey,
      }),
    ]);

    // Ambas retornam o mesmo conteúdo gerado
    assert.strictEqual(res1.messageContent, res2.messageContent);
    assert.ok(res1.messageContent.includes('copy individual única'));

    // Exatamente uma chamada ao Gemini
    assert.strictEqual(aiCallCount, 1);

    // Exatamente 1 débito na carteira (de 20 para 19)
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 19);
    assert.strictEqual(summary.reservedBalance, 0);
  } finally {
    setTestAiProvider(null);
  }
});

// 15. Mesma chave com payload divergente em concorrência: rejeição correta (409)
test('Cenário 15: Mesma chave com payload divergente em concorrência é rejeitada com 409', async () => {
  setTestAiProvider(async () => 'Copy Gerada');
  const { user, workspace, campaign, unique } = await createTestFixtures('c15');
  const lead = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead C15', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });

  const idempotencyKey = `idemp_diverge_${unique}`;

  try {
    const results = await Promise.allSettled([
      AiCopyService.regenerateSingleLead({
        userId: user.id,
        workspaceId: workspace.id,
        campaignId: campaign.id,
        leadId: lead.id,
        offerDescription: 'Proposta Original Versão A',
        idempotencyKey,
      }),
      AiCopyService.regenerateSingleLead({
        userId: user.id,
        workspaceId: workspace.id,
        campaignId: campaign.id,
        leadId: lead.id,
        offerDescription: 'Proposta Totalmente Diferente Versão B',
        idempotencyKey,
      }),
    ]);

    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    assert.ok(rejected, 'Deveria ter havido pelo menos uma rejeição por conflito de payload');
    assert.strictEqual((rejected.reason as any).statusCode, 409);
    assert.ok((rejected.reason as any).message.includes('outros parâmetros'));
  } finally {
    setTestAiProvider(null);
  }
});

// 16. Interrupção após concluir parte do lote: retomada somente dos leads restantes
test('Cenário 16: Interrupção após concluir parte do lote retoma somente os leads restantes sem regerar os anteriores', async () => {
  const callsPerLead: Record<string, number> = {};

  setTestAiProvider(async (input) => {
    callsPerLead[input.leadTitle] = (callsPerLead[input.leadTitle] || 0) + 1;
    return `Nova mensagem para ${input.leadTitle}`;
  });

  const { user, workspace, campaign, unique } = await createTestFixtures('c16');
  const leadA = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead Alpha', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });
  const leadB = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead Beta', phone: `551199${unique.slice(-7)}2`, status: 'PENDING' },
  });

  // Cria a operação com os dois leads
  const op = await prisma.aiOperation.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      campaignId: campaign.id,
      type: 'BATCH',
      idempotencyKey: `idemp_interrupted_${unique}`,
      status: 'PROCESSING',
      totalLeads: 2,
    },
  });

  // Simula que Lead Alpha já foi gerado com sucesso antes da interrupção (salvo em AiOperationLead)
  await prisma.aiOperationLead.create({
    data: {
      operationId: op.id,
      leadId: leadA.id,
      status: 'GENERATED',
      generatedContent: 'Mensagem Alpha persistida antes do crash',
      isSettled: false,
    },
  });

  // Lead Beta estava pendente
  await prisma.aiOperationLead.create({
    data: {
      operationId: op.id,
      leadId: leadB.id,
      status: 'PENDING',
      isSettled: false,
    },
  });

  try {
    // Executa a recuperação / retry da operação interrompida
    await AiCopyService.processOperationJob(op.id);

    // O provedor de IA só deve ter sido chamado para o Lead Beta, NÃO para o Lead Alpha!
    assert.strictEqual(callsPerLead['Lead Alpha'] || 0, 0);
    assert.strictEqual(callsPerLead['Lead Beta'], 1);

    // O Lead Alpha manteve a mensagem que já havia sido gerada
    const refreshedA = await prisma.lead.findUnique({ where: { id: leadA.id } });
    const refreshedB = await prisma.lead.findUnique({ where: { id: leadB.id } });

    assert.strictEqual(refreshedA?.messageContent, 'Mensagem Alpha persistida antes do crash');
    assert.strictEqual(refreshedB?.messageContent, 'Nova mensagem para Lead Beta');

    const finishedOp = await prisma.aiOperation.findUnique({ where: { id: op.id } });
    assert.strictEqual(finishedOp?.status, 'COMPLETED');
    assert.strictEqual(finishedOp?.completedLeads, 2);
  } finally {
    setTestAiProvider(null);
  }
});

// 17. Falha ao enfileirar: repetição/recuperação faz a operação avançar sem prender ou duplicar créditos
test('Cenário 17: Falha ao enfileirar permite que repetição/recuperação avance a operação sem prender créditos', async () => {
  setTestAiProvider(async (input) => `Copy para ${input.leadTitle}`);
  const { user, workspace, campaign, unique } = await createTestFixtures('c17');
  await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead C17', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });

  const idempotencyKey = `idemp_queue_fail_${unique}`;

  try {
    // Primeira tentativa cria a operação e os itens
    const res1 = await AiCopyService.initiateBatchGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      offerDescription: 'Proposta inicial',
      idempotencyKey,
      processSyncForTest: false, // Fica PENDING simulando que o worker ainda não pegou
    });

    assert.strictEqual(res1.status, 'PENDING');

    // Repetir a mesma requisição com processSyncForTest processa a operação pendente
    const res2 = await AiCopyService.initiateBatchGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      offerDescription: 'Proposta inicial',
      idempotencyKey,
      processSyncForTest: true,
    });

    assert.strictEqual(res2.operationId, res1.operationId);
    assert.strictEqual(res2.status, 'COMPLETED');
    assert.strictEqual(res2.completedLeads, 1);

    // Saldo debitou apenas 1 crédito (20 para 19) e reserva zerada
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 19);
    assert.strictEqual(summary.reservedBalance, 0);
  } finally {
    setTestAiProvider(null);
  }
});

// 18. Falha após o job ser aceito, mas antes da confirmação ao chamador: recuperação sem duplicar execução
test('Cenário 18: Falha de confirmação ao chamador após aceite do job não duplica execução nem débito', async () => {
  let executionCount = 0;
  setTestAiProvider(async () => {
    executionCount++;
    return 'Mensagem Final';
  });

  const { user, workspace, campaign, unique } = await createTestFixtures('c18');
  await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead C18', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });

  const idempotencyKey = `idemp_ack_fail_${unique}`;

  try {
    // Primeira execução conclui com sucesso no backend
    const res1 = await AiCopyService.initiateBatchGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      offerDescription: 'Oferta estável',
      idempotencyKey,
      processSyncForTest: true,
    });
    assert.strictEqual(res1.status, 'COMPLETED');
    assert.strictEqual(executionCount, 1);

    // Replay pelo chamador que perdeu a resposta HTTP original
    const res2 = await AiCopyService.initiateBatchGeneration({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      offerDescription: 'Oferta estável',
      idempotencyKey,
      processSyncForTest: true,
    });

    assert.strictEqual(res2.operationId, res1.operationId);
    assert.strictEqual(res2.status, 'COMPLETED');
    // Não executou o provedor de IA novamente
    assert.strictEqual(executionCount, 1);

    // Carteira debitou apenas 1 crédito no total
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 19);
  } finally {
    setTestAiProvider(null);
  }
});

// 19. Repetição de geração individual com falha devolve erro sem prender créditos e permite nova chave
test('Cenário 19: Repetição de geração individual com falha devolve erro sem prender créditos e permite nova chave', async () => {
  let aiCallCount = 0;
  let shouldFailAi = true;

  setTestAiProvider(async (input) => {
    aiCallCount++;
    if (shouldFailAi) {
      throw new Error('Falha temporária no provedor Gemini');
    }
    return `Olá ${input.leadTitle}, copy gerada com sucesso!`;
  });

  const { user, workspace, campaign, unique } = await createTestFixtures('c19');
  const lead = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead C19', phone: `551199${unique.slice(-7)}1`, status: 'PENDING' },
  });

  const failKey = `idemp_fail_${unique}`;
  const successKey = `idemp_success_${unique}`;

  try {
    // 1. Primeira chamada falha propositalmente
    await assert.rejects(
      async () => {
        await AiCopyService.regenerateSingleLead({
          userId: user.id,
          workspaceId: workspace.id,
          campaignId: campaign.id,
          leadId: lead.id,
          offerDescription: 'Proposta inicial com falha',
          idempotencyKey: failKey,
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('Falha temporária no provedor Gemini'));
        return true;
      }
    );

    // Confirma que a operação ficou FAILED no banco e a reserva inicial foi liberada
    const op1 = await prisma.aiOperation.findUnique({ where: { idempotencyKey: failKey } });
    assert.strictEqual(op1?.status, 'FAILED');

    let summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 20, 'Saldo disponível deve ser 20 após a falha inicial');
    assert.strictEqual(summary.reservedBalance, 0, 'Saldo reservado deve ser 0 após a falha inicial');
    assert.strictEqual(aiCallCount, 1, 'Provedor deve ter sido chamado exatamente 1 vez');

    // 2. Repetição com a MESMA chave de idempotência que falhou
    await assert.rejects(
      async () => {
        await AiCopyService.regenerateSingleLead({
          userId: user.id,
          workspaceId: workspace.id,
          campaignId: campaign.id,
          leadId: lead.id,
          offerDescription: 'Proposta inicial com falha',
          idempotencyKey: failKey,
        });
      },
      (err: any) => {
        // Devolve o erro persistido sem nova chamada e sem nova reserva
        assert.ok(
          err.message.includes('Falha temporária no provedor Gemini') ||
          err.message.includes('Falha persistida') ||
          (err as any).code === 'OPERATION_FAILED'
        );
        return true;
      }
    );

    // Validação estrita:
    summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 20, 'Saldo disponível DEVE permanecer 20 após repetição da mesma chave');
    assert.strictEqual(summary.reservedBalance, 0, 'Saldo reservado DEVE permanecer zero após repetição da mesma chave');
    assert.strictEqual(aiCallCount, 1, 'Provedor NÃO deve ter sido chamado novamente (apenas 1 chamada mantida)');

    // Nenhuma reserva órfã: verificar se há alguma reserva com status PENDING na carteira
    const orphanReservations = await prisma.creditReservation.findMany({
      where: { userId: user.id, status: 'PENDING' },
    });
    assert.strictEqual(orphanReservations.length, 0, 'Nenhuma reserva órfã ou ativa pendente');

    // 3. Nova tentativa intencional com OUTRA chave continua funcionando
    shouldFailAi = false;
    const resSuccess = await AiCopyService.regenerateSingleLead({
      userId: user.id,
      workspaceId: workspace.id,
      campaignId: campaign.id,
      leadId: lead.id,
      offerDescription: 'Proposta com nova chave',
      idempotencyKey: successKey,
    });

    assert.ok(resSuccess.messageContent.includes('copy gerada com sucesso!'));
    assert.strictEqual(aiCallCount, 2, 'Provedor chamado pela segunda vez para a nova chave');

    summary = await CreditWalletService.getWalletSummary(user.id);
    assert.strictEqual(summary.monthlyBalance, 19, 'Saldo debitado corretamente em 1 crédito (20 -> 19)');
    assert.strictEqual(summary.reservedBalance, 0, 'Saldo reservado permanece zero');

    const leadFinal = await prisma.lead.findUnique({ where: { id: lead.id } });
    assert.ok(leadFinal?.messageContent?.includes('copy gerada com sucesso!'));
  } finally {
    setTestAiProvider(null);
  }
});

// 20. Recuperação e reativação real de jobs FAILED no BullMQ com Redis real
test('Cenário 20: Integração BullMQ/Redis real reativa jobs FAILED, preserva textos parciais e impede duplicidade concorrente', async (t) => {
  const redisHost = ENV.REDIS_HOST || '127.0.0.1';
  const redisPort = Number(ENV.REDIS_PORT) || 6379;
  const testRedisUrl = process.env.REDIS_URL || `redis://${redisHost}:${redisPort}`;

  let isRedisAvailable = false;
  try {
    const probe = new IORedis(testRedisUrl, { maxRetriesPerRequest: 1, connectTimeout: 1500 });
    await probe.ping();
    await probe.quit();
    isRedisAvailable = true;
  } catch {
    isRedisAvailable = false;
  }

  if (!isRedisAvailable) {
    t.skip('Redis real não disponível no ambiente de teste local atual.');
    return;
  }

  const unique = Date.now();
  const testQueueName = `test-ai-queue-${unique}`;

  const redisConnQueue = new IORedis(testRedisUrl, { maxRetriesPerRequest: null });
  const redisConnWorker = new IORedis(testRedisUrl, { maxRetriesPerRequest: null });
  const redisConnEvents = new IORedis(testRedisUrl, { maxRetriesPerRequest: null });

  const testQueue = new Queue(testQueueName, { connection: redisConnQueue });
  const testQueueEvents = new QueueEvents(testQueueName, { connection: redisConnEvents });

  let worker: Worker | null = null;

  t.after(async () => {
    if (worker) {
      await worker.close();
    }
    await testQueueEvents.close().catch(() => {});
    await testQueue.obliterate({ force: true }).catch(() => {});
    await testQueue.close().catch(() => {});
    await redisConnQueue.quit().catch(() => {});
    await redisConnWorker.quit().catch(() => {});
    await redisConnEvents.quit().catch(() => {});
    setTestAiProvider(null);
  });

  const { user, workspace, campaign } = await createTestFixtures(`c20_${unique}`);

  const lead1 = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead 1 Persistido', phone: `551199${String(unique).slice(-7)}1`, status: 'PENDING' },
  });
  const lead2 = await prisma.lead.create({
    data: { campaignId: campaign.id, title: 'Lead 2 Novo', phone: `551199${String(unique).slice(-7)}2`, status: 'PENDING' },
  });

  // Reserva 2 créditos para a operação
  const reservation = await CreditWalletService.reserveCredits({
    userId: user.id,
    amount: 2,
    sourceType: 'AI_ASSISTANT',
    sourceId: campaign.id,
    idempotencyKey: `idemp_batch_${unique}`,
    description: 'Reserva para lote BullMQ',
  });

  // Cria a operação como PENDING
  const op = await prisma.aiOperation.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      campaignId: campaign.id,
      type: 'BATCH',
      idempotencyKey: `idemp_batch_${unique}`,
      status: 'PENDING',
      reservationId: reservation.reservationId,
      totalLeads: 2,
      creditsReserved: 2,
      creditsConsumed: 0,
    },
  });

  // Lead 1 já foi gerado na tentativa anterior (texto persistido duravelmente no AiOperationLead)
  await prisma.aiOperationLead.create({
    data: {
      operationId: op.id,
      leadId: lead1.id,
      status: 'GENERATED',
      generatedContent: 'Texto já gerado e salvo para Lead 1',
      isSettled: false,
    },
  });

  // Lead 2 ainda está PENDING
  await prisma.aiOperationLead.create({
    data: {
      operationId: op.id,
      leadId: lead2.id,
      status: 'PENDING',
      isSettled: false,
    },
  });

  const jobId = `ai_op_${op.id}`;

  const produceFailedJob = async (operationId: string) => {
    const jobKey = `ai_op_${operationId}`;
    const conn = new IORedis(testRedisUrl, { maxRetriesPerRequest: null });
    const failWorker = new Worker(
      testQueueName,
      async (j) => {
        if (j.id === jobKey) {
          throw new Error('Simulação de falha anterior mantida no Redis');
        }
      },
      { connection: conn }
    );

    const j = await testQueue.add('process_ai_batch', { operationId }, { jobId: jobKey });

    for (let attempt = 0; attempt < 60; attempt++) {
      const state = await j.getState();
      if (state === 'failed') break;
      await new Promise((r) => setTimeout(r, 50));
    }

    await failWorker.close();
    await conn.quit();
    return j;
  };

  // 2. Produz um job FAILED mantido no Redis real do BullMQ
  const initialJob = await produceFailedJob(op.id);

  const stateBeforeRecovery = await initialJob.getState();
  assert.strictEqual(stateBeforeRecovery, 'failed', 'O job deve estar comprovadamente em estado failed no Redis');

  // Demonstração que queue.add com mesmo jobId NÃO reexecuta job FAILED no BullMQ:
  const reAddedJob = await testQueue.add('process_ai_batch', { operationId: op.id }, { jobId });
  const stateAfterAdd = await reAddedJob.getState();
  assert.strictEqual(stateAfterAdd, 'failed', 'queue.add puro com mesmo jobId continua failed e não reexecuta no BullMQ');

  // 3. Executa a recuperação implementada (reconcileAiBatchJob)
  const reconcileResult = await AiCopyService.reconcileAiBatchJob(op.id, testQueue);
  assert.strictEqual(reconcileResult.action, 'RETRIED');
  assert.strictEqual(reconcileResult.state, 'failed');

  const refreshedJob = await testQueue.getJob(jobId);
  const stateAfterRetry = await refreshedJob?.getState();
  assert.strictEqual(stateAfterRetry, 'waiting', 'Após a recuperação o job transiciona para waiting no BullMQ');

  // 4. Confirma que o worker volta a executar e a operação avança
  let aiCallsForLead1 = 0;
  let aiCallsForLead2 = 0;

  setTestAiProvider(async (input) => {
    if (input.leadTitle === 'Lead 1 Persistido') {
      aiCallsForLead1++;
      return 'Texto indevido';
    }
    if (input.leadTitle === 'Lead 2 Novo') {
      aiCallsForLead2++;
      return 'Texto novo gerado para Lead 2';
    }
    return 'OK';
  });

  // Inicia o worker na fila real de teste
  worker = new Worker(
    testQueueName,
    async (job) => {
      await AiCopyService.processOperationJob(job.data.operationId);
    },
    { connection: redisConnWorker }
  );

  // Aguarda a conclusão do processamento pelo worker
  for (let attempt = 0; attempt < 60; attempt++) {
    const opCheck = await prisma.aiOperation.findUnique({ where: { id: op.id } });
    if (opCheck?.status === 'COMPLETED' || opCheck?.status === 'FAILED') break;
    await new Promise((r) => setTimeout(r, 60));
  }

  // 5. Confirmações de avanço, ausência de duplicidade e atomicidade da cobrança:
  const finishedOp = await prisma.aiOperation.findUnique({ where: { id: op.id } });
  assert.strictEqual(finishedOp?.status, 'COMPLETED', 'Operação avançou para COMPLETED no banco');
  assert.strictEqual(finishedOp?.completedLeads, 2);
  assert.strictEqual(finishedOp?.creditsConsumed, 2);

  // Confirma ausência de nova geração para itens já persistidos:
  assert.strictEqual(aiCallsForLead1, 0, 'Lead 1 já persistido NÃO deve chamar o provedor de IA');
  assert.strictEqual(aiCallsForLead2, 1, 'Lead 2 pendente deve ser gerado exatamente 1 vez');

  // Mensagens aplicadas nos leads:
  const l1 = await prisma.lead.findUnique({ where: { id: lead1.id } });
  const l2 = await prisma.lead.findUnique({ where: { id: lead2.id } });
  assert.strictEqual(l1?.messageContent, 'Texto já gerado e salvo para Lead 1');
  assert.strictEqual(l2?.messageContent, 'Texto novo gerado para Lead 2');

  // Confirma ausência de cobrança duplicada: exatamente 2 créditos debitados (20 -> 18)
  const summary = await CreditWalletService.getWalletSummary(user.id);
  assert.strictEqual(summary.monthlyBalance, 18, 'Saldo debitado exatamente em 2 créditos (de 20 para 18)');
  assert.strictEqual(summary.reservedBalance, 0, 'Saldo reservado zerado');

  // 6. Confirma que recuperações concorrentes não duplicam o processamento
  // Se chamada para operação já COMPLETED no banco:
  const concurrentCalls = await Promise.all([
    AiCopyService.reconcileAiBatchJob(op.id, testQueue),
    AiCopyService.reconcileAiBatchJob(op.id, testQueue),
    AiCopyService.reconcileAiBatchJob(op.id, testQueue),
  ]);
  for (const call of concurrentCalls) {
    assert.strictEqual(call.action, 'ALREADY_COMPLETED', 'Operação já concluída não é reprocessada em recuperações concorrentes');
  }

  // E para uma nova operação com concorrência antes da conclusão:
  if (worker) {
    await worker.close();
    worker = null;
  }

  const op2 = await prisma.aiOperation.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      campaignId: campaign.id,
      type: 'BATCH',
      idempotencyKey: `idemp_conc_${unique}`,
      status: 'PENDING',
      totalLeads: 1,
    },
  });
  await produceFailedJob(op2.id);

  const concReconcile = await Promise.all([
    AiCopyService.reconcileAiBatchJob(op2.id, testQueue),
    AiCopyService.reconcileAiBatchJob(op2.id, testQueue),
    AiCopyService.reconcileAiBatchJob(op2.id, testQueue),
  ]);

  const retriedCount = concReconcile.filter((c) => c.action === 'RETRIED').length;
  const preservedCount = concReconcile.filter((c) => c.action === 'PRESERVED').length;
  assert.strictEqual(retriedCount, 1, 'Exatamente uma chamada fez o RETRIED do job');
  assert.strictEqual(preservedCount, 2, 'As chamadas concorrentes encontraram o job já esperando e preservaram');
});


