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
});
