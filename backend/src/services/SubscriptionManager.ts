import { prisma, prisma as notificationDb } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { ENV } from '../config/env';
import { EmailService } from './EmailService';
import { resolveCommercialItem, getPlanById, isLegacyPlan, CommercialResolution } from '../config/plans';
import { CreditWalletService } from './CreditWalletService';
import { QuotaService } from './QuotaService';

export interface CaktoWebhookPayload {
  secret?: string;
  token?: string;
  webhook_secret?: string;
  event: string;
  data?: Array<any> | Record<string, any>;
  [key: string]: any;
}


// O e-mail identifica o cliente, não o contrato. Eventos de outro plano/contrato
// não podem cancelar, estornar ou notificar a assinatura atualmente vinculada.
function belongsToCurrentSubscription(
  user: { planId?: string | null; caktoSubscriptionId?: string | null },
  commercial: CommercialResolution,
  subscriptionId?: string,
): boolean {
  if (subscriptionId && user.caktoSubscriptionId && subscriptionId !== user.caktoSubscriptionId) return false;
  if (commercial.type === 'PLAN') return !user.planId || commercial.plan?.id === user.planId;
  if (commercial.type === 'LEGACY') {
    return !user.planId || isLegacyPlan(user.planId) ||
      (user.planId === 'PRO' && Boolean(subscriptionId && subscriptionId === user.caktoSubscriptionId));
  }
  return false;
}

export function isUserAdmin(email: string): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return ENV.ADMIN_EMAILS.includes(clean);
}

/**
 * Validação de acesso por assinatura:
 * 1. Administradores e VIPs com role ADMIN / LIFETIME persistidos têm acesso irrestrito.
 * 2. Clientes comuns: Devem ter status ACTIVE ou CANCELED, e subscriptionExpiresAt estritamente no futuro.
 *    Nota de Negócio: Clientes que cancelaram mantêm acesso até o fim do período já pago.
 * 3. Status INACTIVE, PAST_DUE ou data de expiração no passado resultam em acesso bloqueado (false).
 */
export function isSubscriptionActive(user: {
  email?: string | null;
  role?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: Date | null;
}): boolean {
  if (!user) return false;

  // 1. VIP / Administradores: Acesso vitalício incondicional
  if (
    user.role === 'ADMIN' ||
    user.subscriptionStatus === 'LIFETIME'
  ) {
    return true;
  }

  // 2. Clientes comuns: ACTIVE ou CANCELED enquanto estiver dentro do período pago
  if (user.subscriptionStatus === 'ACTIVE' || user.subscriptionStatus === 'CANCELED') {
    if (!user.subscriptionExpiresAt) return false;
    return new Date(user.subscriptionExpiresAt).getTime() > Date.now();
  }

  // Qualquer outro caso é bloqueado
  return false;
}

/**
 * Calcula a duração real do acesso com base nos dados da Cakto.
 * Nunca hard-coda 30 dias fixos; suporta mensal, trimestral, semestral, anual ou datas exatas.
 */
export function calculateSubscriptionPeriod(
  item: any,
  now: Date = new Date()
): { expiresAt: Date; interval: string } {
  // 1. Prioridade: Próxima data de cobrança ou término de período informada pela Cakto
  const rawNextPayment =
    item.next_payment_at ||
    item.subscription?.nextPaymentAt ||
    item.nextPaymentAt ||
    item.period_end ||
    item.subscription?.period_end ||
    item.expires_at ||
    item.subscription?.expires_at;

  if (rawNextPayment) {
    const candidateDate = new Date(rawNextPayment);
    if (!isNaN(candidateDate.getTime()) && candidateDate.getTime() > now.getTime()) {
      return { expiresAt: candidateDate, interval: item.plan?.interval || 'custom' };
    }
  }

  // 2. Identificação de intervalo e contagem do plano
  const interval = String(
    item.plan?.interval ||
    item.subscription?.interval ||
    item.interval ||
    'month'
  ).toLowerCase().trim();

  const intervalCount = parseInt(
    String(item.plan?.interval_count || item.subscription?.interval_count || item.interval_count || '1'),
    10
  ) || 1;

  const baseDate = item.paidAt || item.created_at || item.createdAt
    ? new Date(item.paidAt || item.created_at || item.createdAt)
    : now;

  const validBase = isNaN(baseDate.getTime()) ? now : baseDate;
  const expiresAt = new Date(validBase.getTime());

  if (interval.includes('year') || interval.includes('ano') || interval.includes('annual')) {
    expiresAt.setFullYear(expiresAt.getFullYear() + intervalCount);
  } else if (interval.includes('quarter') || interval.includes('trimest')) {
    expiresAt.setMonth(expiresAt.getMonth() + (3 * intervalCount));
  } else if (interval.includes('semi') || interval.includes('semest')) {
    expiresAt.setMonth(expiresAt.getMonth() + (6 * intervalCount));
  } else if (interval.includes('week') || interval.includes('seman')) {
    expiresAt.setDate(expiresAt.getDate() + (7 * intervalCount));
  } else {
    // Padrão mensal civil
    expiresAt.setMonth(expiresAt.getMonth() + intervalCount);
  }

  return { expiresAt, interval };
}

