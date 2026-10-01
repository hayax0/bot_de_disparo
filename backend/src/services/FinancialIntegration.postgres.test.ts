import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma as testPrisma } from '../lib/prisma';
import { CreditWalletService, InsufficientCreditsError } from './CreditWalletService';
import { CompanySearchService, setTestPlacesProvider } from './CompanySearchService';
import { QuotaService } from './QuotaService';
import { getUserCapabilities, isLegacyPlan } from '../config/plans';

test('FinancialIntegration Postgres: suite completa de validacao real', async (t) => {
  // Limpeza inicial do banco de testes
  await testPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE "CreditTransaction", "CreditReservation", "CreditWallet", "CompanySearchResult", "CompanySearch", "Lead", "DispatchHistory", "Campaign", "Workspace", "User" CASCADE;
  `);

  t.after(async () => {
    await testPrisma.$disconnect();
    setTestPlacesProvider(null);
  });

  // 1. Modelo de Hold e Saldo Disponível (Item 1)
  await t.test('Item 1: Saldo disponivel desconta reserva uma unica vez e permite reservas simultaneas legitimas', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `hold_user_${Date.now()}@test.com`,
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
        monthlyBalance: 100,
        purchasedBalance: 0,
        reservedBalance: 0,
        monthlyExpiresAt: new Date(Date.now() + 30 * 86400000)
      }
    });

    // Reserva 20 créditos de 100
    const res1 = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 20,
      idempotencyKey: `hold_test_1_${Date.now()}`,
      sourceType: 'COMPANY_SEARCH'
    }, testPrisma as any);

    assert.equal(res1.success, true);
    assert.equal(res1.reservedAmount, 20);

    // Consulta resumo da carteira no banco real
    const updatedWallet = await testPrisma.creditWallet.findUnique({ where: { id: wallet.id } });
    assert.equal(updatedWallet?.monthlyBalance, 100, 'Saldo bruto mensal deve permanecer 100 no modelo Clean Hold');
    assert.equal(updatedWallet?.reservedBalance, 20, 'ReservedBalance deve ser exatamente 20');

    // availableBalance deve ser exatamente 80 (e NUNCA 60!)
    const totalAvail = (updatedWallet!.monthlyBalance + updatedWallet!.purchasedBalance) - updatedWallet!.reservedBalance;
    assert.equal(totalAvail, 80, 'Saldo livre deve ser exatamente 80');

    // Uma segunda reserva simultânea de 80 créditos deve ser APROVADA (no bug anterior calculava 60 livres e falhava)
    const res2 = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 80,
      idempotencyKey: `hold_test_2_${Date.now()}`,
      sourceType: 'COMPANY_SEARCH'
    }, testPrisma as any);

    assert.equal(res2.success, true);
    assert.equal(res2.reservedAmount, 80);

    const walletAfterBoth = await testPrisma.creditWallet.findUnique({ where: { id: wallet.id } });
    assert.equal(walletAfterBoth?.reservedBalance, 100);

    // Agora sim está 100% esgotado: tentativa de reservar mais 1 crédito deve falhar
    await assert.rejects(
      async () => {
        await CreditWalletService.reserveCredits({
          userId: user.id,
          amount: 1,
          idempotencyKey: `hold_test_3_${Date.now()}`,
          sourceType: 'COMPANY_SEARCH'
        }, testPrisma as any);
      },
      (err: any) => err instanceof InsufficientCreditsError
    );
  });

  // 2. Cobrança e Resultados na mesma transação (Item 2)
  await t.test('Item 2: Falha apos liquidacao faz rollback atomico compartilhado de cobranca e resultados', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `rollback_user_${Date.now()}@test.com`,
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
        reservedBalance: 20,
        monthlyExpiresAt: new Date(Date.now() + 30 * 86400000)
      }
    });

    const reservation = await testPrisma.creditReservation.create({
      data: {
        walletId: wallet.id,
        userId: user.id,
        idempotencyKey: `res_rb_${Date.now()}`,
        amount: 20,
        monthlyAmount: 20,
        purchasedAmount: 0,
        monthlyExpiresAt: wallet.monthlyExpiresAt,
        status: 'PENDING',
        sourceType: 'COMPANY_SEARCH'
      }
    });

    const workspace = await testPrisma.workspace.create({
      data: {
        name: 'WS Rollback Test',
        userId: user.id
      }
    });

    const search = await testPrisma.companySearch.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        reservationId: reservation.id,
        query: 'Dentistas em SP',
        segment: 'Dentistas',
        location: 'SP',
        requestedCount: 20,
        creditsReserved: 20,
        status: 'PROCESSING'
      }
    });

    // Simula a transação atômica onde settleReservation recebe 'tx' e em seguida ocorre um erro antes do commit
    await assert.rejects(
      async () => {
        await testPrisma.$transaction(async (tx) => {
          // Cria resultado na busca
          await tx.companySearchResult.create({
            data: {
              searchId: search.id,
              workspaceId: workspace.id,
              name: 'Clinica Teste',
              phone: '5511999991111',
              isUsable: true
            }
          });

          // Liquida reserva compartilhando a MESMA transação (tx)
          await CreditWalletService.settleReservation({
            reservationId: reservation.id,
            actualConsumedAmount: 1,
            description: '1 resultado aproveitável'
          }, tx);

          // Simula falha catastrófica antes do encerramento da busca
          throw new Error('SIMULATED_FAILURE_BEFORE_COMMIT');
        });
      },
      /SIMULATED_FAILURE_BEFORE_COMMIT/
    );

    // Comprova que o rollback foi 100% perfeito:
    // 1. Reserva continua PENDING no banco real
    const reservationAfterRollback = await testPrisma.creditReservation.findUnique({
      where: { id: reservation.id }
    });
    assert.equal(reservationAfterRollback?.status, 'PENDING', 'Reserva deve continuar PENDING após rollback');

    // 2. Carteira não foi debitada
    const walletAfterRollback = await testPrisma.creditWallet.findUnique({
      where: { id: wallet.id }
    });
    assert.equal(walletAfterRollback?.monthlyBalance, 50, 'Saldo mensal não pode ter sofrido débito');
    assert.equal(walletAfterRollback?.reservedBalance, 20, 'Hold de reserva deve continuar intacto');

    // 3. Resultado não foi persistido
    const resultsCount = await testPrisma.companySearchResult.count({
      where: { searchId: search.id }
    });
    assert.equal(resultsCount, 0, 'Resultados devem ter sofrido rollback integral');
  });

  // 3. Idempotência e Bloqueio Atômico na Liquidação Concorrente (Item 3)
  await t.test('Item 3: Concorrencia na liquidacao e liberacao transiciona atomicamente via updateMany', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `race_user_${Date.now()}@test.com`,
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
        monthlyBalance: 100,
        purchasedBalance: 0,
        reservedBalance: 30,
        monthlyExpiresAt: new Date(Date.now() + 30 * 86400000)
      }
    });

    const reservation = await testPrisma.creditReservation.create({
      data: {
        walletId: wallet.id,
        userId: user.id,
        idempotencyKey: `res_race_${Date.now()}`,
        amount: 30,
        monthlyAmount: 30,
        purchasedAmount: 0,
        monthlyExpiresAt: wallet.monthlyExpiresAt,
        status: 'PENDING',
        sourceType: 'COMPANY_SEARCH'
      }
    });

    // Dispara 5 liquidações simultâneas em concorrência real
    const settlements = await Promise.all([
      CreditWalletService.settleReservation({ reservationId: reservation.id, actualConsumedAmount: 20 }, testPrisma as any),
      CreditWalletService.settleReservation({ reservationId: reservation.id, actualConsumedAmount: 20 }, testPrisma as any),
      CreditWalletService.settleReservation({ reservationId: reservation.id, actualConsumedAmount: 20 }, testPrisma as any),
      CreditWalletService.settleReservation({ reservationId: reservation.id, actualConsumedAmount: 20 }, testPrisma as any),
      CreditWalletService.settleReservation({ reservationId: reservation.id, actualConsumedAmount: 20 }, testPrisma as any)
    ]);

    // Todas respondem com sucesso
    for (const s of settlements) {
      assert.equal(s.success, true);
      assert.equal(s.consumedAmount, 20);
    }

    // Exatamente uma teve sucesso primário e as outras foram idempotentes
    const idempotentCount = settlements.filter(s => s.isIdempotent).length;
    assert.equal(idempotentCount, 4, 'Exatamente 4 chamadas devem ter sido reconhecidas como idempotentes');

    // A carteira foi debitada apenas UMA VEZ pelos 20 créditos (100 - 20 = 80)
    const walletFinal = await testPrisma.creditWallet.findUnique({ where: { id: wallet.id } });
    assert.equal(walletFinal?.monthlyBalance, 80, 'Débito na carteira deve ser de estritamente 20 créditos');
    assert.equal(walletFinal?.reservedBalance, 0, 'Hold deve estar totalmente zerado');
  });

  // 6. Proteção contra créditos antigos no ciclo novo (Item 6)
  await t.test('Item 6: Renovacao com reserva pendente nao devolve creditos vencidos ao mes novo', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `cycle_user_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
      }
    });

    const oldCycleExpiry = new Date(Date.now() - 3600000); // Expirou há 1 hora
    const newCycleExpiry = new Date(Date.now() + 30 * 86400000); // Novo ciclo válido por 30 dias

    // Carteira com 50 créditos mensais do ciclo anterior, com 20 em hold
    const wallet = await testPrisma.creditWallet.create({
      data: {
        userId: user.id,
        monthlyBalance: 50,
        purchasedBalance: 0,
        reservedBalance: 20,
        monthlyExpiresAt: oldCycleExpiry
      }
    });

    // Reserva criada no ciclo antigo com persistência do monthlyExpiresAt original
    const oldReservation = await testPrisma.creditReservation.create({
      data: {
        walletId: wallet.id,
        userId: user.id,
        idempotencyKey: `res_old_cycle_${Date.now()}`,
        amount: 20,
        monthlyAmount: 20,
        purchasedAmount: 0,
        monthlyExpiresAt: oldCycleExpiry,
        status: 'PENDING',
        sourceType: 'COMPANY_SEARCH'
      }
    });

    // Virada do ciclo: concessão mensal do novo plano de 100 créditos
    await testPrisma.creditWallet.update({
      where: { id: wallet.id },
      data: {
        monthlyBalance: 100,
        monthlyExpiresAt: newCycleExpiry
      }
    });

    // Libera a reserva antiga pendente do ciclo anterior
    const releaseRes = await CreditWalletService.releaseReservation({
      reservationId: oldReservation.id,
      reason: 'Cancelamento de busca antiga'
    }, testPrisma as any);

    assert.equal(releaseRes.success, true);
    assert.equal(releaseRes.releasedAmount, 20);

    // O saldo do novo mês deve permanecer EXATAMENTE 100, sem incorporar os 20 créditos vencidos de outubro!
    const walletAfterRelease = await testPrisma.creditWallet.findUnique({ where: { id: wallet.id } });
    assert.equal(walletAfterRelease?.monthlyBalance, 100, 'Os créditos expirados do mês passado NUNCA podem somar no novo mês');
    assert.equal(walletAfterRelease?.reservedBalance, 0, 'O hold antigo foi liberado com sucesso');

    // Extrato deve registrar a expiração auditável
    const expTx = await testPrisma.creditTransaction.findFirst({
      where: {
        userId: user.id,
        type: 'EXPIRATION'
      }
    });
    assert.ok(expTx, 'Extrato deve conter transação auditável do tipo EXPIRATION');
  });

  // 7. Isolamento Explícito de Contas sem Plano vs Davi vs Planos Pagos (Item 7)
  await t.test('Item 7: isLegacyPlan e getUserCapabilities exigem associacao explicita e barram contas sem plano', async () => {
    // 1. Conta sem plano nenhum
    const noPlanUser = { role: 'USER', planId: null };
    assert.equal(isLegacyPlan(noPlanUser.planId), false, 'Conta sem plano NÃO pode ser tratada como legado!');
    const noPlanCaps = getUserCapabilities(noPlanUser);
    assert.equal(noPlanCaps.canUpload, false, 'Sem plano não pode fazer upload');
    assert.equal(noPlanCaps.canUseSearch, false, 'Sem plano não pode usar busca');
    assert.equal(noPlanCaps.canUseAi, false, 'Sem plano não pode usar IA');
    assert.equal(noPlanCaps.isLegacy, false);

    // 2. Administrador rebaixado sem plano
    const demotedAdmin = { role: 'USER', planId: null };
    assert.equal(isLegacyPlan(demotedAdmin.planId), false);
    assert.equal(getUserCapabilities(demotedAdmin).canUpload, false);

    // 3. Conta explícita do Davi
    const daviUser = { role: 'USER', planId: 'LEGACY_DAVI' };
    assert.equal(isLegacyPlan(daviUser.planId), true);
    const daviCaps = getUserCapabilities(daviUser);
    assert.equal(daviCaps.canUpload, true, 'Davi mantém capacidade de upload de arquivos');
    assert.equal(daviCaps.canUseSearch, false, 'Davi não possui busca de empresas incluída sem plano novo');
    assert.equal(daviCaps.isLegacy, true);

    // 4. Plano Novo (PRO)
    const proUser = { role: 'USER', planId: 'PRO' };
    const proCaps = getUserCapabilities(proUser);
    assert.equal(proCaps.canUpload, false, 'Planos novos usam exclusivamente busca integrada');
    assert.equal(proCaps.canUseSearch, true, 'Planos novos podem usar busca');
  });

  // 8. Cota de disparos idempotente por envio/ciclo (Item 8)
  await t.test('Item 8: Cota de disparos nao e debitada repetidamente em retries com mesmo dispatchKey', async () => {
    const quotaUser = await testPrisma.user.create({
      data: {
        email: `quota_user_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'START', // 1.500 disparos
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
        dispatchesUsedInCycle: 10,
        monthlyDispatchQuota: 1500
      }
    });

    const dispatchKey = `camp1_lead_${Date.now()}`;

    // 1º consumo com dispatchKey
    const firstTry = await QuotaService.tryConsumeDispatchQuota({
      userId: quotaUser.id,
      dispatchKey
    });
    assert.equal(firstTry.allowed, true);

    // Confirma transmissão
    QuotaService.confirmDispatchQuota({ userId: quotaUser.id, dispatchKey });

    // Retry do job no BullMQ com a MESMA dispatchKey
    const retryTry = await QuotaService.tryConsumeDispatchQuota({
      userId: quotaUser.id,
      dispatchKey
    });

    assert.equal(retryTry.allowed, true);
    assert.equal(retryTry.isIdempotent, true, 'Retry do BullMQ deve ser reconhecido como idempotente');

    // Liberação pós-confirmação (ex: falha no ack pós envio) não estorna a cota para proteger contra reenvio incerto
    await QuotaService.releaseDispatchQuota({ userId: quotaUser.id, dispatchKey });

    const userDb = await testPrisma.user.findUnique({ where: { id: quotaUser.id } });
    assert.equal(userDb?.dispatchesUsedInCycle, 11, 'Deve ter contabilizado estritamente 1 disparo mesmo após retries');
  });

  // 9. Deduplicação contra Resultados Já Entregues em Buscas Concluídas (Item 9)
  await t.test('Item 9: Classificacao descarta contatos ja entregues em buscas concluidas anteriores com ALREADY_DELIVERED', async () => {
    const wsUser = await testPrisma.user.create({
      data: {
        email: `dedup_ws_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
      }
    });

    const ws = await testPrisma.workspace.create({
      data: { name: 'WS Dedup', userId: wsUser.id }
    });

    // 1. Busca concluída anterior entregou o contato 5511988887777 com isUsable: true
    const pastSearch = await testPrisma.companySearch.create({
      data: {
        workspaceId: ws.id,
        userId: wsUser.id,
        query: 'Advogados',
        segment: 'Advogados',
        location: 'SP',
        requestedCount: 10,
        creditsReserved: 10,
        status: 'COMPLETED'
      }
    });

    await testPrisma.companySearchResult.create({
      data: {
        searchId: pastSearch.id,
        workspaceId: ws.id,
        name: 'Escritório Alfa',
        phone: '5511988887777',
        isUsable: true
      }
    });

    // 2. Nova busca encontra o mesmo contato de novo
    const currentSearch = await testPrisma.companySearch.create({
      data: {
        workspaceId: ws.id,
        userId: wsUser.id,
        query: 'Advogados Trabalhistas',
        segment: 'Advogados Trabalhistas',
        location: 'SP',
        requestedCount: 10,
        creditsReserved: 10,
        status: 'PENDING'
      }
    });

    setTestPlacesProvider(async () => [
      { title: 'Escritório Alfa Repetido', phone: '11988887777', website: null },
      { title: 'Escritório Novo Beta', phone: '11988889999', website: null }
    ]);

    await CompanySearchService.processSearchJob(currentSearch.id, { isLastAttempt: true });

    const results = await testPrisma.companySearchResult.findMany({
      where: { searchId: currentSearch.id },
      orderBy: { name: 'asc' }
    });

    const repeated = results.find(r => r.phone === '5511988887777');
    const novel = results.find(r => r.phone === '5511988889999');

    assert.ok(repeated);
    assert.equal(repeated.isUsable, false, 'Contato já entregue na busca anterior deve ser marcado como não aproveitável');
    assert.equal(repeated.discardReason, 'ALREADY_DELIVERED', 'Motivo de descarte deve ser ALREADY_DELIVERED para poupar créditos do cliente');

    assert.ok(novel);
    assert.equal(novel.isUsable, true, 'Contato inédito deve ser aproveitável');
  });

  // 4. Idempotência de CompanySearch (Item 4)
  await t.test('Item 4: IdempotencyKey repete a busca existente sem criar duplicatas e valida payload', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `idemp_search_${Date.now()}@test.com`,
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
      }
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

    const ws = await testPrisma.workspace.create({
      data: { name: 'WS Idemp', userId: user.id }
    });

    const key = `stable_search_key_${Date.now()}`;

    setTestPlacesProvider(async () => [
      { title: 'Padaria Modelo', phone: '11977776666', website: null }
    ]);

    // Primeira chamada
    const search1 = await CompanySearchService.initiateSearch({
      userId: user.id,
      workspaceId: ws.id,
      segment: 'Padarias',
      location: 'Centro',
      requestedCount: 10,
      idempotencyKey: key
    });

    // Segunda chamada com EXATAMENTE a mesma chave e payload
    const search2 = await CompanySearchService.initiateSearch({
      userId: user.id,
      workspaceId: ws.id,
      segment: 'Padarias',
      location: 'Centro',
      requestedCount: 10,
      idempotencyKey: key
    });

    assert.ok(search1);
    assert.ok(search2);
    assert.equal(search1!.id, search2!.id, 'Deve retornar a mesma busca sem criar outro CompanySearch');

    const searchesCount = await testPrisma.companySearch.count({
      where: { idempotencyKey: key }
    });
    assert.equal(searchesCount, 1, 'Deve existir estritamente 1 registro com essa chave de idempotência');

    // Terceira chamada com a mesma chave mas payload DIFERENTE -> Deve ser rejeitada
    await assert.rejects(
      async () => {
        await CompanySearchService.initiateSearch({
          userId: user.id,
          workspaceId: ws.id,
          segment: 'Academias', // Payload divergente!
          location: 'Centro',
          requestedCount: 10,
          idempotencyKey: key
        });
      },
      /Chave de idempotência já utilizada com parâmetros de busca diferentes/
    );
  });

  // 5. Retries da Apify e Reconciliação (Item 5)
  await t.test('Item 5: Falha na 1a tentativa do BullMQ mantem reserva PENDING para retry resiliente', async () => {
    const user = await testPrisma.user.create({
      data: {
        email: `retry_user_${Date.now()}@test.com`,
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
        monthlyBalance: 100,
        purchasedBalance: 0,
        reservedBalance: 0,
        monthlyExpiresAt: new Date(Date.now() + 30 * 86400000)
      }
    });

    const ws = await testPrisma.workspace.create({
      data: { name: 'WS Retry Test', userId: user.id }
    });

    const reservation = await CreditWalletService.reserveCredits({
      userId: user.id,
      amount: 10,
      idempotencyKey: `retry_res_${Date.now()}`,
      sourceType: 'COMPANY_SEARCH'
    }, testPrisma as any);

    const search = await testPrisma.companySearch.create({
      data: {
        workspaceId: ws.id,
        userId: user.id,
        reservationId: reservation.reservationId,
        query: 'Oficinas em SP',
        segment: 'Oficinas',
        location: 'SP',
        requestedCount: 10,
        creditsReserved: 10,
        status: 'PENDING'
      }
    });

    // Simula falha temporária do provedor externo na tentativa 1 (isLastAttempt: false)
    setTestPlacesProvider(async () => {
      throw new Error('APIFY_TIMEOUT_NETWORK_BLIP');
    });

    await assert.rejects(
      async () => {
        await CompanySearchService.processSearchJob(search.id, { isLastAttempt: false });
      },
      /APIFY_TIMEOUT_NETWORK_BLIP/
    );

    // Na 1ª tentativa com falha, a reserva NÃO pode ter sido liberada e a busca NÃO pode ser marcada FAILED!
    const resCheck1 = await testPrisma.creditReservation.findUnique({
      where: { id: reservation.reservationId }
    });
    assert.equal(resCheck1?.status, 'PENDING', 'A reserva deve continuar PENDING na 1ª tentativa para permitir retry');

    const searchCheck1 = await testPrisma.companySearch.findUnique({
      where: { id: search.id }
    });
    assert.notEqual(searchCheck1?.status, 'FAILED', 'A busca não deve ser marcada como FAILED na 1ª tentativa');

    // Na 2ª tentativa (retry do BullMQ com isLastAttempt: true), o provedor tem sucesso
    setTestPlacesProvider(async () => [
      { title: 'Auto Mecânica Silva', phone: '11966665555', website: null }
    ]);

    await CompanySearchService.processSearchJob(search.id, { isLastAttempt: true });

    // Agora sim foi concluída com sucesso e liquidada
    const searchFinal = await testPrisma.companySearch.findUnique({
      where: { id: search.id }
    });
    assert.equal(searchFinal?.status, 'COMPLETED');
    assert.equal(searchFinal?.usableCount, 1);

    const resFinal = await testPrisma.creditReservation.findUnique({
      where: { id: reservation.reservationId }
    });
    assert.equal(resFinal?.status, 'SETTLED');
  });
});
