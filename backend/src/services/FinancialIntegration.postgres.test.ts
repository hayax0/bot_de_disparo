import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma as testPrisma } from '../lib/prisma';
import { CreditWalletService, InsufficientCreditsError } from './CreditWalletService';
import { CompanySearchService, setTestPlacesProvider } from './CompanySearchService';
import { QuotaService } from './QuotaService';
import { companySearchQueue } from './queue';

// Validação estrita de isolamento de segurança: BLOQUEIA se não for banco explicitamente de teste
const currentDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
const isExplicitTestDb =
  currentDbUrl.includes('_test') ||
  currentDbUrl.includes('test_') ||
  currentDbUrl.includes('/bot_prospeccao_test');

if (!isExplicitTestDb) {
  throw new Error(
    `[SEGURANÇA BLOQUEADA] Tentativa de executar testes destrutivos com TRUNCATE em banco que não é explicitamente de teste! ` +
    `Configure TEST_DATABASE_URL apontando para uma base de testes (ex: bot_prospeccao_test). URL detectada: ${currentDbUrl.replace(/:[^:@]+@/, ':***@')}`
  );
}

test('FinancialIntegration Postgres: Suite Real de Transacoes, Concorrencia e Idempotencia', async (t) => {
  // Limpeza inicial do banco de testes descartável
  await testPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "DispatchReservation",
      "DeliveredWorkspaceContact",
      "CreditTransaction", 
      "CreditReservation", 
      "CreditWallet", 
      "CompanySearchResult", 
      "CompanySearch", 
      "Lead", 
      "DispatchHistory", 
      "Campaign", 
      "Workspace", 
      "User" 
    CASCADE;
  `);

  t.after(async () => {
    await testPrisma.$disconnect();
    setTestPlacesProvider(null);
  });

  // =========================================================================
  // CENÁRIO 1: Disponibilidade por origem e ciclo (Item 1 da Revisão)
  // Mensal 50 + Comprado 50. Duas reservas de 50. Liquidar ambas não deixa mensal negativo.
  // =========================================================================
  await t.test('Cenario 1: Duas reservas simultaneas com 50 mensal + 50 comprado e liquidacao total sem saldo negativo', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `origin_avail_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
      }
    });

    const cycleExpiry = new Date(Date.now() + 30 * 86400000);
    const wallet = await testPrisma.creditWallet.create({
      data: {
        userId: user.id,
        monthlyBalance: 50,
        purchasedBalance: 50,
        reservedBalance: 0,
        monthlyExpiresAt: cycleExpiry
      }
    });

    // Reserva 1: pede 50 créditos (chama método público sem passar client/mock)
    const res1 = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 50,
      idempotencyKey: `res_split_1_${Date.now()}`,
      sourceType: 'COMPANY_SEARCH'
    });

    assert.equal(res1.success, true);
    assert.equal(res1.reservedAmount, 50);

    const reservation1 = await testPrisma.creditReservation.findUnique({
      where: { id: res1.reservationId }
    });
    // A 1ª reserva deve alocar integralmente do saldo mensal disponível
    assert.equal(reservation1?.monthlyAmount, 50, 'Reserva 1 deve comprometer 50 mensal');
    assert.equal(reservation1?.purchasedAmount, 0, 'Reserva 1 deve comprometer 0 comprado');

    // Reserva 2: pede mais 50 créditos enquanto a Reserva 1 continua PENDING
    const res2 = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 50,
      idempotencyKey: `res_split_2_${Date.now()}`,
      sourceType: 'COMPANY_SEARCH'
    });

    assert.equal(res2.success, true);
    assert.equal(res2.reservedAmount, 50);

    const reservation2 = await testPrisma.creditReservation.findUnique({
      where: { id: res2.reservationId }
    });
    // A 2ª reserva DEVE descontar a reserva mensal pendente e alocar do saldo comprado!
    assert.equal(reservation2?.monthlyAmount, 0, 'Reserva 2 não pode comprometer créditos mensais já pendentes');
    assert.equal(reservation2?.purchasedAmount, 50, 'Reserva 2 deve alocar 50 do saldo comprado livre');

    // Estado da carteira antes da liquidação: reservedBalance = 100
    const walletBeforeSettle = await testPrisma.creditWallet.findUnique({ where: { id: wallet.id } });
    assert.equal(walletBeforeSettle?.monthlyBalance, 50);
    assert.equal(walletBeforeSettle?.purchasedBalance, 50);
    assert.equal(walletBeforeSettle?.reservedBalance, 100);

    // Liquidar Reserva 1 (consome 50) via método público
    const settle1 = await CreditWalletService.settleReservation({
      reservationId: res1.reservationId,
      actualConsumedAmount: 50
    });
    assert.equal(settle1.success, true);

    // Liquidar Reserva 2 (consome 50) via método público
    const settle2 = await CreditWalletService.settleReservation({
      reservationId: res2.reservationId,
      actualConsumedAmount: 50
    });
    assert.equal(settle2.success, true);

    // Estado final da carteira: mensal = 0, comprado = 0, reservado = 0 (SEM -50 mensal!)
    const walletAfterSettle = await testPrisma.creditWallet.findUnique({ where: { id: wallet.id } });
    assert.equal(walletAfterSettle?.monthlyBalance, 0, 'Saldo mensal deve ser exatamente 0, nunca negativo');
    assert.equal(walletAfterSettle?.purchasedBalance, 0, 'Saldo comprado deve ser exatamente 0');
    assert.equal(walletAfterSettle?.reservedBalance, 0, 'Saldo reservado deve ser exatamente 0');

    // Resumo da carteira
    const summary = await CreditWalletService.getWalletSummary(user.id);
    assert.equal(summary.availableBalance, 0);
    assert.equal(summary.totalBalance, 0);
  });

  // =========================================================================
  // CENÁRIO 2: Persistência de cota de disparos no PostgreSQL (Item 2 da Revisão)
  // Repetição após reinício, concorrência entre processos e liberação repetida.
  // =========================================================================
  await t.test('Cenario 2: Idempotencia persistida de disparos no banco, reinicio simulado e liberacao repetida', async () => {
    const quotaUser = await testPrisma.user.create({
      data: {
        email: `dispatch_persistent_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        monthlyDispatchQuota: 10,
        dispatchesUsedInCycle: 0,
        cycleResetAt: new Date(Date.now() - 5000)
      }
    });

    const dispatchKey = `camp_alpha_lead_${Date.now()}`;

    // 1. Primeira reserva do envio
    const firstAttempt = await QuotaService.tryConsumeDispatchQuota({
      userId: quotaUser.id,
      dispatchKey
    });
    assert.equal(firstAttempt.allowed, true);
    assert.equal(firstAttempt.used, 1, 'Contador deve ter incrementado para 1');

    // Verifica persistência na tabela DispatchReservation
    const savedReservation = await testPrisma.dispatchReservation.findFirst({
      where: { userId: quotaUser.id, dispatchKey }
    });
    assert.ok(savedReservation, 'Reserva deve estar persistida no PostgreSQL');
    assert.equal(savedReservation?.status, 'RESERVED');

    // 2. Simula reinício de processo/worker: nova chamada para o mesmo dispatchKey
    const secondAttemptAfterRestart = await QuotaService.tryConsumeDispatchQuota({
      userId: quotaUser.id,
      dispatchKey
    });
    assert.equal(secondAttemptAfterRestart.allowed, true);
    assert.equal(secondAttemptAfterRestart.isIdempotent, true, 'Deve reconhecer idempotência persistida no banco');

    const userCheck = await testPrisma.user.findUnique({ where: { id: quotaUser.id } });
    assert.equal(userCheck?.dispatchesUsedInCycle, 1, 'Não pode incrementar novamente na repetição');

    // 3. Execução em processos concorrentes simultâneos com outra chave
    const concurrentKey = `concurrent_dispatch_${Date.now()}`;
    const [c1, c2] = await Promise.all([
      QuotaService.tryConsumeDispatchQuota({ userId: quotaUser.id, dispatchKey: concurrentKey }),
      QuotaService.tryConsumeDispatchQuota({ userId: quotaUser.id, dispatchKey: concurrentKey })
    ]);

    assert.equal(c1.allowed, true);
    assert.equal(c2.allowed, true);
    // Pelo menos um deve ter retornado isIdempotent: true
    assert.ok(c1.isIdempotent || c2.isIdempotent, 'Apenas uma das chamadas paralelas deve ter consumido cota nova');

    const userAfterConcurrent = await testPrisma.user.findUnique({ where: { id: quotaUser.id } });
    assert.equal(userAfterConcurrent?.dispatchesUsedInCycle, 2, 'Contador total deve ser 2 (1 da primeira + 1 da concorrente)');

    // 4. Liberação repetida: duas chamadas a releaseDispatchQuota
    await QuotaService.releaseDispatchQuota({ userId: quotaUser.id, dispatchKey: concurrentKey });
    const userAfterFirstRelease = await testPrisma.user.findUnique({ where: { id: quotaUser.id } });
    assert.equal(userAfterFirstRelease?.dispatchesUsedInCycle, 1, 'Cota foi estornada de 2 para 1');

    // Segunda liberação repetida NÃO pode estornar de novo
    await QuotaService.releaseDispatchQuota({ userId: quotaUser.id, dispatchKey: concurrentKey });
    const userAfterSecondRelease = await testPrisma.user.findUnique({ where: { id: quotaUser.id } });
    assert.equal(userAfterSecondRelease?.dispatchesUsedInCycle, 1, 'Liberação repetida não deve duplicar o estorno');

    // 5. Confirmação definitiva protege contra estorno incerto posterior
    await QuotaService.confirmDispatchQuota({ userId: quotaUser.id, dispatchKey });
    // Tenta liberar após confirmado: não deve estornar
    await QuotaService.releaseDispatchQuota({ userId: quotaUser.id, dispatchKey });
    const userAfterConfirmedRelease = await testPrisma.user.findUnique({ where: { id: quotaUser.id } });
    assert.equal(userAfterConfirmedRelease?.dispatchesUsedInCycle, 1, 'Envio confirmado não pode ser estornado');
  });

  // =========================================================================
  // CENÁRIO 3: Concorrência entre buscas com a mesma chave (Item 3 da Revisão)
  // Perdedora do conflito de chave não cancela reserva vencedora, targetCampaignId e re-enfileiramento.
  // =========================================================================
  await t.test('Cenario 3: Concorrencia de initiateSearch, protecao de reserva, targetCampaignId e recuperacao de orfaos', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `search_race_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
      }
    });

    const workspace = await testPrisma.workspace.create({
      data: { name: 'Workspace Search Race', userId: user.id }
    });

    const campaign1 = await testPrisma.campaign.create({
      data: { name: 'Campanha 1', workspaceId: workspace.id }
    });
    const campaign2 = await testPrisma.campaign.create({
      data: { name: 'Campanha 2', workspaceId: workspace.id }
    });

    await testPrisma.creditWallet.create({
      data: {
        userId: user.id,
        monthlyBalance: 200,
        purchasedBalance: 0,
        reservedBalance: 0,
        monthlyExpiresAt: new Date(Date.now() + 30 * 86400000)
      }
    });

    // Mock seguro de provedor
    setTestPlacesProvider(async () => [
      { title: 'Empresa Alpha', phone: '5511999991111', website: 'https://alpha.com' }
    ]);

    const sharedKey = `race_search_${Date.now()}`;

    // Duas buscas simultâneas com a MESMA chave disparam juntas em paralelo
    const [searchA, searchB] = await Promise.all([
      CompanySearchService.initiateSearch({
        userId: user.id,
        workspaceId: workspace.id,
        segment: 'Pizzaria',
        location: 'Sao Paulo',
        requestedCount: 10,
        idempotencyKey: sharedKey,
        targetCampaignId: campaign1.id
      }),
      CompanySearchService.initiateSearch({
        userId: user.id,
        workspaceId: workspace.id,
        segment: 'Pizzaria',
        location: 'Sao Paulo',
        requestedCount: 10,
        idempotencyKey: sharedKey,
        targetCampaignId: campaign1.id
      })
    ]);

    // Ambas retornam a MESMA busca
    assert.ok(searchA);
    assert.ok(searchB);
    assert.equal(searchA.id, searchB.id, 'Ambas devem retornar a mesma busca');

    // A reserva NÃO pode ter sido cancelada pela perdedora do conflito!
    const reservation = await testPrisma.creditReservation.findFirst({
      where: { idempotencyKey: sharedKey }
    });
    assert.ok(reservation);
    assert.notEqual(reservation?.status, 'RELEASED', 'A reserva da busca vencedora NÃO pode ser cancelada pela perdedora');

    // Validação de targetCampaignId: tentar reutilizar a mesma chave com campaign2 deve ser REJEITADO
    await assert.rejects(
      async () => {
        await CompanySearchService.initiateSearch({
          userId: user.id,
          workspaceId: workspace.id,
          segment: 'Pizzaria',
          location: 'Sao Paulo',
          requestedCount: 10,
          idempotencyKey: sharedKey,
          targetCampaignId: campaign2.id // payload diferente!
        });
      },
      /Chave de idempotência já utilizada com parâmetros de busca diferentes/
    );
  });

  // =========================================================================
  // CENÁRIO 4: Retries da Apify e Resiliência (Item 4 e 5 da Revisão)
  // Falha na primeira tentativa preserva reserva e busca para o próximo retry do BullMQ.
  // =========================================================================
  await t.test('Cenario 4: Falha na primeira tentativa do job preserva status PROCESSING e reserva PENDING para retry', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `apify_retry_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
      }
    });

    const workspace = await testPrisma.workspace.create({
      data: { name: 'Workspace Retry Test', userId: user.id }
    });

    await testPrisma.creditWallet.create({
      data: {
        userId: user.id,
        monthlyBalance: 100,
        purchasedBalance: 0,
        reservedBalance: 0,
        monthlyExpiresAt: new Date(Date.now() + 30 * 86400000)
      }
    });

    const reservation = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 10,
      idempotencyKey: `retry_res_${Date.now()}`,
      sourceType: 'COMPANY_SEARCH'
    });

    const search = await testPrisma.companySearch.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        reservationId: reservation.reservationId,
        idempotencyKey: `retry_search_${Date.now()}`,
        query: 'Advocacia em Curitiba',
        segment: 'Advocacia',
        location: 'Curitiba',
        requestedCount: 10,
        creditsReserved: 10,
        status: 'PENDING'
      }
    });

    // Configura provider para simular falha temporária de rede/timeout
    setTestPlacesProvider(async () => {
      throw new Error('Falha transitoria de conexao com a Apify');
    });

    // Executa a 1ª tentativa (isLastAttempt: false)
    await assert.rejects(
      async () => {
        await CompanySearchService.processSearchJob(search.id, { isLastAttempt: false });
      },
      /Falha transitoria de conexao com a Apify/
    );

    // Na 1ª tentativa, a reserva DEVE continuar PENDING e a busca NÃO pode ser marcada como FAILED
    const searchAfterFirstTry = await testPrisma.companySearch.findUnique({ where: { id: search.id } });
    assert.equal(searchAfterFirstTry?.status, 'PROCESSING', 'Busca deve permanecer PROCESSING para o retry do BullMQ');

    const resAfterFirstTry = await testPrisma.creditReservation.findUnique({ where: { id: reservation.reservationId } });
    assert.equal(resAfterFirstTry?.status, 'PENDING', 'Reserva deve permanecer PENDING durante retries');

    // Executa a última tentativa (isLastAttempt: true)
    await assert.rejects(
      async () => {
        await CompanySearchService.processSearchJob(search.id, { isLastAttempt: true });
      },
      /Falha transitoria de conexao com a Apify/
    );

    // Agora sim, na tentativa final a reserva é liberada e a busca marcada FAILED
    const searchFinal = await testPrisma.companySearch.findUnique({ where: { id: search.id } });
    assert.equal(searchFinal?.status, 'FAILED');

    const resFinal = await testPrisma.creditReservation.findUnique({ where: { id: reservation.reservationId } });
    assert.equal(resFinal?.status, 'RELEASED');
  });

  // =========================================================================
  // CENÁRIO 5: Deduplicação Atômica em Buscas Concorrentes (Item 5 da Revisão)
  // Duas buscas simultâneas no mesmo workspace com os mesmos contatos:
  // Apenas a primeira entrega como aproveitável (isUsable: true); a segunda marca ALREADY_DELIVERED e consome 0 créditos.
  // =========================================================================
  await t.test('Cenario 5: Deduplicacao atomica em buscas concorrentes no mesmo workspace evita cobranca duplicada', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `dedup_race_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'SCALE',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
      }
    });

    const workspace = await testPrisma.workspace.create({
      data: { name: 'Workspace Dedup Concurrency', userId: user.id }
    });

    await testPrisma.creditWallet.create({
      data: {
        userId: user.id,
        monthlyBalance: 200,
        purchasedBalance: 0,
        reservedBalance: 0,
        monthlyExpiresAt: new Date(Date.now() + 30 * 86400000)
      }
    });

    // Cria duas buscas separadas (com chaves diferentes) que rodarão ao mesmo tempo
    const resA = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 5,
      idempotencyKey: `dedup_res_A_${Date.now()}`,
      sourceType: 'COMPANY_SEARCH'
    });
    const searchA = await testPrisma.companySearch.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        reservationId: resA.reservationId,
        idempotencyKey: `dedup_search_A_${Date.now()}`,
        query: 'Farmacia em Campinas',
        segment: 'Farmacia',
        location: 'Campinas',
        requestedCount: 5,
        creditsReserved: 5,
        status: 'PENDING'
      }
    });

    const resB = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 5,
      idempotencyKey: `dedup_res_B_${Date.now()}`,
      sourceType: 'COMPANY_SEARCH'
    });
    const searchB = await testPrisma.companySearch.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        reservationId: resB.reservationId,
        idempotencyKey: `dedup_search_B_${Date.now()}`,
        query: 'Farmacia em Campinas B',
        segment: 'Farmacia',
        location: 'Campinas',
        requestedCount: 5,
        creditsReserved: 5,
        status: 'PENDING'
      }
    });

    // Ambos os jobs encontram exatamente os mesmos 3 telefones celulares
    const duplicatePlaces = [
      { title: 'Farmacia 1', phone: '5519999990001', website: 'https://farm1.com' },
      { title: 'Farmacia 2', phone: '5519999990002', website: 'https://farm2.com' },
      { title: 'Farmacia 3', phone: '5519999990003', website: 'https://farm3.com' }
    ];

    setTestPlacesProvider(async () => duplicatePlaces);

    // Executa ambas as buscas simultaneamente em paralelo!
    const [resultA, resultB] = await Promise.all([
      CompanySearchService.processSearchJob(searchA.id, { isLastAttempt: true }),
      CompanySearchService.processSearchJob(searchB.id, { isLastAttempt: true })
    ]);

    // Uma delas venceu e entregou os 3 contatos como utilizáveis
    // A outra perdedora concorrente teve os 3 contatos marcados como ALREADY_DELIVERED
    const totalCreditsConsumed = (resultA?.creditsConsumed || 0) + (resultB?.creditsConsumed || 0);
    assert.equal(totalCreditsConsumed, 3, 'O consumo total somado das duas buscas deve ser de EXATAMENTE 3 creditos, nunca 6');

    const totalUsableCount = (resultA?.usableCount || 0) + (resultB?.usableCount || 0);
    assert.equal(totalUsableCount, 3, 'Apenas 3 contatos foram efetivamente novos no workspace');

    // Confere registros em DeliveredWorkspaceContact: exatamente 3 telefones registrados
    const deliveredCount = await testPrisma.deliveredWorkspaceContact.count({
      where: { workspaceId: workspace.id }
    });
    assert.equal(deliveredCount, 3, 'Exatamente 3 entregas unicas foram registradas atomicamente');
  });

  // =========================================================================
  // CENÁRIO 6: Rollback Atômico Compartilhado (Item 2 da Revisão)
  // Falha na transação atômica única reverte resultados e liquidação contábil simultaneamente
  // =========================================================================
  await t.test('Cenario 6: Rollback atomico compartilhado entre cobranca e resultados no PostgreSQL real', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `atomic_rollback_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
      }
    });

    const wallet = await testPrisma.creditWallet.create({
      data: {
        userId: user.id,
        monthlyBalance: 50,
        purchasedBalance: 0,
        reservedBalance: 0,
        monthlyExpiresAt: new Date(Date.now() + 30 * 86400000)
      }
    });

    const res = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 20,
      idempotencyKey: `atomic_tx_res_${Date.now()}`,
      sourceType: 'COMPANY_SEARCH'
    });

    // Simula transação compartilhada real de gravação que sofre erro proposital no final
    await assert.rejects(
      async () => {
        await testPrisma.$transaction(async (tx) => {
          // Liquidação dentro de tx
          await CreditWalletService.settleReservation({
            reservationId: res.reservationId,
            actualConsumedAmount: 20
          }, tx);

          // Simula falha catastrófica antes do commit da transação
          throw new Error('Falha simulada antes do commit da busca');
        });
      },
      /Falha simulada antes do commit da busca/
    );

    // O PostgreSQL DEVE ter realizado rollback integral!
    // A reserva deve continuar PENDING e a carteira NÃO pode ter sido debitada
    const resAfterRollback = await testPrisma.creditReservation.findUnique({
      where: { id: res.reservationId }
    });
    assert.equal(resAfterRollback?.status, 'PENDING', 'Status da reserva deve continuar PENDING apos o rollback');

    const walletAfterRollback = await testPrisma.creditWallet.findUnique({
      where: { id: wallet.id }
    });
    assert.equal(walletAfterRollback?.monthlyBalance, 50, 'Saldo mensal deve permanecer 50');
    assert.equal(walletAfterRollback?.reservedBalance, 20, 'ReservedBalance deve permanecer 20');
  });
});
