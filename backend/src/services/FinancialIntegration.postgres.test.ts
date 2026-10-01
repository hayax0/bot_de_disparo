import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma as testPrisma, resolvePrismaDatabaseUrl } from '../lib/prisma';
import { CreditWalletService, InsufficientCreditsError } from './CreditWalletService';
import { CompanySearchService, setTestPlacesProvider } from './CompanySearchService';
import { QuotaService } from './QuotaService';
import { companySearchQueue } from './queue';
import { ENV } from '../config/env';

/**
 * Extrai o nome exato do banco de dados a partir da URL de conexão.
 * Ignora trechos de usuário, host ou parâmetros para evitar falsos positivos com '_test'.
 */
export function extractDatabaseName(connectionUrl: string): string {
  if (!connectionUrl) return '';
  try {
    const urlObj = new URL(connectionUrl.replace(/^postgres:/, 'http:').replace(/^postgresql:/, 'http:'));
    return urlObj.pathname.replace(/^\//, '').split('?')[0];
  } catch {
    const match = connectionUrl.match(/\/([^/?#]+)(\?.*)?$/);
    return match ? match[1] : '';
  }
}

/**
 * Validação de segurança estrita antes de qualquer TRUNCATE.
 * Valida o destino EFETIVAMENTE CONECTADO no PostgreSQL via SELECT current_database()
 * e verifica o nome exato do banco ('bot_prospeccao_test').
 */
export async function assertConnectedToTestDatabase(client: typeof testPrisma): Promise<string> {
  const result = await client.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  const connectedDb = result[0]?.current_database || '';

  // O nome exato do banco de teste DEVE ser 'bot_prospeccao_test'
  if (connectedDb !== 'bot_prospeccao_test') {
    throw new Error(
      `[SEGURANÇA BLOQUEADA] O banco de dados conectado no PostgreSQL é "${connectedDb}". ` +
      `Operações destrutivas com TRUNCATE só são permitidas no banco de teste "bot_prospeccao_test".`
    );
  }

  // Verifica se a URL configurada aponta para o mesmo banco exato
  const activeUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
  const urlDbName = extractDatabaseName(activeUrl);
  if (urlDbName && urlDbName !== connectedDb) {
    throw new Error(
      `[SEGURANÇA BLOQUEADA] Divergência detectada: a URL aponta para "${urlDbName}", mas o PostgreSQL está conectado em "${connectedDb}".`
    );
  }

  return connectedDb;
}

test('FinancialIntegration Postgres: Suite Real de Transacoes, Concorrencia e Idempotencia', async (t) => {
  // Valida conexão efetiva com banco de teste no PostgreSQL antes de qualquer TRUNCATE (Item 2)
  await assertConnectedToTestDatabase(testPrisma);

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

  // =========================================================================
  // CENÁRIO 7: Reconciliação da Apify vincula inequivocamente e não contamina buscas próximas (Item 1)
  // Duas buscas diferentes ("Restaurantes" vs "Dentistas") iniciadas próximas não reutilizam execução alheia
  // =========================================================================
  await t.test('Cenario 7: Duas buscas diferentes proximas nao compartilham execucao na Apify por reconciliacao temporal', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `apify_reconcile_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
      }
    });

    const workspace = await testPrisma.workspace.create({
      data: { name: 'WS Apify Test', userId: user.id }
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

    // Garante que o provider mock não desvie a chamada da Apify
    setTestPlacesProvider(null);
    const originalToken = ENV.APIFY_API_TOKEN;
    (ENV as any).APIFY_API_TOKEN = 'test-apify-token';

    // Mock realista de chamadas HTTP à API da Apify para simular execuções externas
    const apifyRuns = new Map<string, any>();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (url: any, init?: any) => {
      const urlStr = String(url);

      // POST para criar novo run na Apify
      if (urlStr.includes('/acts/compass~crawler-google-places/runs') && init?.method === 'POST') {
        const body = JSON.parse(init.body);
        const runId = `run_${body.customData?.segment || 'search'}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const datasetId = `dataset_${runId}`;

        const runRecord = {
          id: runId,
          status: 'SUCCEEDED',
          startedAt: new Date().toISOString(),
          defaultDatasetId: datasetId,
          input: body
        };
        apifyRuns.set(runId, runRecord);

        return new Response(JSON.stringify({
          data: { id: runId, defaultDatasetId: datasetId }
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }

      // GET lista de runs recentes (reconciliação)
      if (urlStr.includes('/acts/compass~crawler-google-places/runs') && (!init?.method || init.method === 'GET')) {
        const items = Array.from(apifyRuns.values()).map(r => ({
          id: r.id,
          status: r.status,
          startedAt: r.startedAt,
          defaultDatasetId: r.defaultDatasetId
        }));
        return new Response(JSON.stringify({
          data: { items }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // GET input do run específico
      if (urlStr.includes('/actor-runs/') && urlStr.endsWith('/input')) {
        const match = urlStr.match(/\/actor-runs\/([^/?]+)\/input/);
        const runId = match ? match[1] : '';
        const run = apifyRuns.get(runId);
        if (run) {
          return new Response(JSON.stringify(run.input), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response('Not found', { status: 404 });
      }

      // GET status do run
      if (urlStr.includes('/actor-runs/')) {
        const match = urlStr.match(/\/actor-runs\/([^/?]+)/);
        const runId = match ? match[1] : '';
        const run = apifyRuns.get(runId);
        if (run) {
          return new Response(JSON.stringify({
            data: { status: run.status, defaultDatasetId: run.defaultDatasetId }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Not found', { status: 404 });
      }

      // GET itens do dataset
      if (urlStr.includes('/datasets/') && urlStr.includes('/items')) {
        const match = urlStr.match(/\/datasets\/([^/?]+)\/items/);
        const datasetId = match ? match[1] : '';

        if (datasetId.includes('Restaurantes')) {
          return new Response(JSON.stringify([
            { title: 'Restaurante Sabor Paulista', phone: '5511999991111', category: 'Restaurante', address: 'Av Paulista, 100' }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } else if (datasetId.includes('Dentistas')) {
          return new Response(JSON.stringify([
            { title: 'Clinica Odonto Sorriso', phone: '5541988882222', category: 'Dentista', address: 'Rua das Flores, 200' }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return originalFetch(url, init);
    }) as any;

    try {
      // 1. Inicia Busca A: "Restaurantes" em "Sao Paulo"
      const searchA = await CompanySearchService.initiateSearch({
        userId: user.id,
        workspaceId: workspace.id,
        segment: 'Restaurantes',
        location: 'Sao Paulo',
        requestedCount: 10,
        idempotencyKey: `apify_reconcile_A_${Date.now()}`
      });

      assert.ok(searchA, 'searchA deve existir');
      assert.equal(searchA.status, 'COMPLETED');
      assert.ok(searchA.apifyRunId, 'Busca A deve possuir um apifyRunId gerado');

      // 2. Imediatamente após, inicia Busca B: "Dentistas" em "Curitiba"
      // Quando a Busca B roda, a lista de runs recentes da Apify contém o run da Busca A (recente e concluído)
      const searchB = await CompanySearchService.initiateSearch({
        userId: user.id,
        workspaceId: workspace.id,
        segment: 'Dentistas',
        location: 'Curitiba',
        requestedCount: 10,
        idempotencyKey: `apify_reconcile_B_${Date.now()}`
      });

      assert.ok(searchB, 'searchB deve existir');
      assert.equal(searchB.status, 'COMPLETED');
      assert.ok(searchB.apifyRunId, 'Busca B deve possuir um apifyRunId gerado');

      // 3. Validação estrita:
      // A Busca B NÃO DEVE reutilizar o run da Busca A apenas por proximidade temporal!
      assert.notEqual(
        searchA.apifyRunId,
        searchB.apifyRunId,
        'Busca B NÃO pode reutilizar a execução da Busca A por reconciliação indevida'
      );

      // 4. Os resultados não podem ter sido cruzados:
      const resultsA = await testPrisma.companySearchResult.findMany({ where: { searchId: searchA.id } });
      const resultsB = await testPrisma.companySearchResult.findMany({ where: { searchId: searchB.id } });

      assert.equal(resultsA[0]?.name, 'Restaurante Sabor Paulista');
      assert.equal(resultsB[0]?.name, 'Clinica Odonto Sorriso');
    } finally {
      globalThis.fetch = originalFetch;
      (ENV as any).APIFY_API_TOKEN = originalToken;
      setTestPlacesProvider(null);
    }
  });

  // =========================================================================
  // CENÁRIO 8: Validação estrita de isolamento de banco de teste e tolerância a NODE_ENV ausente (Item 2)
  // Rejeita URLs com '_test' no usuário e opera com segurança mesmo com NODE_ENV ausente
  // =========================================================================
  await t.test('Cenario 8: Validacao estrita de banco conectado, rejeicao de falsos positivos e teste com NODE_ENV ausente', async () => {
    // 1. Comprova extração exata do nome do banco (não aceita _test em outros trechos)
    const dangerousUrl = 'postgresql://admin_test:segredo123@db.producao.com:5432/bot_prospeccao_producao?ssl=true';
    const extractedDb = extractDatabaseName(dangerousUrl);
    assert.equal(extractedDb, 'bot_prospeccao_producao', 'Deve extrair o nome exato do banco e ignorar o usuario admin_test');

    // 2. Valida que o banco conectado atualmente no PostgreSQL é estritamente 'bot_prospeccao_test'
    const connectedDb = await assertConnectedToTestDatabase(testPrisma);
    assert.equal(connectedDb, 'bot_prospeccao_test', 'Banco conectado deve ser estritamente bot_prospeccao_test');

    // 3. Simula execução com NODE_ENV ausente (delete process.env.NODE_ENV)
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      delete process.env.NODE_ENV;
      assert.equal(process.env.NODE_ENV, undefined, 'NODE_ENV deve estar ausente');

      // Executa query de banco e validação: deve funcionar perfeitamente e continuar conectado no banco de teste
      const dbWithoutEnv = await assertConnectedToTestDatabase(testPrisma);
      assert.equal(dbWithoutEnv, 'bot_prospeccao_test', 'Mesmo com NODE_ENV ausente, continua conectado na base de teste');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }

    // 4. Simula tentativa de conexão em banco que não é de teste: deve abortar com SEGURANÇA BLOQUEADA
    const fakePrismaMock: any = {
      $queryRaw: async () => [{ current_database: 'bot_prospeccao_producao' }]
    };

    await assert.rejects(
      async () => {
        await assertConnectedToTestDatabase(fakePrismaMock);
      },
      /\[SEGURANÇA BLOQUEADA\] O banco de dados conectado no PostgreSQL é "bot_prospeccao_producao"/
    );

    // 5. Comprova que desenvolvimento com as duas URLs configuradas continua no banco de desenvolvimento
    const originalEnv = process.env.NODE_ENV;
    const originalDbUrl = process.env.DATABASE_URL;
    const originalTestDbUrl = process.env.TEST_DATABASE_URL;
    try {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/bot_prospeccao_dev';
      process.env.TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/bot_prospeccao_test';

      const devResolvedUrl = resolvePrismaDatabaseUrl();
      assert.equal(
        devResolvedUrl,
        'postgresql://postgres:postgres@localhost:5432/bot_prospeccao_dev',
        'Em desenvolvimento com ambas as URLs configuradas, deve selecionar estritamente DATABASE_URL de desenvolvimento'
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.DATABASE_URL = originalDbUrl;
      process.env.TEST_DATABASE_URL = originalTestDbUrl;
    }
  });

  // =========================================================================
  // CENÁRIO 9: Reenfileiramento recupera reserva liberada e P2002 valida payload completo (Item 3)
  // Se queue.add falhar e liberar a reserva, a repetição recupera a reserva e conclui com sucesso
  // =========================================================================
  await t.test('Cenario 9: Reenfileiramento de busca com reserva liberada aloca nova reserva e P2002 valida payload completo', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `re_enqueue_recov_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
      }
    });

    const workspace = await testPrisma.workspace.create({
      data: { name: 'WS Recovery Test', userId: user.id }
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

    setTestPlacesProvider(async (segment, _location, count) => {
      const total = count || 10;
      const seed = Math.abs(segment.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 900 + 100;
      return Array.from({ length: total }, (_, i) => ({
        title: `${segment} ${i + 1}`,
        phone: `551198${seed}${String(i).padStart(4, '0')}`
      }));
    });

    const idempotencyKey = `orphaned_res_test_${Date.now()}`;

    // 1. Simula estado resultante de falha no queue.add:
    // Cria reserva inicial e libera-a imediatamente (simulando o catch de falha na fila)
    const initialRes = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 10,
      idempotencyKey,
      sourceType: 'COMPANY_SEARCH'
    });

    await CreditWalletService.releaseReservation({
      reservationId: initialRes.reservationId,
      reason: 'Falha simulada na fila queue.add'
    });

    // Cria o registro da busca como PENDING com a reserva já em RELEASED
    await testPrisma.companySearch.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        idempotencyKey,
        reservationId: initialRes.reservationId,
        query: 'Auto Eletrica em Sao Paulo',
        segment: 'Auto Eletrica',
        location: 'Sao Paulo',
        requestedCount: 10,
        creditsReserved: 10,
        status: 'PENDING'
      }
    });

    // Confere que a reserva original está de fato RELEASED
    const oldReservation = await testPrisma.creditReservation.findUnique({
      where: { id: initialRes.reservationId }
    });
    assert.equal(oldReservation?.status, 'RELEASED', 'Reserva original deve estar RELEASED');

    // 2. Chama initiateSearch novamente com a MESMA chave (repetição ou re-enfileiramento)
    // O sistema DEVE recuperar a reserva, gerando uma nova reserva PENDING e liquidando com sucesso!
    const completedSearch = await CompanySearchService.initiateSearch({
      userId: user.id,
      workspaceId: workspace.id,
      segment: 'Auto Eletrica',
      location: 'Sao Paulo',
      requestedCount: 10,
      idempotencyKey
    });

    assert.ok(completedSearch, 'completedSearch deve existir');
    assert.equal(completedSearch.status, 'COMPLETED');
    assert.notEqual(
      completedSearch.reservationId,
      initialRes.reservationId,
      'A busca recuperada deve ter um novo reservationId ativo'
    );

    const newRes = await testPrisma.creditReservation.findUnique({
      where: { id: completedSearch.reservationId! }
    });
    assert.equal(newRes?.status, 'SETTLED', 'A nova reserva recuperada deve ser liquidada (SETTLED) com sucesso');

    // 3. Validação do conflito P2002 com payload divergente:
    // Tenta usar a mesma chave de idempotência com parâmetros diferentes
    await assert.rejects(
      async () => {
        await CompanySearchService.initiateSearch({
          userId: user.id,
          workspaceId: workspace.id,
          segment: 'Padarias', // Segmento diferente!
          location: 'Sao Paulo',
          requestedCount: 10,
          idempotencyKey
        });
      },
      /Chave de idempotência já utilizada com parâmetros de busca diferentes/
    );

    // 4. Repetição de busca FAILED não retém novos créditos indevidamente
    const failedKey = `failed_search_${Date.now()}`;
    const initialFailedRes = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 15,
      idempotencyKey: failedKey,
      sourceType: 'COMPANY_SEARCH'
    });
    await CreditWalletService.releaseReservation({
      reservationId: initialFailedRes.reservationId,
      reason: 'Falha simulada na execução externa'
    });
    await testPrisma.companySearch.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        idempotencyKey: failedKey,
        reservationId: initialFailedRes.reservationId,
        query: 'Oficinas em Sao Paulo',
        segment: 'Oficinas',
        location: 'Sao Paulo',
        requestedCount: 15,
        creditsReserved: 15,
        status: 'FAILED',
        errorMessage: 'Provedor indisponível'
      }
    });

    const summaryBeforeFailedRetry = await CreditWalletService.getWalletSummary(user.id);

    const retryFailedResult = await CompanySearchService.initiateSearch({
      userId: user.id,
      workspaceId: workspace.id,
      segment: 'Oficinas',
      location: 'Sao Paulo',
      requestedCount: 15,
      idempotencyKey: failedKey
    });

    assert.equal(retryFailedResult.status, 'FAILED', 'Busca FAILED não deve ser re-enfileirada nem alterada');
    const summaryAfterFailedRetry = await CreditWalletService.getWalletSummary(user.id);
    assert.equal(
      summaryAfterFailedRetry.reservedBalance,
      summaryBeforeFailedRetry.reservedBalance,
      'Repetição de busca FAILED não pode alocar créditos nem alterar reservedBalance'
    );
    assert.equal(
      summaryAfterFailedRetry.availableBalance,
      summaryBeforeFailedRetry.availableBalance,
      'Repetição de busca FAILED não pode debitar saldo disponível'
    );

    // 5. Duas recuperações simultâneas deixam apenas uma reserva ativa vinculada
    const concurrentKey = `concurrent_recov_${Date.now()}`;
    const origConcurRes = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 10,
      idempotencyKey: concurrentKey,
      sourceType: 'COMPANY_SEARCH'
    });
    await CreditWalletService.releaseReservation({
      reservationId: origConcurRes.reservationId,
      reason: 'Falha inicial'
    });
    const concurrentSearchRecord = await testPrisma.companySearch.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        idempotencyKey: concurrentKey,
        reservationId: origConcurRes.reservationId,
        query: 'Clinicas em Sao Paulo',
        segment: 'Clinicas',
        location: 'Sao Paulo',
        requestedCount: 10,
        creditsReserved: 10,
        status: 'PENDING'
      }
    });

    // Dispara duas recuperações simultâneas em paralelo
    const [recovA, recovB] = await Promise.all([
      CompanySearchService.initiateSearch({
        userId: user.id,
        workspaceId: workspace.id,
        segment: 'Clinicas',
        location: 'Sao Paulo',
        requestedCount: 10,
        idempotencyKey: concurrentKey
      }),
      CompanySearchService.initiateSearch({
        userId: user.id,
        workspaceId: workspace.id,
        segment: 'Clinicas',
        location: 'Sao Paulo',
        requestedCount: 10,
        idempotencyKey: concurrentKey
      })
    ]);

    assert.equal(recovA.status, 'COMPLETED');
    assert.equal(recovB.status, 'COMPLETED');
    assert.equal(recovA.reservationId, recovB.reservationId, 'Ambas as chamadas devem estar vinculadas à mesma reserva recuperada');

    // Valida no banco: existe exatamente 1 reserva de recuperação criada com chave determinística gen_1
    const deterministicKey = `recovery_search_${concurrentSearchRecord.id}_gen_1`;
    const createdReservations = await testPrisma.creditReservation.findMany({
      where: {
        userId: user.id,
        idempotencyKey: deterministicKey
      }
    });
    assert.equal(createdReservations.length, 1, 'Deve existir exatamente 1 reserva criada com a chave determinística');

    // 6. Falha de enfileiramento durante a recuperação não abandona saldo e repetição posterior conclui com sucesso
    const queueFailKey = `queue_fail_${Date.now()}`;
    const origQueueFailRes = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 10,
      idempotencyKey: queueFailKey,
      sourceType: 'COMPANY_SEARCH'
    });
    await CreditWalletService.releaseReservation({
      reservationId: origQueueFailRes.reservationId,
      reason: 'Falha inicial'
    });
    const queueFailSearchRecord = await testPrisma.companySearch.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        idempotencyKey: queueFailKey,
        reservationId: origQueueFailRes.reservationId,
        query: 'Academias em Sao Paulo',
        segment: 'Academias',
        location: 'Sao Paulo',
        requestedCount: 10,
        creditsReserved: 10,
        status: 'PENDING'
      }
    });

    const summaryBeforeQueueFail = await CreditWalletService.getWalletSummary(user.id);

    // Mock de companySearchQueue.add para simular indisponibilidade do Redis durante o enfileiramento
    const originalQueueAdd = companySearchQueue.add;
    (companySearchQueue as any).add = async () => {
      throw new Error('Falha simulada de conexao com o Redis ao enfileirar');
    };

    // Força modo não-teste temporariamente para exercitar o bloco do BullMQ queue.add
    const originalEnvNode = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';

    try {
      await assert.rejects(
        async () => {
          await CompanySearchService.initiateSearch({
            userId: user.id,
            workspaceId: workspace.id,
            segment: 'Academias',
            location: 'Sao Paulo',
            requestedCount: 10,
            idempotencyKey: queueFailKey
          });
        },
        /Falha simulada de conexao com o Redis ao enfileirar/
      );
    } finally {
      process.env.NODE_ENV = originalEnvNode;
      companySearchQueue.add = originalQueueAdd;
    }

    // Comprova que nenhuma reserva ficou pendente e nenhum saldo ficou retido/abandonado
    const summaryAfterQueueFail = await CreditWalletService.getWalletSummary(user.id);
    assert.equal(
      summaryAfterQueueFail.reservedBalance,
      summaryBeforeQueueFail.reservedBalance,
      'Falha de enfileiramento na recuperacao nao pode abandonar saldo retido (reservedBalance deve voltar ao estado anterior)'
    );

    const recoveryResDb = await testPrisma.creditReservation.findUnique({
      where: { idempotencyKey: `recovery_search_${queueFailSearchRecord.id}_gen_1` }
    });
    assert.equal(
      recoveryResDb?.status,
      'RELEASED',
      'A reserva recuperada (gen_1) que falhou ao enfileirar deve ser imediatamente cancelada com status RELEASED'
    );

    // Repete a mesma solicitação com a fila restaurada: deve criar a reserva gen_2 e concluir a busca com sucesso
    const retryCompletedSearch = await CompanySearchService.initiateSearch({
      userId: user.id,
      workspaceId: workspace.id,
      segment: 'Academias',
      location: 'Sao Paulo',
      requestedCount: 10,
      idempotencyKey: queueFailKey
    });

    assert.equal(retryCompletedSearch.status, 'COMPLETED', 'A repetição da busca após restauração da fila deve concluir com sucesso');

    // Valida cobrança única, integridade de saldo e nenhuma reserva abandonada
    const allRecoveriesForSearch = await testPrisma.creditReservation.findMany({
      where: {
        OR: [
          { sourceId: queueFailSearchRecord.id },
          { idempotencyKey: { startsWith: `recovery_search_${queueFailSearchRecord.id}` } }
        ]
      }
    });

    assert.equal(allRecoveriesForSearch.length, 2, 'Devem existir exatamente 2 reservas registradas (gen_1 e gen_2)');
    const gen1Res = allRecoveriesForSearch.find(r => r.idempotencyKey.endsWith('_gen_1'));
    const gen2Res = allRecoveriesForSearch.find(r => r.idempotencyKey.endsWith('_gen_2'));
    assert.equal(gen1Res?.status, 'RELEASED', 'A primeira reserva gen_1 deve permanecer RELEASED');
    assert.equal(gen2Res?.status, 'SETTLED', 'A segunda reserva gen_2 deve ser liquidada como SETTLED');
    assert.equal(
      allRecoveriesForSearch.filter(r => r.status === 'PENDING').length,
      0,
      'Nenhuma reserva pode permanecer abandonada com status PENDING'
    );

    const summaryAfterRetrySuccess = await CreditWalletService.getWalletSummary(user.id);
    assert.equal(summaryAfterRetrySuccess.reservedBalance, 0, 'ReservedBalance final deve ser 0');
    assert.equal(
      summaryAfterRetrySuccess.availableBalance,
      summaryBeforeQueueFail.availableBalance - 10,
      'Cobrança deve ser estritamente única (exatamente 10 créditos descontados)'
    );

    // 7. Repetição com duas solicitações simultâneas após falha de enfileiramento na recuperação
    const concurrentAfterFailKey = `concurrent_after_fail_${Date.now()}`;
    const origSimulRes = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 10,
      idempotencyKey: concurrentAfterFailKey,
      sourceType: 'COMPANY_SEARCH'
    });
    await CreditWalletService.releaseReservation({
      reservationId: origSimulRes.reservationId,
      reason: 'Falha inicial'
    });
    const simulSearchRecord = await testPrisma.companySearch.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        idempotencyKey: concurrentAfterFailKey,
        reservationId: origSimulRes.reservationId,
        query: 'Pilates em Sao Paulo',
        segment: 'Pilates',
        location: 'Sao Paulo',
        requestedCount: 10,
        creditsReserved: 10,
        status: 'PENDING'
      }
    });

    // Provoca falha de enfileiramento na primeira recuperação
    (companySearchQueue as any).add = async () => {
      throw new Error('Falha simulada de conexao Redis na primeira recuperacao');
    };
    (process.env as any).NODE_ENV = 'production';

    try {
      await assert.rejects(
        async () => {
          await CompanySearchService.initiateSearch({
            userId: user.id,
            workspaceId: workspace.id,
            segment: 'Pilates',
            location: 'Sao Paulo',
            requestedCount: 10,
            idempotencyKey: concurrentAfterFailKey
          });
        },
        /Falha simulada de conexao Redis na primeira recuperacao/
      );
    } finally {
      process.env.NODE_ENV = originalEnvNode;
      companySearchQueue.add = originalQueueAdd;
    }

    const summaryBeforeConcurrentRetry = await CreditWalletService.getWalletSummary(user.id);

    // Com a fila restaurada, dispara duas solicitações simultâneas para a mesma busca
    const [simulResA, simulResB] = await Promise.all([
      CompanySearchService.initiateSearch({
        userId: user.id,
        workspaceId: workspace.id,
        segment: 'Pilates',
        location: 'Sao Paulo',
        requestedCount: 10,
        idempotencyKey: concurrentAfterFailKey
      }),
      CompanySearchService.initiateSearch({
        userId: user.id,
        workspaceId: workspace.id,
        segment: 'Pilates',
        location: 'Sao Paulo',
        requestedCount: 10,
        idempotencyKey: concurrentAfterFailKey
      })
    ]);

    assert.equal(simulResA.status, 'COMPLETED');
    assert.equal(simulResB.status, 'COMPLETED');
    assert.equal(
      simulResA.reservationId,
      simulResB.reservationId,
      'Ambas as solicitações simultâneas devem estar vinculadas à mesma reserva da geração recuperada'
    );

    const allRecoveriesForSimul = await testPrisma.creditReservation.findMany({
      where: {
        OR: [
          { sourceId: simulSearchRecord.id },
          { idempotencyKey: { startsWith: `recovery_search_${simulSearchRecord.id}` } }
        ]
      }
    });

    assert.equal(allRecoveriesForSimul.length, 2, 'Devem existir exatamente 2 reservas (gen_1 liberada e gen_2 ativa/liquidada)');
    const simulGen1 = allRecoveriesForSimul.find(r => r.idempotencyKey.endsWith('_gen_1'));
    const simulGen2 = allRecoveriesForSimul.find(r => r.idempotencyKey.endsWith('_gen_2'));
    assert.equal(simulGen1?.status, 'RELEASED', 'A primeira reserva que falhou deve estar RELEASED');
    assert.equal(simulGen2?.status, 'SETTLED', 'A segunda reserva compartilhada pelas simultâneas deve estar SETTLED');
    assert.equal(
      allRecoveriesForSimul.filter(r => r.status === 'PENDING').length,
      0,
      'Nenhuma reserva pode permanecer abandonada'
    );

    const summaryAfterSimulSuccess = await CreditWalletService.getWalletSummary(user.id);
    assert.equal(summaryAfterSimulSuccess.reservedBalance, 0, 'ReservedBalance final deve ser 0');
    assert.equal(
      summaryAfterSimulSuccess.availableBalance,
      summaryBeforeConcurrentRetry.availableBalance - 10,
      'Mesmo com duas chamadas simultâneas, a cobrança deve ser estritamente única (10 créditos debitados)'
    );

    // 8. reserveCredits não trata reserva liberada como retenção válida nem a reativa sem saldo
    const explicitReleasedKey = `explicit_released_test_${Date.now()}`;
    const explicitRes = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 5,
      idempotencyKey: explicitReleasedKey,
      sourceType: 'COMPANY_SEARCH'
    });
    await CreditWalletService.releaseReservation({
      reservationId: explicitRes.reservationId,
      reason: 'Liberação proposital'
    });

    // Zera saldo livre do usuário para provar que a chave liberada NÃO é tratada como retenção válida
    await testPrisma.creditWallet.update({
      where: { userId: user.id },
      data: { monthlyBalance: 0, purchasedBalance: 0, reservedBalance: 0 }
    });

    await assert.rejects(
      async () => {
        await CreditWalletService.reserveCredits({
          userId: user.id,
          amount: 5,
          idempotencyKey: explicitReleasedKey,
          sourceType: 'COMPANY_SEARCH'
        });
      },
      /Saldo insuficiente/,
      'Não pode tratar reserva liberada como retenção válida nem reativá-la sem saldo disponível'
    );

    // Restaura saldo e comprova que a reativação reserva o saldo atomicamente
    await testPrisma.creditWallet.update({
      where: { userId: user.id },
      data: { monthlyBalance: 20 }
    });

    const reactivatedRes = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 5,
      idempotencyKey: explicitReleasedKey,
      sourceType: 'COMPANY_SEARCH'
    });
    assert.equal(reactivatedRes.reservationId, explicitRes.reservationId);
    const walletAfterReactivation = await testPrisma.creditWallet.findUnique({ where: { userId: user.id } });
    assert.equal(walletAfterReactivation?.reservedBalance, 5, 'Reativação atômica deve incrementar reservedBalance');
  });

  // =========================================================================
  // CENÁRIO 10: Ciclo original nos disparos (QuotaService) (Item 4)
  // Liberação atrasada do ciclo anterior NÃO diminui o contador do ciclo novo
  // =========================================================================
  await t.test('Cenario 10: Reserva anterior a renovacao seguida de liberacao atrasada nao afeta o contador do novo ciclo', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `cycle_preserve_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        monthlyDispatchQuota: 100,
        dispatchesUsedInCycle: 0,
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 60 * 86400000),
        cycleResetAt: new Date(Date.now() + 30 * 86400000)
      }
    });

    // 1. Disparo no Ciclo 1
    const quota1 = await QuotaService.tryConsumeDispatchQuota({
      userId: user.id,
      dispatchKey: 'dispatch_cycle_1'
    });

    assert.equal(quota1.allowed, true);
    assert.ok(quota1.reservationId, 'Deve gerar reservationId no ciclo 1');
    const reservationIdCycle1 = quota1.reservationId;

    const userAfterDis1 = await testPrisma.user.findUnique({ where: { id: user.id } });
    assert.equal(userAfterDis1?.dispatchesUsedInCycle, 1, 'Contador do ciclo 1 deve ser 1');

    // 2. Simula renovação do ciclo (avança para Ciclo 2 e zera contador)
    const newCycleDate = new Date(Date.now() + 60 * 86400000);
    await testPrisma.user.update({
      where: { id: user.id },
      data: {
        dispatchesUsedInCycle: 0,
        cycleResetAt: newCycleDate
      }
    });

    // 3. Disparo no Ciclo 2
    const quota2 = await QuotaService.tryConsumeDispatchQuota({
      userId: user.id,
      dispatchKey: 'dispatch_cycle_2'
    });

    assert.equal(quota2.allowed, true);
    assert.ok(quota2.reservationId, 'Deve gerar reservationId no ciclo 2');
    const reservationIdCycle2 = quota2.reservationId;

    const userAfterDis2 = await testPrisma.user.findUnique({ where: { id: user.id } });
    assert.equal(userAfterDis2?.dispatchesUsedInCycle, 1, 'Contador do ciclo 2 deve ser 1');

    // 4. Chega uma liberação atrasada da reserva do Ciclo 1 (após a renovação)
    await QuotaService.releaseDispatchQuota({
      userId: user.id,
      reservationId: reservationIdCycle1
    });

    // Confere no banco: a reserva do Ciclo 1 foi marcada como RELEASED
    const res1Db = await testPrisma.dispatchReservation.findUnique({
      where: { id: reservationIdCycle1 }
    });
    assert.equal(res1Db?.status, 'RELEASED', 'Reserva do ciclo 1 deve ter status RELEASED');

    // O contador do Ciclo 2 NÃO pode ter sido diminuído para 0! Deve continuar 1!
    const userAfterStaleRelease = await testPrisma.user.findUnique({ where: { id: user.id } });
    assert.equal(
      userAfterStaleRelease?.dispatchesUsedInCycle,
      1,
      'Liberacao de reserva do ciclo anterior NÃO pode diminuir o contador do novo ciclo'
    );

    // 5. Agora libera a reserva do próprio Ciclo 2
    await QuotaService.releaseDispatchQuota({
      userId: user.id,
      reservationId: reservationIdCycle2
    });

    const userAfterCurrentRelease = await testPrisma.user.findUnique({ where: { id: user.id } });
    assert.equal(
      userAfterCurrentRelease?.dispatchesUsedInCycle,
      0,
      'Liberacao de reserva do ciclo atual deve diminuir o contador para 0'
    );
  });
});
