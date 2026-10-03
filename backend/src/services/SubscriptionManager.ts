import { prisma, prisma as notificationDb } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { ENV } from '../config/env';
import { EmailService } from './EmailService';
import { resolveCommercialItem, getPlanById } from '../config/plans';
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
  const subscriptionId =
    primaryItem.subscription?.id ||
    primaryItem.subscription ||
    primaryItem.subscriptionId ||
    undefined;
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
  const commercial = resolveCommercialItem(primaryItem);
  if (commercial.type === 'UNKNOWN') {
    console.warn(`[CAKTO WEBHOOK] Produto desconhecido ou não homologado. Evento: "${normalizedEvent}".`);
    throw new WebhookError('Produto não reconhecido na plataforma.', 400);
  }

  // CASO A: Pagamento aprovado / Compra confirmada
  if (
    (normalizedEvent.includes('approved') || normalizedEvent.includes('paid')) &&
    !normalizedEvent.includes('refund') && !normalizedEvent.includes('chargeback')
  ) {
    if (!transactionId) {
      throw new WebhookError('Evento de pagamento sem identificador da transação (transactionId).', 400);
    }

    let targetUser: any = null;

    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { workspaces: true }
    });

    const isUnverified = existingUser && !existingUser.emailVerifiedAt && !existingUser.password?.startsWith('$WEBHOOK_TEMP$');
    const tempPassword = isUnverified ? `$WEBHOOK_TEMP$${crypto.randomBytes(16).toString('hex')}` : undefined;

    if (existingUser) {
      if (existingUser.role === 'ADMIN' || existingUser.subscriptionStatus === 'LIFETIME') {
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
        targetUser = { ...existingUser, ...updated };
      } else {
        if (commercial.type === 'PACKAGE') {
          targetUser = existingUser;
        } else {
          const planUpdateData: any = {
            subscriptionStatus: 'ACTIVE',
            subscriptionExpiresAt: calculatedExpiresAt,
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
            planUpdateData.planId = 'LEGACY_DAVI';
            planUpdateData.monthlyDispatchQuota = 0;
          }

          const updated = await prisma.user.update({
            where: { id: existingUser.id },
            data: planUpdateData
          });
          targetUser = { ...existingUser, ...updated };
        }
      }
      console.log(`[CAKTO WEBHOOK] Pagamento processado para ${email} (tipo: ${commercial.type})`);
    } else {
      const hashedPassword = `$WEBHOOK_TEMP$${crypto.randomBytes(16).toString('hex')}`;
      const newUserData: any = {
        email,
        name,
        password: hashedPassword,
        role: 'USER',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: calculatedExpiresAt,
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

      console.log(`[CAKTO WEBHOOK] Novo cliente criado: ${email} | Plano: ${targetUser.planId || 'N/A'}`);
    }

    // Processamento financeiro atômico do item com chave estável por transactionId
    if (commercial.type === 'PACKAGE') {
      const pkg = commercial.package!;
      const financialKey = `cakto_pkg_${transactionId}`;

      const rawAmount = primaryItem.amount ?? primaryItem.paid_amount ?? primaryItem.price ?? primaryItem.value;
      let paidCents = pkg.priceCents;
      if (typeof rawAmount === 'number') {
        paidCents = Number.isInteger(rawAmount) && rawAmount > 500 ? rawAmount : Math.round(rawAmount * 100);
      }

      await CreditWalletService.grantPurchasedCredits({
        userId: targetUser.id,
        amount: pkg.credits,
        orderId: transactionId,
        idempotencyKey: financialKey,
        description: `Recarga Cakto: ${pkg.name}`,
        priceCents: paidCents,
        tx: prisma
      });

      if (prisma.creditPurchaseOrder?.upsert) {
        await prisma.creditPurchaseOrder.upsert({
          where: { idempotencyKey: financialKey },
          create: {
            userId: targetUser.id,
            packageId: pkg.id,
            credits: pkg.credits,
            priceCents: paidCents,
            status: 'PAID',
            paymentProvider: 'cakto',
            caktoOrderId: transactionId,
            idempotencyKey: financialKey,
            paidAt: now
          },
          update: {
            status: 'PAID',
            paidAt: now
          }
        });
      }
      console.log(`[CAKTO WEBHOOK] Recarga de ${pkg.credits} créditos concedida para ${email}`);
    } else if (commercial.type === 'PLAN') {
      const isUnlimited = targetUser.role === 'ADMIN' || targetUser.subscriptionStatus === 'LIFETIME';
      if (!isUnlimited) {
        const plan = commercial.plan!;
        const financialKey = `cakto_monthly_${transactionId}`;

        const alreadyGranted = prisma.creditTransaction?.findUnique
          ? await prisma.creditTransaction.findUnique({
              where: { idempotencyKey: financialKey }
            })
          : null;

        if (!alreadyGranted) {
          await QuotaService.resetCycleDispatches(targetUser.id, plan.monthlyDispatches, prisma);

          if (plan.monthlyCredits > 0) {
            await CreditWalletService.grantMonthlyCredits({
              userId: targetUser.id,
              amount: plan.monthlyCredits,
              expiresAt: calculatedExpiresAt,
              idempotencyKey: financialKey,
              description: `Créditos mensais do Plano ${plan.name}`,
              tx: prisma
            });
          }
          console.log(`[CAKTO WEBHOOK] Plano ${plan.name} ativado com ${plan.monthlyDispatches} disparos e ${plan.monthlyCredits} créditos IA`);
        } else {
          console.log(`[CAKTO WEBHOOK IDEMPOTENTE] Concessão financeira do plano para ${transactionId} já processada anteriormente.`);
        }
      }
    }

    // 5. Envio do E-mail de Boas-Vindas via Resend (após commit da transação)
    if (targetUser && (!existingUser || commercial.type !== 'PACKAGE')) {
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
              expiresAt: calculatedExpiresAt
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
        } catch (emailErr: any) {
          console.error('[CAKTO WEBHOOK] Falha no e-mail de boas-vindas.');
        }
      });
    }

    return {
      success: true,
      message: commercial.type === 'PACKAGE'
        ? `Recarga de ${commercial.package!.credits} créditos ativada com sucesso`
        : 'Assinatura ativada com sucesso',
      user: targetUser
    };
  }

  // CASO B: Renovação recorrente aprovada
  if (
    normalizedEvent.includes('renewed') ||
    normalizedEvent === 'subscription_renewed'
  ) {
    if (!transactionId) {
      throw new WebhookError('Evento de renovação sem identificador da transação (transactionId).', 400);
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      if (existingUser.role === 'ADMIN' || existingUser.subscriptionStatus === 'LIFETIME') {
        return { success: true, message: 'Conta de Administrador (VIP) mantida ativa', user: existingUser };
      }

      // Calcula novo ciclo
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
          caktoSubscriptionId: subscriptionId ? String(subscriptionId) : existingUser.caktoSubscriptionId,
          caktoOrderId: transactionId,
          subscriptionInterval
        }
      });

      const effectivePlan = (commercial.type === 'PLAN' ? commercial.plan : null) || getPlanById(existingUser.planId);
      if (effectivePlan && !effectivePlan.isLegacy && !effectivePlan.isUnlimited) {
        const renewKey = `cakto_renew_${transactionId}`;
        const alreadyGranted = prisma.creditTransaction?.findUnique
          ? await prisma.creditTransaction.findUnique({
              where: { idempotencyKey: renewKey }
            })
          : null;

        if (!alreadyGranted) {
          await QuotaService.resetCycleDispatches(existingUser.id, effectivePlan.monthlyDispatches, prisma);

          if (effectivePlan.monthlyCredits > 0) {
            await CreditWalletService.grantMonthlyCredits({
              userId: existingUser.id,
              amount: effectivePlan.monthlyCredits,
              expiresAt: newExpiresAt,
              idempotencyKey: renewKey,
              description: `Renovação de créditos mensais do Plano ${effectivePlan.name}`,
              tx: prisma
            });
          }
        } else {
          console.log(`[CAKTO WEBHOOK IDEMPOTENTE] Renovação financeira para ${transactionId} já processada.`);
        }
      }

      console.log(`[CAKTO WEBHOOK] Assinatura renovada para ${email}. Novo ciclo até: ${newExpiresAt.toISOString()}`);

      // E-mail de renovação opcional
      afterCommit.push(() => EmailService.sendSubscriptionRenewedEmail({
        email,
        name: updated.name,
        expiresAt: newExpiresAt
      }));

      return { success: true, message: 'Assinatura renovada com sucesso', user: updated };
    }
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
        name: updated.name
      }));

      return { success: true, message: 'Falha de pagamento registrada', user: updated };
    }
  }

  // CASO E: Reembolso ou Chargeback (Disputa)
  if (
    normalizedEvent.includes('refund') ||
    normalizedEvent.includes('chargeback')
  ) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
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
        }

        const creditsToRevoke = existingOrder?.credits || (commercial.type === 'PACKAGE' ? commercial.package?.credits : 0) || 0;
        const refundKey = transactionId ? `cakto_refund_pkg_${transactionId}` : `cakto_refund_pkg_${eventId}`;

        const revokeResult = await CreditWalletService.revokePurchasedCredits({
          userId: existingUser.id,
          amount: creditsToRevoke,
          orderId: transactionId,
          idempotencyKey: refundKey,
          description: `Estorno por reembolso/disputa de recarga (Pedido: ${transactionId || 'N/A'})`,
          tx: prisma
        });

        console.log(`[CAKTO WEBHOOK] Reembolso de recarga processado para ${email}. Revogados: ${revokeResult.revokedAmount} créditos. Assinatura mantida intacta.`);
        return {
          success: true,
          message: `Recarga estornada com sucesso (${revokeResult.revokedAmount} créditos revogados). Assinatura mantida.`,
          user: existingUser
        };
      }

      // REEMBOLSO DE PLANO / ASSINATURA:
      // Se trouxer subscriptionId e o usuário tiver assinatura ativa diferente, preserva a assinatura ativa
      if (subscriptionId && existingUser.caktoSubscriptionId && String(subscriptionId) !== existingUser.caktoSubscriptionId) {
        console.warn(`[CAKTO WEBHOOK] Reembolso recebido para assinatura ${subscriptionId}, mas usuário ativo possui ${existingUser.caktoSubscriptionId}. Assinatura ativa preservada.`);
        return {
          success: true,
          message: 'Reembolso referente a contrato anterior/diferente. Assinatura ativa preservada.',
          user: existingUser
        };
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
        idempotencyKey: transactionId ? `cakto_refund_sub_${transactionId}` : `cakto_refund_sub_${eventId}`,
        description: 'Revogação de créditos mensais por cancelamento da assinatura',
        tx: prisma
      });

      console.log(`[CAKTO WEBHOOK] Reembolso/Disputa de assinatura para ${email}. Acesso revogado imediatamente.`);
      return { success: true, message: 'Acesso revogado por reembolso/chargeback', user: updated };
    }
  }

  return { success: true, message: `Evento "${event}" processado (sem alteração de status)` };
}
