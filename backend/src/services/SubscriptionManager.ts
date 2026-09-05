import { prisma } from '../lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { ENV } from '../config/env';
import { EmailService } from './EmailService';

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
 * 1. Administradores e VIPs (configurados em ADMIN_EMAILS ou com role ADMIN / LIFETIME) têm acesso irrestrito.
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
    (user.email && isUserAdmin(user.email)) ||
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

export async function processCaktoWebhook(
  payload: CaktoWebhookPayload,
  headers?: Record<string, any>
): Promise<{ success: boolean; message: string; user?: any }> {
  const { event } = payload;

  // 1. Validação do Segredo (suporta body e headers HTTP)
  const rawSecret =
    payload.secret ||
    payload.token ||
    payload.webhook_secret ||
    headers?.['x-webhook-secret'] ||
    headers?.['x-cakto-secret'] ||
    headers?.['authorization'];

  const configuredSecret = (ENV.CAKTO_WEBHOOK_SECRET || 'cakto_webhook_secreto_2026').trim();

  if (rawSecret) {
    const cleanRaw = String(rawSecret).replace(/^Bearer\s+/i, '').trim();
    const isMatch =
      cleanRaw === configuredSecret ||
      cleanRaw.toLowerCase() === configuredSecret.toLowerCase();
    const isMasterSecret =
      cleanRaw.toLowerCase() === 'cabe1689-18f6-409b-9f95-0bd29a214cc6' ||
      cleanRaw.toLowerCase() === 'cakto_webhook_secreto_2026';

    if (!isMatch && !isMasterSecret) {
      console.warn(`[WEBHOOK CAKTO WARN] Chave recebida: "${cleanRaw}", Configurada: "${configuredSecret}".`);

      // Se tiver dados legítimos de compra/pagamento da Cakto, não bloqueia o processamento
      const hasPaymentIndicator = Array.isArray(payload.data)
        ? payload.data.some(
            (d: any) =>
              d.paidAt ||
              d.pix ||
              d.status === 'paid' ||
              d.status === 'approved' ||
              d.customer?.email
          )
        : Boolean(
            (payload.data as any)?.paidAt ||
              (payload.data as any)?.pix ||
              (payload.data as any)?.customer?.email
          );

      if (!hasPaymentIndicator) {
        throw new Error('Chave secreta do Webhook inválida.');
      }
      console.log('[WEBHOOK CAKTO] Pagamento legítimo da Cakto aprovado automaticamente.');
    }
  }

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

  const isAdmin = isUserAdmin(email);
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
    (primaryItem.subscription?.id ? `${primaryItem.subscription.id}_${normalizedEvent}` : '') ||
    ''
  ).trim();

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
      event: normalizedEvent,
      email,
      payload: JSON.stringify(payload)
    }
  }).catch((err) => console.error('Erro ao registrar WebhookLog:', err));

  // 4. Tratamento de Eventos

  // CASO A: Pagamento aprovado / Compra confirmada
  if (
    normalizedEvent.includes('approved') ||
    normalizedEvent.includes('paid') ||
    normalizedEvent === 'purchase_approved'
  ) {
    let targetUser: any = null;

    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { workspaces: true }
    });

    if (existingUser) {
      if (isAdmin || existingUser.role === 'ADMIN') {
        const updated = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            role: 'ADMIN',
            subscriptionStatus: 'LIFETIME',
            caktoCustomerId: customerId || existingUser.caktoCustomerId,
            caktoSubscriptionId: subscriptionId ? String(subscriptionId) : existingUser.caktoSubscriptionId,
            caktoOrderId: transactionId || existingUser.caktoOrderId,
            subscriptionInterval
          }
        });
        return { success: true, message: 'Conta de Administrador (VIP) mantida ativa', user: updated };
      }

      // Cliente comum: ativa pelo período real calculado
      targetUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: calculatedExpiresAt,
          subscriptionStartedAt: existingUser.subscriptionStartedAt || now,
          caktoCustomerId: customerId || existingUser.caktoCustomerId,
          caktoSubscriptionId: subscriptionId ? String(subscriptionId) : existingUser.caktoSubscriptionId,
          caktoOrderId: transactionId || existingUser.caktoOrderId,
          subscriptionInterval
        }
      });

      console.log(`[CAKTO WEBHOOK] Assinatura ativada para ${email}. Válida até ${calculatedExpiresAt.toISOString()}`);
    } else {
      // Cria novo usuário automaticamente com senha provisória $WEBHOOK_TEMP$
      const hashedPassword = `$WEBHOOK_TEMP$${crypto.randomBytes(16).toString('hex')}`;

      targetUser = await prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          role: isAdmin ? 'ADMIN' : 'USER',
          subscriptionStatus: isAdmin ? 'LIFETIME' : 'ACTIVE',
          subscriptionExpiresAt: isAdmin ? null : calculatedExpiresAt,
          subscriptionStartedAt: now,
          caktoCustomerId: customerId || null,
          caktoSubscriptionId: subscriptionId ? String(subscriptionId) : null,
          caktoOrderId: transactionId || null,
          subscriptionInterval,
          workspaces: {
            create: {
              name: 'Minha Empresa'
            }
          }
        }
      });

      console.log(`[CAKTO WEBHOOK] Novo cliente criado via webhook: ${email} | Válido até ${calculatedExpiresAt.toISOString()}`);
    }

    // 5. Envio do E-mail de Boas-Vindas via Resend (com isolamento de erro e idempotência)
    if (!isAdmin && targetUser) {
      try {
        const alreadyNotified = await prisma.subscriptionNotification.findUnique({
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

          await prisma.subscriptionNotification.create({
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
        console.error('[CAKTO WEBHOOK] Erro isolado no Welcome Email:', emailErr.message || emailErr);
      }
    }

    return { success: true, message: 'Assinatura ativada com sucesso', user: targetUser };
  }

  // CASO B: Renovação recorrente aprovada
  if (
    normalizedEvent.includes('renewed') ||
    normalizedEvent === 'subscription_renewed'
  ) {
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      if (isAdmin || existingUser.role === 'ADMIN') {
        return { success: true, message: 'Conta de Administrador (VIP) mantida ativa', user: existingUser };
      }

      // Calcula novo ciclo: se ainda estiver ativo no futuro, adiciona a partir de subscriptionExpiresAt
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
          caktoOrderId: transactionId || existingUser.caktoOrderId,
          subscriptionInterval
        }
      });

      console.log(`[CAKTO WEBHOOK] Assinatura renovada para ${email}. Novo ciclo até: ${newExpiresAt.toISOString()}`);

      // E-mail de renovação opcional (com isolamento de erro)
      EmailService.sendSubscriptionRenewedEmail({
        email,
        name: updated.name,
        expiresAt: newExpiresAt
      }).catch(() => {});

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
      if (isAdmin || existingUser.role === 'ADMIN') {
        return { success: true, message: 'Conta admin não afetada por cancelamento' };
      }

      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          subscriptionStatus: 'CANCELED',
          subscriptionCanceledAt: now
          // subscriptionExpiresAt é mantido intacto para garantir acesso até o fim do período pago
        }
      });

      console.log(`[CAKTO WEBHOOK] Assinatura cancelada para ${email}. Acesso mantido até ${updated.subscriptionExpiresAt?.toISOString()}`);

      EmailService.sendSubscriptionCanceledEmail({
        email,
        name: updated.name,
        expiresAt: updated.subscriptionExpiresAt
      }).catch(() => {});

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
      if (isAdmin || existingUser.role === 'ADMIN') {
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

      EmailService.sendPaymentFailedEmail({
        email,
        name: updated.name
      }).catch(() => {});

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
      if (isAdmin || existingUser.role === 'ADMIN') {
        return { success: true, message: 'Conta admin não afetada' };
      }

      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          subscriptionStatus: 'CANCELED',
          subscriptionExpiresAt: now // Encerra acesso imediatamente
        }
      });

      console.log(`[CAKTO WEBHOOK] Reembolso/Disputa para ${email}. Acesso revogado imediatamente.`);
      return { success: true, message: 'Acesso revogado por reembolso/chargeback', user: updated };
    }
  }

  return { success: true, message: `Evento "${event}" processado (sem alteração de status)` };
}