export class WebhookError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function validateWebhookSecret(payload: CaktoWebhookPayload, headers?: Record<string, any>) {
  const raw = headers?.['x-webhook-secret'] || headers?.['x-cakto-secret'] || headers?.authorization ||
    payload?.secret || payload?.token || payload?.webhook_secret;
  const configured = ENV.CAKTO_WEBHOOK_SECRET;
  if (!configured) throw new WebhookError('Webhook não configurado.', 503);
  if (typeof raw !== 'string') throw new WebhookError('Webhook não autorizado.', 401);
  const provided = Buffer.from(raw.replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(configured);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new WebhookError('Webhook não autorizado.', 401);
  }
}

export async function processCaktoWebhook(payload: CaktoWebhookPayload, headers?: Record<string, any>) {
  validateWebhookSecret(payload, headers);
  if (!payload || typeof payload !== 'object') throw new WebhookError('Payload inválido.', 400);
  const afterCommit: Array<() => Promise<unknown>> = [];
  const result = await prisma.$transaction(
    tx => applyCaktoWebhook(payload, tx, afterCommit),
    { maxWait: 10000, timeout: 20000 },
  );
  // E-mails são efeitos externos e só podem sair após o commit.
  for (const send of afterCommit) {
    try { await send(); } catch { console.error('[WEBHOOK] Falha na notificação após commit.'); }
  }
  return { success: result.success, message: result.message };
}

// Contas provisórias são reivindicadas pelo cadastro com verificação de e-mail.
// Uma compra avulsa nunca concede assinatura ou prazo de acesso.
async function createCreditBuyer(tx: Prisma.TransactionClient, email: string, name: string) {
  return tx.user.create({
    data: {
      email,
      name,
      password: `$WEBHOOK_TEMP$${crypto.randomBytes(16).toString('hex')}`,
      role: 'USER',
      subscriptionStatus: 'INACTIVE',
      subscriptionExpiresAt: null,
      subscriptionStartedAt: null,
      planId: null,
      workspaces: { create: { name: 'Minha Empresa' } },
    },
  });
}

