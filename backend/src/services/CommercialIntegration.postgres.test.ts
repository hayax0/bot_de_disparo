import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma as testPrisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { processCaktoWebhook, WebhookError } from './SubscriptionManager';
import { CreditWalletService } from './CreditWalletService';
import { QuotaService } from './QuotaService';

/**
 * Validação de segurança estrita antes de qualquer TRUNCATE.
 * Garante conexão exclusiva com 'bot_prospeccao_test' no PostgreSQL real.
 */
async function assertConnectedToTestDatabase(client: typeof testPrisma): Promise<string> {
  const result = await client.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  const connectedDb = result[0]?.current_database || '';
  if (connectedDb !== 'bot_prospeccao_test') {
    throw new Error(
      `[SEGURANÇA BLOQUEADA] Conexão ativa em "${connectedDb}". ` +
      `Testes de integração exigem o banco "bot_prospeccao_test".`
    );
  }
  return connectedDb;
}

test('CommercialIntegration PostgreSQL: Validacao dos 4 Bloqueadores no Banco Real', async (t) => {
  await assertConnectedToTestDatabase(testPrisma);

  const testWebhookSecret = 'cakto_test_secret_commercial_2026';
  const originalSecret = ENV.CAKTO_WEBHOOK_SECRET;
  ENV.CAKTO_WEBHOOK_SECRET = testWebhookSecret;

  t.after(async () => {
    ENV.CAKTO_WEBHOOK_SECRET = originalSecret;
    await testPrisma.$disconnect();
  });

  // Limpeza de tabelas antes de iniciar a suíte
  const cleanDatabase = async () => {
    await testPrisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "WebhookLog",
        "CreditTransaction",
        "CreditPurchaseOrder",
        "CreditReservation",
        "CreditWallet",
        "SubscriptionNotification",
        "DispatchReservation",
        "DispatchHistory",
        "Lead",
        "Campaign",
        "Workspace",
        "User"
      CASCADE;
    `);
  };

  await cleanDatabase();

  // =========================================================================
  // BLOQUEADOR 1: Transação de pagamento atômica e ausência de timeout P2028
  // =========================================================================
  await t.test('Bloqueador 1: Ativação para usuário existente e novo roda na mesma transação atômica sem P2028', async () => {
    await cleanDatabase();

    // 1.1 Usuário existente com disparos já usados no ciclo
    const existingUser = await testPrisma.user.create({
      data: {
        email: 'atomic_existing@test.local',
        name: 'Usuário Atômico',
        password: 'hash',
        role: 'USER',
        planId: 'START',
        subscriptionStatus: 'ACTIVE',
        monthlyDispatchQuota: 1000,
        dispatchesUsedInCycle: 85,
        workspaces: {
          create: { name: 'Empresa Atômica' }
        }
      }
    });

    const approvedPlanPayload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_plan_approved_1',
      data: {
        id: 'tx_plan_approved_1',
        offer_id: '1165278', // Plano PRO (3.000 disparos, 150 créditos)
        product: { offer_id: '1165278', code: '9gwgit3' },
        customer: { email: 'atomic_existing@test.local', name: 'Usuário Atômico' }
      }
    };

    const startTime = Date.now();
    const resultExisting = await processCaktoWebhook(approvedPlanPayload);
    const elapsedMs = Date.now() - startTime;

    assert.equal(resultExisting.success, true);
    assert.ok(elapsedMs < 5000, `Processamento deve ser rápido e sem lock timeout de 20s (levou ${elapsedMs}ms)`);

    // Validação de estado confirmado no banco
    const userAfter = await testPrisma.user.findUniqueOrThrow({ where: { id: existingUser.id } });
    assert.equal(userAfter.planId, 'PRO');
    assert.equal(userAfter.monthlyDispatchQuota, 3000);
    assert.equal(userAfter.dispatchesUsedInCycle, 0, 'Contador de disparos do ciclo deve ser resetado atomicamente');

    const walletAfter = await testPrisma.creditWallet.findUnique({ where: { userId: existingUser.id } });
    assert.equal(walletAfter?.monthlyBalance, 150, 'Créditos mensais do plano PRO devem ser 150');

    const txs = await testPrisma.creditTransaction.findMany({ where: { userId: existingUser.id } });
    assert.equal(txs.length, 1);
    assert.equal(txs[0].type, 'MONTHLY_GRANT');

    const webhookLogs = await testPrisma.webhookLog.findMany({ where: { email: 'atomic_existing@test.local' } });
    assert.equal(webhookLogs.length, 1);

    // 1.2 Ativação para novo usuário
    const newUserPayload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_new_user_1',
      data: {
        id: 'tx_new_user_1',
        offer_id: '1165260', // Plano START (1.000 disparos, 50 créditos)
        customer: { email: 'atomic_new@test.local', name: 'Novo Cliente' }
      }
    };

    const resultNew = await processCaktoWebhook(newUserPayload);
    assert.equal(resultNew.success, true);

    const newUser = await testPrisma.user.findUniqueOrThrow({ where: { email: 'atomic_new@test.local' } });
    assert.equal(newUser.planId, 'START');
    assert.equal(newUser.monthlyDispatchQuota, 1000);
    assert.equal(newUser.dispatchesUsedInCycle, 0);

    const newWallet = await testPrisma.creditWallet.findUnique({ where: { userId: newUser.id } });
    assert.equal(newWallet?.monthlyBalance, 50);

    // 1.3 Renovação de plano existente
    const renewPayload = {
      secret: testWebhookSecret,
      event: 'subscription_renewed',
      event_id: 'evt_renew_1',
      data: {
        id: 'tx_renew_1',
        offer_id: '1165278', // PRO
        customer: { email: 'atomic_existing@test.local' }
      }
    };

    // Altera disparos para testar o reset na renovação
    await testPrisma.user.update({
      where: { id: existingUser.id },
      data: { dispatchesUsedInCycle: 120 }
    });

    const resultRenew = await processCaktoWebhook(renewPayload);
    assert.equal(resultRenew.success, true);

    const userRenewed = await testPrisma.user.findUniqueOrThrow({ where: { id: existingUser.id } });
    assert.equal(userRenewed.dispatchesUsedInCycle, 0, 'Renovação deve resetar contador de disparos na mesma transação');
    assert.equal(userRenewed.caktoOrderId, 'tx_renew_1');
  });

  await t.test('Bloqueador 1 (Falha Injetada): Rollback total sem alteração parcial no PostgreSQL real', async () => {
    await cleanDatabase();

    const initialUser = await testPrisma.user.create({
      data: {
        email: 'rollback_test@test.local',
        name: 'Cliente Rollback',
        password: 'hash',
        role: 'USER',
        planId: 'START',
        subscriptionStatus: 'INACTIVE',
        monthlyDispatchQuota: 1000,
        dispatchesUsedInCycle: 42,
        workspaces: {
          create: { name: 'Rollback Workspace' }
        }
      }
    });

    // Carteira inicial zerada
    await testPrisma.creditWallet.create({
      data: {
        userId: initialUser.id,
        monthlyBalance: 0,
        purchasedBalance: 0,
        reservedBalance: 0
      }
    });

    // Injeta falha temporária em QuotaService.resetCycleDispatches para validar que nada é commitado
    const originalReset = QuotaService.resetCycleDispatches;
    (QuotaService as any).resetCycleDispatches = async () => {
      throw new Error('Falha simulada injetada durante a transação atômica');
    };

    const payload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_rollback_1',
      data: {
        id: 'tx_rollback_1',
        offer_id: '1165278', // PRO
        customer: { email: 'rollback_test@test.local' }
      }
    };

    try {
      await assert.rejects(
        processCaktoWebhook(payload),
        /Falha simulada injetada durante a transação atômica/
      );
    } finally {
      QuotaService.resetCycleDispatches = originalReset;
    }

    // Validação estrita de que NENHUMA alteração parcial permaneceu no PostgreSQL real:
    const userAfter = await testPrisma.user.findUniqueOrThrow({ where: { id: initialUser.id } });
    assert.equal(userAfter.subscriptionStatus, 'INACTIVE', 'Status do usuário não pode ter sido ativado');
    assert.equal(userAfter.planId, 'START', 'PlanId não pode ter sido alterado');
    assert.equal(userAfter.dispatchesUsedInCycle, 42, 'Contador de disparos NÃO pode ter sido zerado fora da transação!');

    const walletAfter = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: initialUser.id } });
    assert.equal(walletAfter.monthlyBalance, 0, 'Nenhum crédito mensal pode ter sido concedido');

    const txs = await testPrisma.creditTransaction.findMany({ where: { userId: initialUser.id } });
    assert.equal(txs.length, 0, 'Nenhuma transação financeira pode permanecer no banco');

    const logs = await testPrisma.webhookLog.findMany({ where: { email: 'rollback_test@test.local' } });
    assert.equal(logs.length, 0, 'WebhookLog deve sofrer rollback junto com a transação');
  });

  // =========================================================================
  // BLOQUEADOR 2: Uma mesma compra NÃO pode conceder créditos duas vezes
  // =========================================================================
  await t.test('Bloqueador 2: Identificador financeiro estável por transactionId impede concessão duplicada (sequencial e concorrente)', async () => {
    await cleanDatabase();

    const user = await testPrisma.user.create({
      data: {
        email: 'idempotent_buyer@test.local',
        name: 'Comprador Fiel',
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        workspaces: {
          create: { name: 'Workspace Fiel' }
        }
      }
    });

    // 2.1 Repetição sequencial com event_id DIFERENTES para o mesmo data.id (compra de 100 créditos)
    const webhookA = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'cakto_event_alpha_111',
      data: {
        id: 'tx_stable_order_100', // transactionId estável
        offer_id: '1165355', // PACKAGE_SMALL (100 créditos)
        customer: { email: 'idempotent_buyer@test.local' }
      }
    };

    const webhookB = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'cakto_event_beta_222', // event_id diferente!
      data: {
        id: 'tx_stable_order_100', // mesmo transactionId estável!
        offer_id: '1165355',
        customer: { email: 'idempotent_buyer@test.local' }
      }
    };

    const res1 = await processCaktoWebhook(webhookA);
    assert.equal(res1.success, true);

    const res2 = await processCaktoWebhook(webhookB);
    assert.equal(res2.success, true);

    // Saldo no banco deve ser ESTRITAMENTE 100 créditos (NÃO 200!)
    const wallet = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(wallet.purchasedBalance, 100, 'Saldo comprado deve ser exatamente 100 créditos');

    // Pedidos de compra no banco: ESTRITAMENTE 1 pedido
    const orders = await testPrisma.creditPurchaseOrder.findMany({ where: { userId: user.id } });
    assert.equal(orders.length, 1, 'Deve existir exatamente 1 CreditPurchaseOrder para a transação');
    assert.equal(orders[0].credits, 100);
    assert.equal(orders[0].status, 'PAID');

    // Transações financeiras: ESTRITAMENTE 1 transação de concessão
    const txs = await testPrisma.creditTransaction.findMany({ where: { userId: user.id } });
    assert.equal(txs.length, 1, 'Deve existir exatamente 1 CreditTransaction');
    assert.equal(txs[0].amount, 100);

    // 2.2 Concorrência estrita: 2 chamadas simultâneas com Promise.all para a mesma recarga
    const concurrentA = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'conc_evt_1',
      data: {
        id: 'tx_concurrent_order_300',
        offer_id: '1165367', // PACKAGE_MEDIUM (300 créditos)
        customer: { email: 'idempotent_buyer@test.local' }
      }
    };

    const concurrentB = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'conc_evt_2',
      data: {
        id: 'tx_concurrent_order_300',
        offer_id: '1165367', // PACKAGE_MEDIUM (300 créditos)
        customer: { email: 'idempotent_buyer@test.local' }
      }
    };

    const [cRes1, cRes2] = await Promise.all([
      processCaktoWebhook(concurrentA),
      processCaktoWebhook(concurrentB)
    ]);

    assert.equal(cRes1.success, true);
    assert.equal(cRes2.success, true);

    const walletAfterConcurrent = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } });
    // 100 da primeira compra + 300 da segunda = 400 total
    assert.equal(walletAfterConcurrent.purchasedBalance, 400, 'Saldo concorrente não pode duplicar para 700');

    // 2.3 Rejeição de compra sem transactionId suficiente
    const noTxIdPayload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_no_tx_id',
      data: {
        offer_id: '1165355',
        customer: { email: 'idempotent_buyer@test.local' }
      }
    };
    await assert.rejects(processCaktoWebhook(noTxIdPayload), (err: any) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /identificador da transação/i);
      return true;
    });
  });

  // =========================================================================
  // BLOQUEADOR 3: Reembolso de recarga preserva assinatura e estorna créditos
  // =========================================================================
  await t.test('Bloqueador 3: Reembolso de recarga estorna créditos e atualiza pedido sem cancelar a assinatura', async () => {
    await cleanDatabase();

    const expiresFuture = new Date(Date.now() + 25 * 86400000);

    const subscriber = await testPrisma.user.create({
      data: {
        email: 'subscriber_recarga@test.local',
        name: 'Assinante Ativo',
        password: 'hash',
        role: 'USER',
        planId: 'PRO',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: expiresFuture,
        monthlyDispatchQuota: 3000,
        dispatchesUsedInCycle: 10,
        caktoSubscriptionId: 'sub_pro_123',
        workspaces: {
          create: { name: 'Assinante Workspace' }
        }
      }
    });

    // 1. Assinante compra uma recarga de 100 créditos
    const buyPackagePayload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_pkg_buy_1',
      data: {
        id: 'tx_recarga_to_refund',
        offer_id: '1165355', // PACKAGE_SMALL (100 créditos)
        amount: 9.99,
        customer: { email: 'subscriber_recarga@test.local' }
      }
    };

    await processCaktoWebhook(buyPackagePayload);

    let wallet = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: subscriber.id } });
    assert.equal(wallet.purchasedBalance, 100);

    let order = await testPrisma.creditPurchaseOrder.findFirstOrThrow({
      where: { caktoOrderId: 'tx_recarga_to_refund' }
    });
    assert.equal(order.status, 'PAID');

    // 2. Recebe webhook de reembolso da recarga (purchase_refunded)
    const refundPackagePayload = {
      secret: testWebhookSecret,
      event: 'purchase_refunded',
      event_id: 'evt_pkg_refund_1',
      data: {
        id: 'tx_recarga_to_refund',
        offer_id: '1165355',
        customer: { email: 'subscriber_recarga@test.local' }
      }
    };

    const refundRes = await processCaktoWebhook(refundPackagePayload);
    assert.equal(refundRes.success, true);

    // Validações cruciais no PostgreSQL Real:
    // A) A assinatura NÃO PODE ser cancelada! Deve continuar ACTIVE com o mesmo vencimento!
    const userAfterRefund = await testPrisma.user.findUniqueOrThrow({ where: { id: subscriber.id } });
    assert.equal(userAfterRefund.subscriptionStatus, 'ACTIVE', 'Assinatura deve permanecer ACTIVE!');
    assert.equal(
      userAfterRefund.subscriptionExpiresAt?.getTime(),
      expiresFuture.getTime(),
      'Data de expiração da assinatura não pode ter sido revogada!'
    );

    // B) O pedido da recarga deve estar REFUNDED
    const orderAfterRefund = await testPrisma.creditPurchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(orderAfterRefund.status, 'REFUNDED', 'CreditPurchaseOrder deve estar REFUNDED');
    assert.ok(orderAfterRefund.refundedAt, 'Deve possuir refundedAt preenchido');

    // C) Os créditos comprados devem ter sido estornados
    const walletAfterRefund = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: subscriber.id } });
    assert.equal(walletAfterRefund.purchasedBalance, 0, 'Créditos comprados devem voltar para 0');

    // D) Transação de auditoria REFUND_REVOCATION registrada
    const refundTx = await testPrisma.creditTransaction.findFirst({
      where: {
        userId: subscriber.id,
        type: 'REFUND_REVOCATION'
      }
    });
    assert.ok(refundTx, 'Deve existir registro de transação REFUND_REVOCATION');
    assert.equal(refundTx?.amount, -100);

    // 3. Reembolso com créditos já consumidos: não corrompe saldo para negativo
    // Simula nova compra de 100 créditos
    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_pkg_buy_partial',
      data: {
        id: 'tx_pkg_partial_spend',
        offer_id: '1165355',
        customer: { email: 'subscriber_recarga@test.local' }
      }
    });

    // Consome 40 créditos comprados via fluxo real de reserva e liquidação
    const reserve = await CreditWalletService.reserveCredits({
      userId: subscriber.id,
      amount: 40,
      sourceType: 'AI_ASSISTANT',
      idempotencyKey: 'consume_for_refund_test',
      description: 'Geração de copy'
    });
    await CreditWalletService.settleReservation({
      reservationId: reserve.reservationId,
      actualConsumedAmount: 40
    });

    const walletBeforePartialRefund = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: subscriber.id } });
    assert.equal(walletBeforePartialRefund.purchasedBalance, 60, 'Saldo deve ser 60 após consumir 40');

    // Recebe reembolso dos 100 créditos
    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'purchase_refunded',
      event_id: 'evt_pkg_refund_partial',
      data: {
        id: 'tx_pkg_partial_spend',
        offer_id: '1165355',
        customer: { email: 'subscriber_recarga@test.local' }
      }
    });

    const walletAfterPartialRefund = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: subscriber.id } });
    assert.equal(walletAfterPartialRefund.purchasedBalance, 0, 'Saldo estornado não pode ficar negativo (-40), deve zerar em 0');

    // 4. Reembolso repetido: idempotente
    const repeatRes = await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'purchase_refunded',
      event_id: 'evt_pkg_refund_repeat',
      data: {
        id: 'tx_pkg_partial_spend',
        offer_id: '1165355',
        customer: { email: 'subscriber_recarga@test.local' }
      }
    });
    assert.equal(repeatRes.success, true);
  });

  // =========================================================================
  // BLOQUEADOR 4: Identificação estrita de produtos por ID exato sem substrings
  // =========================================================================
  await t.test('Bloqueador 4: Produtos desconhecidos ou com substring no nome não concedem benefícios e são rejeitados', async () => {
    await cleanDatabase();

    // 4.1 "Produto desconhecido" contendo substring "pro"
    const unknownProPayload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_unk_pro',
      data: {
        id: 'tx_unk_pro',
        product: { name: 'Produto desconhecido' },
        customer: { email: 'victim_pro@test.local' }
      }
    };

    await assert.rejects(processCaktoWebhook(unknownProPayload), (err: any) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /produto não reconhecido/i);
      return true;
    });

    // Nenhum usuário foi criado
    const userPro = await testPrisma.user.findUnique({ where: { email: 'victim_pro@test.local' } });
    assert.equal(userPro, null, 'Nenhum usuário deve ser criado para produto desconhecido');

    // 4.2 "1000 disparos mensais" sem ID oficial de pacote
    const unknown1000Payload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_unk_1000',
      data: {
        id: 'tx_unk_1000',
        product: { name: '1000 disparos mensais' },
        customer: { email: 'victim_1000@test.local' }
      }
    };

    await assert.rejects(processCaktoWebhook(unknown1000Payload), (err: any) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /produto não reconhecido/i);
      return true;
    });

    // 4.3 Produto Legado Davi identificado por configuração explícita (1080517 / at474et)
    const legacyPayload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_legacy_davi_1',
      data: {
        id: 'tx_legacy_davi_1',
        offer_id: '1080517',
        offer: { code: 'at474et' },
        customer: { email: 'legacy_client@test.local', name: 'Cliente Legado Davi' }
      }
    };

    const legacyRes = await processCaktoWebhook(legacyPayload);
    assert.equal(legacyRes.success, true);

    const legacyUser = await testPrisma.user.findUniqueOrThrow({ where: { email: 'legacy_client@test.local' } });
    assert.equal(legacyUser.planId, 'LEGACY_DAVI', 'Produto com ID 1080517 deve ser ativado como LEGACY_DAVI');
    assert.equal(legacyUser.subscriptionStatus, 'ACTIVE');

    // QuotaService confirma que cliente legado tem permissão irrestrita
    const quotaCheck = await QuotaService.canDispatch(legacyUser);
    assert.equal(quotaCheck.allowed, true);
    assert.equal(quotaCheck.isUnlimited, true);
  });

  // =========================================================================
  // BLOQUEADOR 1 REFINADO: Idempotência Estrita de Renovação
  // =========================================================================
  await t.test('Bloqueador 1 (Idempotência Estrita de Renovação): Mesmo pagamento em aprovação e renovação não zera disparos, não repõe créditos e não prolonga validade', async () => {
    await cleanDatabase();

    // 1. Cliente compra plano PRO
    const user = await testPrisma.user.create({
      data: {
        email: 'renew_idempotent@test.local',
        name: 'Cliente Renovação',
        password: 'hash',
        role: 'USER',
        subscriptionStatus: 'INACTIVE',
        workspaces: { create: { name: 'Workspace Renovação' } }
      }
    });

    const txIdInitial = 'tx_plan_cycle_pay_100';

    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_initial_approved',
      data: {
        id: txIdInitial,
        offer_id: '1165278', // PRO (3.000 disparos, 150 créditos)
        customer: { email: 'renew_idempotent@test.local' }
      }
    });

    const userAfterInitial = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const initialExpiresAt = userAfterInitial.subscriptionExpiresAt!;
    assert.equal(userAfterInitial.planId, 'PRO');
    assert.equal(userAfterInitial.dispatchesUsedInCycle, 0);

    let wallet = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(wallet.monthlyBalance, 150);

    // 2. Usuário utiliza 45 disparos e gasta 20 créditos
    await testPrisma.user.update({
      where: { id: user.id },
      data: { dispatchesUsedInCycle: 45 }
    });
    await testPrisma.creditWallet.update({
      where: { userId: user.id },
      data: { monthlyBalance: 130 }
    });

    // 3. Chega webhook subscription_renewed com o MESMO identificador de pagamento (tx_plan_cycle_pay_100)
    const duplicateRenewRes = await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'subscription_renewed',
      event_id: 'evt_renew_same_payment',
      data: {
        id: txIdInitial, // MESMO pagamento!
        offer_id: '1165278',
        customer: { email: 'renew_idempotent@test.local' }
      }
    });
    assert.equal(duplicateRenewRes.success, true);

    // Estado do banco DEVE SER PRESERVADO:
    const userAfterDup = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(userAfterDup.dispatchesUsedInCycle, 45, 'Disparos usados NÃO podem ter sido zerados!');
    assert.equal(userAfterDup.subscriptionExpiresAt?.getTime(), initialExpiresAt.getTime(), 'Validade NÃO pode ter sido prolongada!');

    const walletAfterDup = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(walletAfterDup.monthlyBalance, 130, 'Saldo mensal NÃO pode ter sido reposto!');

    // 4. Reentrega com outro event_id para o mesmo pagamento:
    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'subscription_renewed',
      event_id: 'evt_renew_redelivery_999',
      data: {
        id: txIdInitial,
        offer_id: '1165278',
        customer: { email: 'renew_idempotent@test.local' }
      }
    });

    const userAfterRedelivery = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(userAfterRedelivery.subscriptionExpiresAt?.getTime(), initialExpiresAt.getTime(), 'Reentrega não pode empurrar a validade!');

    // 5. Renovação com NOVO pagamento real (tx_plan_cycle_pay_200):
    const newCycleTxId = 'tx_plan_cycle_pay_200';
    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'subscription_renewed',
      event_id: 'evt_new_month_approved',
      data: {
        id: newCycleTxId,
        offer_id: '1165278',
        customer: { email: 'renew_idempotent@test.local' }
      }
    });

    const userAfterNewMonth = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(userAfterNewMonth.subscriptionExpiresAt!.getTime() > initialExpiresAt.getTime(), 'Novo pagamento DEVE prolongar a validade para o novo ciclo');
    assert.equal(userAfterNewMonth.dispatchesUsedInCycle, 0, 'Novo ciclo deve zerar os disparos');

    const walletAfterNewMonth = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(walletAfterNewMonth.monthlyBalance, 150, 'Novo ciclo deve conceder os novos créditos mensais');

    // 6. Teste de renovação no Plano Legado (LEGACY_DAVI): não depende de créditos de IA
    const legacyUser = await testPrisma.user.create({
      data: {
        email: 'legacy_renew_idempotent@test.local',
        name: 'Davi Legado Renovação',
        password: 'hash',
        role: 'USER',
        planId: 'LEGACY_DAVI',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: initialExpiresAt,
        monthlyDispatchQuota: 0,
        workspaces: { create: { name: 'Davi Workspace' } }
      }
    });

    const legacyTxId = 'tx_legacy_pay_cycle_1';
    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'subscription_renewed',
      event_id: 'evt_legacy_renew_1',
      data: {
        id: legacyTxId,
        offer_id: '1080517',
        customer: { email: 'legacy_renew_idempotent@test.local' }
      }
    });

    const legAfter1 = await testPrisma.user.findUniqueOrThrow({ where: { id: legacyUser.id } });
    const legRenewedAt = legAfter1.subscriptionExpiresAt!;
    assert.ok(legRenewedAt.getTime() > initialExpiresAt.getTime());

    // Reentrega do mesmo pagamento legado
    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'subscription_renewed',
      event_id: 'evt_legacy_renew_redelivery',
      data: {
        id: legacyTxId,
        offer_id: '1080517',
        customer: { email: 'legacy_renew_idempotent@test.local' }
      }
    });

    const legAfterRedelivery = await testPrisma.user.findUniqueOrThrow({ where: { id: legacyUser.id } });
    assert.equal(legAfterRedelivery.subscriptionExpiresAt?.getTime(), legRenewedAt.getTime(), 'Reentrega de renovação legada não pode prolongar validade!');
  });

  // =========================================================================
  // BLOQUEADOR 2 REFINADO: Regressão de Estado Financeiro e Reembolso Antecipado
  // =========================================================================
  await t.test('Bloqueador 2 (Regressão de Estado Financeiro): Aprovação atrasada não reabre pedido reembolsado e reembolso antecipado não desconta créditos', async () => {
    await cleanDatabase();

    const buyer = await testPrisma.user.create({
      data: {
        email: 'reopen_test@test.local',
        name: 'Comprador Reabertura',
        password: 'hash',
        role: 'USER',
        subscriptionStatus: 'ACTIVE',
        workspaces: { create: { name: 'Workspace Reabertura' } }
      }
    });

    const rechargeTxId = 'tx_recharge_delayed_approval';

    // 1. Aprova compra de recarga de 100 créditos
    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_recharge_app_1',
      data: {
        id: rechargeTxId,
        offer_id: '1165355',
        customer: { email: 'reopen_test@test.local' }
      }
    });

    let order = await testPrisma.creditPurchaseOrder.findFirstOrThrow({ where: { caktoOrderId: rechargeTxId } });
    assert.equal(order.status, 'PAID');

    let wallet = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: buyer.id } });
    assert.equal(wallet.purchasedBalance, 100);

    // 2. Reembolsa a recarga
    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'purchase_refunded',
      event_id: 'evt_recharge_ref_1',
      data: {
        id: rechargeTxId,
        offer_id: '1165355',
        customer: { email: 'reopen_test@test.local' }
      }
    });

    order = await testPrisma.creditPurchaseOrder.findFirstOrThrow({ where: { caktoOrderId: rechargeTxId } });
    assert.equal(order.status, 'REFUNDED');
    const refundedAtInitial = order.refundedAt;
    assert.ok(refundedAtInitial);

    wallet = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: buyer.id } });
    assert.equal(wallet.purchasedBalance, 0);

    // 3. Chega aprovação atrasada com outro event_id para o mesmo pedido já reembolsado
    const delayedRes = await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_recharge_delayed_redelivery',
      data: {
        id: rechargeTxId,
        offer_id: '1165355',
        customer: { email: 'reopen_test@test.local' }
      }
    });
    assert.equal(delayedRes.success, true);

    // Pedido NÃO PODE ter regredido para PAID e créditos NÃO PODEM ter sido concedidos:
    const orderAfterDelayed = await testPrisma.creditPurchaseOrder.findFirstOrThrow({ where: { caktoOrderId: rechargeTxId } });
    assert.equal(orderAfterDelayed.status, 'REFUNDED', 'Pedido reembolsado não pode voltar para PAID!');
    assert.equal(orderAfterDelayed.refundedAt?.getTime(), refundedAtInitial?.getTime(), 'refundedAt deve ser preservado');

    const walletAfterDelayed = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: buyer.id } });
    assert.equal(walletAfterDelayed.purchasedBalance, 0, 'Nenhum crédito pode ser concedido por aprovação atrasada!');

    // 4. Reembolso recebido ANTES da aprovação:
    const earlyTxId = 'tx_early_refund_order_999';
    // Dá 50 créditos comprados prévios legítimos de outra compra
    await testPrisma.creditWallet.update({
      where: { userId: buyer.id },
      data: { purchasedBalance: 50 }
    });

    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'purchase_refunded',
      event_id: 'evt_early_refund_1',
      data: {
        id: earlyTxId,
        offer_id: '1165355', // 100 créditos
        customer: { email: 'reopen_test@test.local' }
      }
    });

    // O pedido antecipado deve ser criado como REFUNDED
    const earlyOrder = await testPrisma.creditPurchaseOrder.findFirstOrThrow({ where: { caktoOrderId: earlyTxId } });
    assert.equal(earlyOrder.status, 'REFUNDED');
    assert.equal(earlyOrder.paidAt, null);

    // Saldo comprado prévio de 50 NÃO pode ter sido descontado (porque a compra nunca fora aprovada):
    const walletAfterEarlyRefund = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: buyer.id } });
    assert.equal(walletAfterEarlyRefund.purchasedBalance, 50, 'Créditos de outras compras legítimas NÃO podem ser descontados por reembolso antecipado!');

    // Quando a aprovação atrasada de earlyTxId chega depois:
    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_late_app_for_early_refund',
      data: {
        id: earlyTxId,
        offer_id: '1165355',
        customer: { email: 'reopen_test@test.local' }
      }
    });

    const walletAfterLateApp = await testPrisma.creditWallet.findUniqueOrThrow({ where: { userId: buyer.id } });
    assert.equal(walletAfterLateApp.purchasedBalance, 50, 'Aprovação atrasada deve ser ignorada e não conceder créditos!');
  });

  // =========================================================================
  // BLOQUEADOR 3 REFINADO: Proteção Incondicional de Contas Legadas e ADMIN
  // =========================================================================
  await t.test('Bloqueador 3 (Proteção de Contas Legadas): Novo produto não sobrescreve plano legado nem impõe cotas', async () => {
    await cleanDatabase();

    const initialExpires = new Date(Date.now() + 30 * 86400000);

    // 1. Cria usuário sintético LEGACY_DAVI
    const daviUser = await testPrisma.user.create({
      data: {
        email: 'davi_synthetic@test.local',
        name: 'Davi Sintético',
        password: 'hash',
        role: 'USER',
        planId: 'LEGACY_DAVI',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: initialExpires,
        monthlyDispatchQuota: 0,
        dispatchesUsedInCycle: 120,
        workspaces: { create: { name: 'Davi Workspace' } }
      }
    });

    // 2. Recebe webhook purchase_approved de um novo plano comercial (START - 1.000 disparos)
    const newPlanPayload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_davi_new_plan_attempt',
      data: {
        id: 'tx_davi_new_plan_attempt',
        offer_id: '1165260', // START
        customer: { email: 'davi_synthetic@test.local' }
      }
    };

    const attemptRes = await processCaktoWebhook(newPlanPayload);
    assert.equal(attemptRes.success, true);

    // Validação estrita: Davi NÃO foi convertido para START!
    const daviAfter = await testPrisma.user.findUniqueOrThrow({ where: { id: daviUser.id } });
    assert.equal(daviAfter.planId, 'LEGACY_DAVI', 'Plano legado do Davi NÃO pode ser sobrescrito!');
    assert.equal(daviAfter.monthlyDispatchQuota, 0, 'Davi mantém cota 0 (sem limites comerciais)!');
    assert.equal(daviAfter.dispatchesUsedInCycle, 120, 'Contador de disparos do Davi não foi afetado');

    // Carteira não recebeu créditos de novo plano
    const daviWallet = await testPrisma.creditWallet.findUnique({ where: { userId: daviUser.id } });
    assert.equal(daviWallet?.monthlyBalance || 0, 0, 'Davi não recebe créditos de plano novo');

    // 3. Proteção de ADMIN VIP
    const adminUser = await testPrisma.user.create({
      data: {
        email: 'admin_vip@test.local',
        name: 'Admin VIP',
        password: 'hash',
        role: 'ADMIN',
        subscriptionStatus: 'LIFETIME',
        monthlyDispatchQuota: 0,
        workspaces: { create: { name: 'Admin Workspace' } }
      }
    });

    await processCaktoWebhook({
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_admin_buy_plan',
      data: {
        id: 'tx_admin_buy_plan',
        offer_id: '1165278', // PRO
        customer: { email: 'admin_vip@test.local' }
      }
    });

    const adminAfter = await testPrisma.user.findUniqueOrThrow({ where: { id: adminUser.id } });
    assert.equal(adminAfter.role, 'ADMIN');
    assert.equal(adminAfter.subscriptionStatus, 'LIFETIME');
    assert.equal(adminAfter.monthlyDispatchQuota, 0);
  });

  // =========================================================================
  // BLOQUEADOR 4 REFINADO: Consistência de Identificadores e Domínios
  // =========================================================================
  await t.test('Bloqueador 4 (Consistência de Identificadores): Conflito entre offer_id e offer_code ou URLs fora do domínio são rejeitados', async () => {
    await cleanDatabase();

    // 1. Conflito entre offer_id (recarga 100) e offer_code (PRO):
    const conflictingPayload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_conflict_1',
      data: {
        id: 'tx_conflict_1',
        offer_id: '1165355', // PACKAGE_SMALL (100 créditos)
        offer_code: '9gwgit3', // PRO (plano)
        customer: { email: 'conflict_victim@test.local' }
      }
    };

    await assert.rejects(processCaktoWebhook(conflictingPayload), (err: any) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /produto não reconhecido/i);
      return true;
    });

    // 2. Domínio malicioso/externo em checkout_url:
    const fakeDomainPayload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_fake_domain',
      data: {
        id: 'tx_fake_domain',
        checkout_url: 'https://attacker-cakto.com/9gwgit3_1165278',
        customer: { email: 'fake_domain@test.local' }
      }
    };

    await assert.rejects(processCaktoWebhook(fakeDomainPayload), (err: any) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /produto não reconhecido/i);
      return true;
    });

    // 3. Conflito entre offer_id e checkout_url:
    const urlMismatchPayload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_url_mismatch',
      data: {
        id: 'tx_url_mismatch',
        offer_id: '1165278', // PRO
        checkout_url: 'https://pay.cakto.com.br/3ejxmar_1165260', // START
        customer: { email: 'url_mismatch@test.local' }
      }
    };

    await assert.rejects(processCaktoWebhook(urlMismatchPayload), (err: any) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /produto não reconhecido/i);
      return true;
    });

    // 4. Identificadores consistentes e unânimes são aprovados normalmente:
    const consistentPayload = {
      secret: testWebhookSecret,
      event: 'purchase_approved',
      event_id: 'evt_consistent_1',
      data: {
        id: 'tx_consistent_pro_ok',
        offer_id: '1165278',
        offer_code: '9gwgit3',
        checkout_url: 'https://pay.cakto.com.br/9gwgit3_1165278',
        customer: { email: 'consistent_buyer@test.local', name: 'Comprador Consistente' }
      }
    };

    const okRes = await processCaktoWebhook(consistentPayload);
    assert.equal(okRes.success, true);

    const buyer = await testPrisma.user.findUniqueOrThrow({ where: { email: 'consistent_buyer@test.local' } });
    assert.equal(buyer.planId, 'PRO');
    assert.equal(buyer.subscriptionStatus, 'ACTIVE');
  });
});

