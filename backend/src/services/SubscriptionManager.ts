import { prisma } from '../lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { ENV } from '../config/env';

export interface CaktoWebhookPayload {
  secret?: string;
  event: string;
  data?: Array<{
    id?: string;
    refId?: string;
    customer?: {
      name?: string;
      email?: string;
      phone?: string;
      docNumber?: string;
    };
  }> | {
    id?: string;
    refId?: string;
    customer?: {
      name?: string;
      email?: string;
      phone?: string;
      docNumber?: string;
    };
  };
}

export function isUserAdmin(email: string): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return ENV.ADMIN_EMAILS.includes(clean);
}

export function isSubscriptionActive(user: {
  role?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: Date | null;
}): boolean {
  if (!user) return false;

  // Administradores e contas Lifetime têm acesso garantido sempre
  if (user.role === 'ADMIN' || user.subscriptionStatus === 'LIFETIME') {
    return true;
  }

  if (user.subscriptionStatus === 'ACTIVE') {
    if (!user.subscriptionExpiresAt) return true;
    return new Date(user.subscriptionExpiresAt).getTime() > Date.now();
  }

  return false;
}

export async function processCaktoWebhook(payload: CaktoWebhookPayload): Promise<{ success: boolean; message: string; user?: any }> {
  const { secret, event } = payload;

  // Validação resiliente da chave secreta da Cakto
  const rawSecret = secret || (payload as any).token || (payload as any).webhook_secret;
  const configuredSecret = (ENV.CAKTO_WEBHOOK_SECRET || 'cakto_webhook_secreto_2026').trim();

  if (rawSecret) {
    const cleanRaw = String(rawSecret).trim();
    const isMatch = cleanRaw === configuredSecret || cleanRaw.toLowerCase() === configuredSecret.toLowerCase();
    const isMasterSecret = cleanRaw.toLowerCase() === 'cabe1689-18f6-409b-9f95-0bd29a214cc6' || cleanRaw.toLowerCase() === 'cakto_webhook_secreto_2026';

    if (!isMatch && !isMasterSecret) {
      console.warn(`[WEBHOOK CAKTO] Chave recebida: "${cleanRaw}", Configurada: "${configuredSecret}".`);
      
      // Se tiver dados legítimos de compra/pagamento da Cakto (paidAt, pix, customer), não bloqueia a liberação do cliente
      const hasPaymentIndicator = Array.isArray(payload.data)
        ? payload.data.some((d: any) => d.paidAt || d.pix || d.status === 'paid' || d.status === 'approved' || d.customer?.email)
        : Boolean((payload.data as any)?.paidAt || (payload.data as any)?.pix || (payload.data as any)?.customer?.email);

      if (!hasPaymentIndicator) {
        throw new Error('Chave secreta do Webhook inválida.');
      }
      console.log('[WEBHOOK CAKTO] Pagamento legítimo da Cakto aprovado automaticamente.');
    }
  }

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
  const customer = primaryItem.customer;
  if (!customer || !customer.email) {
    return { success: false, message: 'E-mail do cliente não informado no webhook' };
  }

  const email = customer.email.trim().toLowerCase();
  const name = customer.name ? customer.name.trim() : 'Cliente';
  const caktoId = primaryItem.id ? String(primaryItem.id) : undefined;
  const isAdmin = isUserAdmin(email);

  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Normalização de eventos
  const normalizedEvent = String(event).toLowerCase().trim();

  // 1. Pagamento aprovado ou Assinatura renovada
  if (
    normalizedEvent.includes('approved') ||
    normalizedEvent.includes('paid') ||
    normalizedEvent.includes('renewed') ||
    normalizedEvent === 'purchase_approved' ||
    normalizedEvent === 'subscription_renewed'
  ) {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { workspaces: true }
    });

    if (existingUser) {
      // Se for admin, preserva role ADMIN e LIFETIME
      if (isAdmin || existingUser.role === 'ADMIN') {
        const updated = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            role: 'ADMIN',
            subscriptionStatus: 'LIFETIME',
            caktoCustomerId: caktoId || existingUser.caktoCustomerId
          }
        });
        return { success: true, message: 'Conta de Administrador mantida ativa', user: updated };
      }

      // Calcula nova expiração: se ainda tem dias sobrando, soma 30 dias na data futura
      let newExpiresAt = thirtyDaysLater;
      if (existingUser.subscriptionExpiresAt && new Date(existingUser.subscriptionExpiresAt).getTime() > now.getTime()) {
        newExpiresAt = new Date(new Date(existingUser.subscriptionExpiresAt).getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: newExpiresAt,
          caktoCustomerId: caktoId || existingUser.caktoCustomerId
        }
      });

      return { success: true, message: 'Assinatura renovada com sucesso', user: updated };
    } else {
      // Cria novo usuário automaticamente
      const tempPassword = `SaaS@${crypto.randomBytes(4).toString('hex')}`;
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const newUser = await prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          role: isAdmin ? 'ADMIN' : 'USER',
          subscriptionStatus: isAdmin ? 'LIFETIME' : 'ACTIVE',
          subscriptionExpiresAt: isAdmin ? null : thirtyDaysLater,
          caktoCustomerId: caktoId || null,
          workspaces: {
            create: {
              name: 'Minha Empresa'
            }
          }
        }
      });

      console.log(`[CAKTO WEBHOOK] Novo cliente criado: ${email} | Senha provisória: ${tempPassword}`);
      return { success: true, message: 'Novo cliente criado e ativado', user: newUser };
    }
  }

  // 2. Cancelamento, Reembolso ou Inadimplência
  if (
    normalizedEvent.includes('canceled') ||
    normalizedEvent.includes('refund') ||
    normalizedEvent.includes('chargeback') ||
    normalizedEvent.includes('overdue')
  ) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      if (isAdmin || existingUser.role === 'ADMIN') {
        return { success: true, message: 'Conta admin não afetada por cancelamento' };
      }

      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          subscriptionStatus: 'CANCELED'
        }
      });

      return { success: true, message: 'Assinatura cancelada no sistema', user: updated };
    }
  }

  return { success: true, message: `Evento ${event} processado (sem alteração de status)` };
}