async function applyCaktoWebhook(
  payload: CaktoWebhookPayload,
  prisma: Prisma.TransactionClient,
  afterCommit: Array<() => Promise<unknown>>,
): Promise<{ success: boolean; message: string; user?: any }> {
  const { event } = payload;

  // 2. Extração e normalização dos dados
  let items: any[] = [];
  if (Array.isArray(payload.data)) {
    items = payload.data;
  } else if (payload.data && typeof payload.data === 'object') {
    items = [payload.data];
  } else {
    return { success: false, message: 'Formato de dados não reconhecido' };
  }

  if (items.length === 0) {
    return { success: false, message: 'Nenhum dado recebido no payload' };
  }

  const primaryItem = items[0];
  const customer = primaryItem.customer || primaryItem.buyer || primaryItem.client || (payload as any).customer;
  if (!customer || !customer.email) {
    return { success: false, message: 'E-mail do cliente não informado no webhook' };
  }

  const email = String(customer.email).trim().toLowerCase();
  const name = customer.name ? String(customer.name).trim() : 'Cliente';
  const transactionId = primaryItem.id ? String(primaryItem.id).trim() : undefined;
  const rawSubscriptionId = primaryItem.subscription?.id ||
    (typeof primaryItem.subscription === 'string' || typeof primaryItem.subscription === 'number' ? primaryItem.subscription : undefined) ||
    primaryItem.subscriptionId || primaryItem.subscription_id;
  const subscriptionId = rawSubscriptionId ? String(rawSubscriptionId).trim() : undefined;
  const customerId = customer.id ? String(customer.id).trim() : undefined;

  // Serializa eventos do mesmo cliente, unificado com o fluxo de cadastro e recuperação.
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account:${email}`}))`;
  const now = new Date();

  // Duração dinâmica da assinatura
  const { expiresAt: calculatedExpiresAt, interval: subscriptionInterval } = calculateSubscriptionPeriod(primaryItem, now);

  // Normalização de eventos da Cakto
  const normalizedEvent = String(event || '').toLowerCase().trim();

  // 3. Verificação de Idempotência Financeira com WebhookLog
  const eventId = String(
    payload.event_id ||
    payload.id ||
    primaryItem.id ||
    primaryItem.transaction_id ||
    primaryItem.order_id ||
    ''
  ).trim();

  if (!eventId) throw new WebhookError('Evento sem identificador de evento ou transação.', 400);
  if (!normalizedEvent) throw new WebhookError('Evento não informado.', 400);
  const idempotencyKey = crypto.createHash('sha256').update(JSON.stringify(['cakto', eventId, normalizedEvent])).digest('hex');

  if (eventId) {
    const alreadyProcessed = await prisma.webhookLog.findFirst({
      where: {
        provider: 'cakto',
        eventId,
        event: normalizedEvent
      }
    });

    if (alreadyProcessed) {
      console.log(`[WEBHOOK CAKTO IDEMPOTENTE] Evento "${normalizedEvent}" com ID "${eventId}" já processado anteriormente.`);
      return { success: true, message: 'Evento já processado anteriormente (idempotente)' };
    }
  }

  // Registra no log de auditoria
  await prisma.webhookLog.create({
    data: {
      provider: 'cakto',
      eventId: eventId || null,
      idempotencyKey,
      event: normalizedEvent,
      email,
      // Auditoria mínima: não persistir segredos, dados de pagamento ou payload bruto.
      payload: JSON.stringify({ event: normalizedEvent, eventId, transactionId })
    }
  }); // Faz parte da mesma transação das alterações abaixo; falhas causam rollback.

  // 4. Tratamento de Eventos e Validação de Produto
  // 4.0 Detecção de Ping de Teste do Painel da Cakto (botão "Testar" na Cakto)
  const isCaktoTestPing =
    primaryItem.product?.name === 'Produto Teste' ||
    primaryItem.customer?.email === 'john.doe@example.com' ||
    primaryItem.refId === 'VZ3Z5LT' ||
    String(primaryItem.checkoutUrl || '').includes('/EXAMPLE');

  if (isCaktoTestPing) {
    console.log(`[CAKTO WEBHOOK] Ping de teste do painel da Cakto recebido e aprovado com sucesso. Evento: "${normalizedEvent}".`);
    return {
      success: true,
      message: 'Ping de teste da Cakto recebido com sucesso',
    };
  }

  const commercial = resolveCommercialItem(primaryItem);
  if (commercial.type === 'UNKNOWN') {
    const diagnosticInfo = {
      offerId: primaryItem?.offer_id || primaryItem?.offerId || primaryItem?.product?.offer_id || primaryItem?.product?.offerId || (typeof primaryItem?.offer?.id === 'number' || typeof primaryItem?.offer?.id === 'string' ? primaryItem?.offer?.id : undefined),
      offerCode: primaryItem?.offer?.code || primaryItem?.offer_code || primaryItem?.code,
      productName: primaryItem?.product?.name || primaryItem?.product_name || primaryItem?.name,
      checkoutUrl: primaryItem?.checkoutUrl || primaryItem?.checkout_url || primaryItem?.payment_url || primaryItem?.url,
    };
    console.warn(`[CAKTO WEBHOOK] Produto desconhecido ou não homologado. Evento: "${normalizedEvent}". Diagnóstico:`, diagnosticInfo);
    throw new WebhookError('Produto não reconhecido na plataforma.', 400);
  }

  // CASO A & B: Pagamento aprovado / Renovação recorrente
  if (
    (normalizedEvent.includes('approved') || normalizedEvent.includes('paid') || normalizedEvent.includes('renewed')) &&
    !normalizedEvent.includes('refund') && !normalizedEvent.includes('chargeback')
  ) {
    if (!transactionId) {
      throw new WebhookError('Evento de pagamento/renovação sem identificador da transação (transactionId).', 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { workspaces: true }
    });

    // SUB-CASO 1: Recarga avulsa de créditos (PACKAGE)
    if (commercial.type === 'PACKAGE') {
      const pkg = commercial.package!;
      const packageFinancialKey = `cakto_pkg_${transactionId}`;

      const existingOrder = prisma.creditPurchaseOrder?.findFirst
        ? await prisma.creditPurchaseOrder.findFirst({
            where: {
              OR: [
                { caktoOrderId: transactionId },
                { idempotencyKey: packageFinancialKey }
              ]
            }
          })
        : null;

      if (existingOrder) {
        if (!existingUser || existingOrder.userId !== existingUser.id) {
          throw new WebhookError('Pedido de recarga não pertence ao comprador informado no webhook.', 400);
        }
        // Bloqueador 2: Aprovação atrasada não pode reabrir pedido reembolsado nem conceder benefícios
        if (existingOrder.status === 'REFUNDED') {
          console.warn(`[CAKTO WEBHOOK] Aprovação atrasada ignorada para pedido já reembolsado: ${transactionId}.`);
          return { success: true, message: 'Pedido já reembolsado anteriormente. Aprovação atrasada ignorada.', user: existingUser };
        }

        if (existingOrder.status === 'PAID') {
          console.log(`[CAKTO WEBHOOK IDEMPOTENTE] Recarga ${transactionId} já processada anteriormente.`);
          return { success: true, message: 'Recarga já processada anteriormente (idempotente)', user: existingUser };
        }
      }

      let targetUser: any = existingUser;
      if (!targetUser) {
        targetUser = await createCreditBuyer(prisma, email, name);
      }

      const rawAmount = primaryItem.amount ?? primaryItem.paid_amount ?? primaryItem.price ?? primaryItem.value;
      let paidCents = pkg.priceCents;
      if (typeof rawAmount === 'number') {
        paidCents = Number.isInteger(rawAmount) && rawAmount > 500 ? rawAmount : Math.round(rawAmount * 100);
      }

      await CreditWalletService.grantPurchasedCredits({
        userId: targetUser.id,
        amount: pkg.credits,
        orderId: transactionId,
        idempotencyKey: packageFinancialKey,
        description: `Recarga Cakto: ${pkg.name}`,
        priceCents: paidCents,
        tx: prisma
      });

      if (prisma.creditPurchaseOrder) {
        if (prisma.creditPurchaseOrder.upsert) {
          await prisma.creditPurchaseOrder.upsert({
            where: { idempotencyKey: packageFinancialKey },
            create: {
              userId: targetUser.id,
              packageId: pkg.id,
              credits: pkg.credits,
              priceCents: paidCents,
              status: 'PAID',
              paymentProvider: 'cakto',
              caktoOrderId: transactionId,
              idempotencyKey: packageFinancialKey,
              paidAt: now
            },
            update: {
              status: 'PAID',
              paidAt: now
            }
          });
        } else if (existingOrder && prisma.creditPurchaseOrder.update) {
          await prisma.creditPurchaseOrder.update({
            where: { id: existingOrder.id },
            data: { status: 'PAID', paidAt: now }
          });
        } else if (prisma.creditPurchaseOrder.create) {
          await prisma.creditPurchaseOrder.create({
            data: {
              userId: targetUser.id,
              packageId: pkg.id,
              credits: pkg.credits,
              priceCents: paidCents,
              status: 'PAID',
              paymentProvider: 'cakto',
              caktoOrderId: transactionId,
              idempotencyKey: packageFinancialKey,
              paidAt: now
            }
          });
        }
      }

      afterCommit.push(async () => {
        const result = await EmailService.sendCreditPurchaseEmail({
          email, name: targetUser.name, credits: pkg.credits, priceCents: paidCents,
          orderId: transactionId, subscriptionActive: isSubscriptionActive(targetUser),
          expiresAt: targetUser.subscriptionExpiresAt, planId: targetUser.planId,
        });
        await notificationDb.subscriptionNotification.upsert({
          where: { userId_type_cycle: { userId: targetUser.id, type: 'CREDIT_PURCHASE', cycle: transactionId } },
          create: {
            userId: targetUser.id, type: 'CREDIT_PURCHASE', cycle: transactionId, recipientEmail: email,
            status: result.success ? 'SENT' : 'FAILED', resendEmailId: result.id || null, errorMessage: result.error || null,
          },
          update: { status: result.success ? 'SENT' : 'FAILED', resendEmailId: result.id || null, errorMessage: result.error || null },
        });
      });
      console.log(`[CAKTO WEBHOOK] Recarga de ${pkg.credits} créditos concedida para ${email}`);
      return {
        success: true,
        message: `Recarga de ${pkg.credits} créditos ativada com sucesso`,
        user: targetUser
      };
    }

    // SUB-CASO 2: Ciclo de Plano ou Produto Legado (PLAN ou LEGACY)
    const cycleFinancialKey = `cakto_cycle_${transactionId}`;

    // Bloqueador 1: Deduplicação ANTES de qualquer alteração de assinatura, validade, franquia ou créditos
    const alreadyProcessedCycle = prisma.creditTransaction?.findUnique
      ? await prisma.creditTransaction.findUnique({
          where: { idempotencyKey: cycleFinancialKey }
        })
      : null;

    if (alreadyProcessedCycle) {
      console.log(`[CAKTO WEBHOOK IDEMPOTENTE] Ciclo financeiro ${transactionId} já processado anteriormente.`);
      return {
        success: true,
        message: 'Pagamento/ciclo já processado anteriormente para esta transação (idempotente)',
        user: existingUser
      };
    }

    const isExistingAdmin = existingUser && (existingUser.role === 'ADMIN' || existingUser.subscriptionStatus === 'LIFETIME');
    const isExistingLegacy = existingUser && !isExistingAdmin && isLegacyPlan(existingUser.planId);

    // 1. Administrador (VIP): Acesso vitalício preservado
    if (isExistingAdmin) {
      const isUnverified = existingUser && !existingUser.emailVerifiedAt && !existingUser.password?.startsWith('$WEBHOOK_TEMP$');
      const tempPassword = isUnverified ? `$WEBHOOK_TEMP$${crypto.randomBytes(16).toString('hex')}` : undefined;

      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          subscriptionStatus: 'LIFETIME',
          caktoCustomerId: customerId || existingUser.caktoCustomerId,
          caktoSubscriptionId: subscriptionId ? String(subscriptionId) : existingUser.caktoSubscriptionId,
          caktoOrderId: transactionId,
          subscriptionInterval,
          ...(tempPassword ? { password: tempPassword, authVersion: { increment: 1 } } : {})
        }
      });
      const targetUser = { ...existingUser, ...updated };

      const wallet = await CreditWalletService.getOrCreateWallet(existingUser.id, prisma);
      if (wallet && prisma.creditTransaction?.create) {
        await prisma.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId: existingUser.id,
            amount: 0,
            type: 'ADMIN_ADJUSTMENT',
            balanceType: 'NONE',
            monthlyAmount: 0,
            purchasedAmount: 0,
            sourceType: 'SUBSCRIPTION_RENEWAL',
            sourceId: transactionId,
            idempotencyKey: cycleFinancialKey,
            description: 'Ciclo administrativo VIP (vitalício)',
            metadata: JSON.stringify({ transactionId, isUnlimited: true })
          }
        });
      }
      return { success: true, message: 'Conta de Administrador (VIP) mantida ativa', user: targetUser };
    }

    // 2. Davi (davianicetofirme@hotmail.com): Oferta legada renova PRO; compra de plano novo respeita a oferta paga
    const isOfficialDavi = existingUser && existingUser.email.toLowerCase() === 'davianicetofirme@hotmail.com';
    if (isOfficialDavi && (commercial.type === 'LEGACY' || commercial.type === 'PLAN')) {
      const renewalPlan = commercial.type === 'PLAN' ? commercial.plan! : getPlanById('PRO')!;
      let newExpiresAt: Date;
      if (existingUser.subscriptionExpiresAt && new Date(existingUser.subscriptionExpiresAt).getTime() > now.getTime()) {
        const base = new Date(existingUser.subscriptionExpiresAt);
        const { expiresAt } = calculateSubscriptionPeriod(primaryItem, base);
        newExpiresAt = expiresAt;
      } else {
        newExpiresAt = calculatedExpiresAt;
      }

      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: newExpiresAt,
          subscriptionRenewedAt: now,
          planId: renewalPlan.id,
          monthlyDispatchQuota: renewalPlan.monthlyDispatches,
          caktoOrderId: transactionId,
          caktoSubscriptionId: subscriptionId ? String(subscriptionId) : existingUser.caktoSubscriptionId,
          subscriptionInterval
        }
      });

      await QuotaService.resetCycleDispatches(existingUser.id, renewalPlan.monthlyDispatches, prisma);

      await CreditWalletService.grantMonthlyCredits({
        userId: existingUser.id,
        amount: renewalPlan.monthlyCredits,
        expiresAt: newExpiresAt,
        idempotencyKey: cycleFinancialKey,
        description: `Créditos mensais do Plano ${renewalPlan.name} (Davi)`,
        tx: prisma
      });

      console.log(`[CAKTO WEBHOOK] Davi renovado com sucesso no Plano ${renewalPlan.name} até ${newExpiresAt.toISOString()}`);
      afterCommit.push(() => EmailService.sendSubscriptionRenewedEmail({ email, name: existingUser.name, expiresAt: newExpiresAt, planId: renewalPlan.id }));
      return { success: true, message: `Davi renovado no Plano ${renewalPlan.name} com sucesso`, user: { ...existingUser, ...updated } };
    }

    // 3. Proteção de Contas Legadas Genéricas: Não podem ser migradas por novos produtos sem consentimento
    if (isExistingLegacy) {
      const wallet = await CreditWalletService.getOrCreateWallet(existingUser.id, prisma);
      if (commercial.type === 'PLAN') {
        // Bloqueador 3: Eventos dos novos produtos não podem sobrescrever o plano legado
        if (wallet && prisma.creditTransaction?.create) {
          await prisma.creditTransaction.create({
            data: {
              walletId: wallet.id,
              userId: existingUser.id,
              amount: 0,
              type: 'SUBSCRIPTION_RENEWAL',
              balanceType: 'NONE',
              monthlyAmount: 0,
              purchasedAmount: 0,
              sourceType: 'SUBSCRIPTION_CYCLE',
              sourceId: transactionId,
              idempotencyKey: cycleFinancialKey,
              description: 'Pagamento de novo plano ignorado para migração - Plano legado preservado',
              metadata: JSON.stringify({ transactionId, preservedLegacy: true })
            }
          });
        }
        console.log(`[CAKTO WEBHOOK] Usuário legado Davi preservado. Evento de novo plano ${commercial.plan?.id} não alterou o plano legado.`);
        return { success: true, message: 'Plano legado preservado integralmente', user: existingUser };
      }

      if (commercial.type === 'LEGACY') {
        // Renovação legítima do próprio produto legado
        let newExpiresAt: Date;
        if (existingUser.subscriptionExpiresAt && new Date(existingUser.subscriptionExpiresAt).getTime() > now.getTime()) {
          const base = new Date(existingUser.subscriptionExpiresAt);
          const { expiresAt } = calculateSubscriptionPeriod(primaryItem, base);
          newExpiresAt = expiresAt;
        } else {
          newExpiresAt = calculatedExpiresAt;
        }

        const updated = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            subscriptionStatus: 'ACTIVE',
            subscriptionExpiresAt: newExpiresAt,
            subscriptionRenewedAt: now,
            planId: 'LEGACY_DAVI',
            monthlyDispatchQuota: 0,
            caktoOrderId: transactionId,
            caktoSubscriptionId: subscriptionId ? String(subscriptionId) : existingUser.caktoSubscriptionId,
            subscriptionInterval
          }
        });

        if (wallet && prisma.creditTransaction?.create) {
          await prisma.creditTransaction.create({
            data: {
              walletId: wallet.id,
              userId: existingUser.id,
              amount: 0,
              type: 'SUBSCRIPTION_RENEWAL',
              balanceType: 'NONE',
              monthlyAmount: 0,
              purchasedAmount: 0,
              sourceType: 'SUBSCRIPTION_RENEWAL',
              sourceId: transactionId,
              idempotencyKey: cycleFinancialKey,
              description: 'Renovação do Plano Legado Davi',
              metadata: JSON.stringify({ transactionId, expiresAt: newExpiresAt })
            }
          });
        }

        afterCommit.push(() => EmailService.sendSubscriptionRenewedEmail({ email, name: existingUser.name, expiresAt: newExpiresAt, planId: 'LEGACY_DAVI' }));
        return { success: true, message: 'Plano legado renovado com sucesso', user: { ...existingUser, ...updated } };
      }
    }

    // 3. Cliente Comum (START, PRO, SCALE ou novo cliente do produto legado)
    let newExpiresAt: Date;
    if (existingUser?.subscriptionExpiresAt && new Date(existingUser.subscriptionExpiresAt).getTime() > now.getTime()) {
      const base = new Date(existingUser.subscriptionExpiresAt);
      const { expiresAt } = calculateSubscriptionPeriod(primaryItem, base);
      newExpiresAt = expiresAt;
    } else {
      newExpiresAt = calculatedExpiresAt;
    }

    const isUnverified = existingUser && !existingUser.emailVerifiedAt && !existingUser.password?.startsWith('$WEBHOOK_TEMP$');
    const tempPassword = isUnverified ? `$WEBHOOK_TEMP$${crypto.randomBytes(16).toString('hex')}` : undefined;

    let targetUser: any = null;

    if (existingUser) {
      const planUpdateData: any = {
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: newExpiresAt,
        subscriptionRenewedAt: now,
        subscriptionStartedAt: existingUser.subscriptionStartedAt || now,
        caktoCustomerId: customerId || existingUser.caktoCustomerId,
        caktoSubscriptionId: subscriptionId ? String(subscriptionId) : existingUser.caktoSubscriptionId,
        caktoOrderId: transactionId,
        subscriptionInterval,
        ...(tempPassword ? { password: tempPassword, authVersion: { increment: 1 } } : {})
      };

      if (commercial.type === 'PLAN') {
        planUpdateData.planId = commercial.plan!.id;
        planUpdateData.monthlyDispatchQuota = commercial.plan!.monthlyDispatches;
      } else if (commercial.type === 'LEGACY') {
        if (existingUser.planId && !isLegacyPlan(existingUser.planId)) {
          const currentPlan = getPlanById(existingUser.planId);
          planUpdateData.planId = existingUser.planId;
          planUpdateData.monthlyDispatchQuota = currentPlan?.monthlyDispatches ?? 3000;
        } else {
          planUpdateData.planId = 'LEGACY_DAVI';
          planUpdateData.monthlyDispatchQuota = 0;
        }
      }

      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: planUpdateData
      });
      targetUser = { ...existingUser, ...updated };
    } else {
      const hashedPassword = `$WEBHOOK_TEMP$${crypto.randomBytes(16).toString('hex')}`;
      const newUserData: any = {
        email,
        name,
        password: hashedPassword,
        role: 'USER',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: newExpiresAt,
        subscriptionStartedAt: now,
        caktoCustomerId: customerId || null,
        caktoSubscriptionId: subscriptionId ? String(subscriptionId) : null,
        caktoOrderId: transactionId,
        subscriptionInterval,
        workspaces: {
          create: {
            name: 'Minha Empresa'
          }
        }
      };

      if (commercial.type === 'PLAN') {
        newUserData.planId = commercial.plan!.id;
        newUserData.monthlyDispatchQuota = commercial.plan!.monthlyDispatches;
      } else if (commercial.type === 'LEGACY') {
        newUserData.planId = 'LEGACY_DAVI';
        newUserData.monthlyDispatchQuota = 0;
      }

      targetUser = await prisma.user.create({
        data: newUserData
      });
    }

    const effectivePlan = (commercial.type === 'PLAN' ? commercial.plan : null) || getPlanById(targetUser.planId);
    if (effectivePlan && !effectivePlan.isLegacy && !effectivePlan.isUnlimited) {
      await QuotaService.resetCycleDispatches(targetUser.id, effectivePlan.monthlyDispatches, prisma);

      if (effectivePlan.monthlyCredits > 0) {
        await CreditWalletService.grantMonthlyCredits({
          userId: targetUser.id,
          amount: effectivePlan.monthlyCredits,
          expiresAt: newExpiresAt,
          idempotencyKey: cycleFinancialKey,
          description: `Créditos mensais do Plano ${effectivePlan.name}`,
          tx: prisma
        });
      } else {
        const wallet = await CreditWalletService.getOrCreateWallet(targetUser.id, prisma);
        if (wallet && prisma.creditTransaction?.create) {
          await prisma.creditTransaction.create({
            data: {
              walletId: wallet.id,
              userId: targetUser.id,
              amount: 0,
              type: 'MONTHLY_GRANT',
              balanceType: 'NONE',
              monthlyAmount: 0,
              purchasedAmount: 0,
              sourceType: 'SUBSCRIPTION_RENEWAL',
              sourceId: transactionId,
              idempotencyKey: cycleFinancialKey,
              description: `Ciclo do Plano ${effectivePlan.name}`,
              metadata: JSON.stringify({ transactionId, expiresAt: newExpiresAt })
            }
          });
        }
      }
      console.log(`[CAKTO WEBHOOK] Plano ${effectivePlan.name} ativado/renovado com ${effectivePlan.monthlyDispatches} disparos e ${effectivePlan.monthlyCredits} créditos IA`);
    } else if (commercial.type === 'LEGACY') {
      const wallet = await CreditWalletService.getOrCreateWallet(targetUser.id, prisma);
      if (wallet && prisma.creditTransaction?.create) {
        await prisma.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId: targetUser.id,
            amount: 0,
            type: 'SUBSCRIPTION_RENEWAL',
            balanceType: 'NONE',
            monthlyAmount: 0,
            purchasedAmount: 0,
            sourceType: 'SUBSCRIPTION_RENEWAL',
            sourceId: transactionId,
            idempotencyKey: cycleFinancialKey,
            description: 'Ciclo do Plano Legado Davi',
            metadata: JSON.stringify({ transactionId, expiresAt: newExpiresAt })
          }
        });
      }
    }

    // E-mails após commit
    const isFirstActivation = !existingUser || existingUser.subscriptionStatus !== 'ACTIVE';
    if (isFirstActivation) {
      afterCommit.push(async () => {
        try {
          const alreadyNotified = await notificationDb.subscriptionNotification.findUnique({
            where: {
              userId_type_cycle: {
                userId: targetUser.id,
                type: 'WELCOME',
                cycle: 'WELCOME'
              }
            }
          });

          if (!alreadyNotified) {
            const emailResult = await EmailService.sendWelcomeEmail({
              email,
              name,
              expiresAt: newExpiresAt,
              planId: targetUser.planId
            });

            await notificationDb.subscriptionNotification.create({
              data: {
                userId: targetUser.id,
                type: 'WELCOME',
                cycle: 'WELCOME',
                recipientEmail: email,
                resendEmailId: emailResult.id || null,
                status: emailResult.success ? 'SENT' : 'FAILED',
                errorMessage: emailResult.error || null
              }
            }).catch((err) => console.warn('[SUBSCRIPTION NOTIFICATION WARN]:', err.message));
          }
        } catch {
          console.error('[CAKTO WEBHOOK] Falha no e-mail de boas-vindas.');
        }
      });
    } else {
      afterCommit.push(() => EmailService.sendSubscriptionRenewedEmail({
        email,
        name: targetUser.name,
        expiresAt: newExpiresAt,
        planId: targetUser.planId
      }));
    }

    return {
      success: true,
      message: 'Assinatura ativada/renovada com sucesso',
      user: targetUser
    };
  }

  // CASO C: Cancelamento de assinatura
  // REGRA DE NEGÓCIO: O cancelamento impede futuras renovações, mas mantém o acesso até subscriptionExpiresAt
  if (
    normalizedEvent.includes('canceled') ||
    normalizedEvent === 'subscription_canceled'
  ) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      if (existingUser.role === 'ADMIN' || existingUser.subscriptionStatus === 'LIFETIME') {
        return { success: true, message: 'Conta admin não afetada por cancelamento' };
      }

      if (isLegacyPlan(existingUser.planId) && commercial.type !== 'LEGACY') {
        console.warn(`[CAKTO WEBHOOK] Cancelamento de novo produto ignorado para conta legada Davi.`);
        return { success: true, message: 'Conta legada mantida intacta', user: existingUser };
      }

      if (!belongsToCurrentSubscription(existingUser, commercial, subscriptionId)) {
        return { success: true, message: 'Evento de outro contrato/plano ignorado; assinatura atual preservada', user: existingUser };
      }

      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          subscriptionStatus: 'CANCELED',
          subscriptionCanceledAt: now
        }
      });

      console.log(`[CAKTO WEBHOOK] Assinatura cancelada para ${email}. Acesso mantido até ${updated.subscriptionExpiresAt?.toISOString()}`);

      afterCommit.push(() => EmailService.sendSubscriptionCanceledEmail({
        email,
        name: updated.name,
        planId: updated.planId,
        expiresAt: updated.subscriptionExpiresAt
      }));

      return { success: true, message: 'Cancelamento registrado (acesso válido até o vencimento)', user: updated };
    }
  }

  // CASO D: Cobrança recusada / Falha de pagamento recorrente
  if (
    normalizedEvent.includes('refused') ||
    normalizedEvent.includes('overdue') ||
    normalizedEvent === 'purchase_refused'
  ) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      if (existingUser.role === 'ADMIN' || existingUser.subscriptionStatus === 'LIFETIME') {
        return { success: true, message: 'Conta admin não afetada' };
      }

      if (!belongsToCurrentSubscription(existingUser, commercial, subscriptionId)) {
        return { success: true, message: 'Evento de outro contrato/plano ignorado; assinatura atual preservada', user: existingUser };
      }

      // Se a data de expiração já passou, bloqueia para PAST_DUE
      const isPastDue = !existingUser.subscriptionExpiresAt || new Date(existingUser.subscriptionExpiresAt).getTime() <= now.getTime();
      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          subscriptionStatus: isPastDue ? 'PAST_DUE' : existingUser.subscriptionStatus
        }
      });

      console.log(`[CAKTO WEBHOOK] Falha de cobrança para ${email}. Status: ${updated.subscriptionStatus}`);

      afterCommit.push(() => EmailService.sendPaymentFailedEmail({
        email,
        name: updated.name,
        planId: updated.planId
      }));

      return { success: true, message: 'Falha de pagamento registrada', user: updated };
    }
  }

  // CASO E: Reembolso ou Chargeback (Disputa)
  if (
    normalizedEvent.includes('refund') ||
    normalizedEvent.includes('chargeback')
  ) {
    let existingUser = await prisma.user.findUnique({ where: { email } });
    if (commercial.type === 'PACKAGE') {
      if (!transactionId) {
        throw new WebhookError('Reembolso de recarga sem identificador da transação.', 400);
      }
      // Persistir o pedido terminal mesmo quando o reembolso precede o cadastro.
      // O lock account:${email} também serializa este caminho com o cadastro.
      if (!existingUser) {
        existingUser = await createCreditBuyer(prisma, email, name);
      }
    }
    if (existingUser) {
      if (existingUser.role === 'ADMIN' || existingUser.subscriptionStatus === 'LIFETIME') {
        return { success: true, message: 'Conta admin não afetada' };
      }

      // Distinguir se o reembolso é de uma recarga avulsa ou de um plano/assinatura
      let existingOrder = null;
      if (transactionId && prisma.creditPurchaseOrder?.findFirst) {
        existingOrder = await prisma.creditPurchaseOrder.findFirst({
          where: {
            OR: [
              { caktoOrderId: transactionId },
              { idempotencyKey: `cakto_pkg_${transactionId}` }
            ]
          }
        });
      }

      const isPackageRefund = commercial.type === 'PACKAGE' || Boolean(existingOrder);

      if (isPackageRefund) {
        // REEMBOLSO DE RECARGA: Atualiza o pedido e estorna os créditos comprados de forma auditável e segura
        // A ASSINATURA É MANTIDA INTACTA!
        if (existingOrder) {
          // Bloqueador 2: Validar o proprietário
          if (existingOrder.userId !== existingUser.id) {
            throw new WebhookError('Pedido de recarga não pertence ao comprador informado no webhook.', 400);
          }

          if (existingOrder.status === 'REFUNDED') {
            console.log(`[CAKTO WEBHOOK IDEMPOTENTE] Reembolso da recarga ${transactionId} já processado.`);
            return { success: true, message: 'Reembolso de recarga já processado anteriormente', user: existingUser };
          }

          if (prisma.creditPurchaseOrder?.update) {
            await prisma.creditPurchaseOrder.update({
              where: { id: existingOrder.id },
              data: {
                status: 'REFUNDED',
                refundedAt: now
              }
            });
          }

          const creditsToRevoke = existingOrder.credits || 0;
          const refundKey = `cakto_refund_pkg_${transactionId}`;

          const revokeResult = await CreditWalletService.revokePurchasedCredits({
            userId: existingUser.id,
            amount: creditsToRevoke,
            orderId: transactionId,
            idempotencyKey: refundKey,
            description: `Estorno por reembolso/disputa de recarga (Pedido: ${transactionId})`,
            tx: prisma
          });

          console.log(`[CAKTO WEBHOOK] Reembolso de recarga processado para ${email}. Revogados: ${revokeResult.revokedAmount} créditos. Assinatura mantida intacta.`);
          return {
            success: true,
            message: `Recarga estornada com sucesso (${revokeResult.revokedAmount} créditos revogados). Assinatura mantida.`,
            user: existingUser
          };
        } else {
          // Bloqueador 2: Reembolso recebido antes da aprovação
          const pkg = commercial.package;
          if (prisma.creditPurchaseOrder?.create) {
            await prisma.creditPurchaseOrder.create({
              data: {
                userId: existingUser.id,
                packageId: pkg?.id || 'PACKAGE_UNKNOWN',
                credits: pkg?.credits || 0,
                priceCents: pkg?.priceCents || 0,
                status: 'REFUNDED',
                paymentProvider: 'cakto',
                caktoOrderId: transactionId || null,
                idempotencyKey: `cakto_pkg_${transactionId}`,
                paidAt: null,
                refundedAt: now
              }
            });
          }

          console.log(`[CAKTO WEBHOOK] Reembolso antecipado de recarga registrado como REFUNDED para pedido ${transactionId}. Nenhum crédito descontado.`);
          return {
            success: true,
            message: 'Reembolso antecipado registrado como REFUNDED. Nenhum crédito descontado pois compra ainda não fora aprovada.',
            user: existingUser
          };
        }
      }

      // REEMBOLSO DE PLANO / ASSINATURA:
      // Bloqueador 3: Se for conta legada Davi e o cancelamento não for do produto legado, não afeta Davi
      if (isLegacyPlan(existingUser.planId) && commercial.type !== 'LEGACY') {
        console.warn(`[CAKTO WEBHOOK] Cancelamento/reembolso de novo produto não afeta conta legada Davi.`);
        return { success: true, message: 'Conta legada mantida intacta', user: existingUser };
      }

      if (!belongsToCurrentSubscription(existingUser, commercial, subscriptionId)) {
        return { success: true, message: 'Evento de outro contrato/plano ignorado; assinatura atual preservada', user: existingUser };
      }

      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          subscriptionStatus: 'CANCELED',
          subscriptionExpiresAt: now // Encerra acesso imediatamente
        }
      });

      // Revoga créditos mensais do ciclo atual cancelado
      await CreditWalletService.revokeMonthlyCredits({
        userId: existingUser.id,
        idempotencyKey: `cakto_refund_sub_${transactionId}`,
        description: 'Revogação de créditos mensais por cancelamento da assinatura',
        tx: prisma
      });

      console.log(`[CAKTO WEBHOOK] Reembolso/Disputa de assinatura para ${email}. Acesso revogado imediatamente.`);
      return { success: true, message: 'Acesso revogado por reembolso/chargeback', user: updated };
    }
  }

  return { success: true, message: `Evento "${event}" processado (sem alteração de status)` };
}

/**
 * Rotina automática de boot: Garante que a conta do Davi receba o upgrade
 * imediato para o Plano PRO (+ 150 créditos de IA e 3.000 disparos) assim
 * que o novo sistema for iniciado, aproveitando a renovação ativa do ciclo.
 */
export async function autoMigrateDaviToProIfRenewed(): Promise<void> {
  try {
    const davi = await prisma.user.findFirst({
      where: {
        email: 'davianicetofirme@hotmail.com'
      }
    });

    if (!davi) return;

    const now = new Date();
    const isActivelySubscribed = davi.subscriptionStatus === 'ACTIVE' &&
      davi.subscriptionExpiresAt &&
      new Date(davi.subscriptionExpiresAt).getTime() > now.getTime();

    // Migra apenas conta sem plano ou legada; nunca rebaixa um plano comercial comprado.
    if (isActivelySubscribed && (!davi.planId || getPlanById(davi.planId)?.isLegacy)) {
      const expirationDate = davi.subscriptionExpiresAt!;
      const cycleKey = `davi_auto_pro_${expirationDate.toISOString().slice(0, 10)}`;

      console.log(`[BOOT UPGRADE DAVI] Assinatura ativa detectada até ${expirationDate.toISOString()}. Migrando automaticamente para o Plano PRO com 150 créditos de IA.`);

      await prisma.user.update({
        where: { id: davi.id },
        data: {
          planId: 'PRO',
          monthlyDispatchQuota: 3000,
          dispatchesUsedInCycle: 0
        }
      });

      await QuotaService.resetCycleDispatches(davi.id, 3000, prisma);

      await CreditWalletService.grantMonthlyCredits({
        userId: davi.id,
        amount: 150,
        expiresAt: expirationDate,
        idempotencyKey: cycleKey,
        description: 'Upgrade automático para o Plano PRO (Novo Sistema)',
        tx: prisma
      });

      console.log(`[BOOT UPGRADE DAVI] Conta ${davi.email} migrada para o Plano PRO com sucesso!`);
    }
  } catch (err) {
    console.error('[BOOT UPGRADE DAVI] Falha ao verificar migração automática do Davi:', err);
  }
}

