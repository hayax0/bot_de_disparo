import { prisma } from '../lib/prisma';
import { isUserUnlimited, isLegacyPlan, getPlanById } from '../config/plans';

export class QuotaService {
  /**
   * Consulta se o usuário possui franquia de disparos disponível no ciclo atual.
   * Administradores e Contas Legadas têm permissão irrestrita.
   */
  static async canDispatch(userOrId: string | {
    id: string;
    role?: string | null;
    planId?: string | null;
    subscriptionStatus?: string | null;
    monthlyDispatchQuota?: number | null;
    dispatchesUsedInCycle?: number | null;
  }): Promise<{
    allowed: boolean;
    remaining?: number | undefined;
    quota?: number | undefined;
    used?: number | undefined;
    reason?: string | undefined;
    isUnlimited?: boolean | undefined;
  }> {
    let user: any;
    if (typeof userOrId === 'string') {
      user = await prisma.user.findUnique({
        where: { id: userOrId },
        select: {
          id: true,
          role: true,
          planId: true,
          subscriptionStatus: true,
          monthlyDispatchQuota: true,
          dispatchesUsedInCycle: true,
        }
      });
    } else {
      user = userOrId;
    }

    if (!user) {
      return { allowed: false, reason: 'Usuário não encontrado.' };
    }

    if (isUserUnlimited(user) || isLegacyPlan(user.planId)) {
      return {
        allowed: true,
        isUnlimited: true,
        quota: 0,
        used: user.dispatchesUsedInCycle || 0,
      };
    }

    // Identifica a cota configurada no plano
    const plan = getPlanById(user.planId);
    const quota = (user.monthlyDispatchQuota && user.monthlyDispatchQuota > 0)
      ? user.monthlyDispatchQuota
      : (plan ? plan.monthlyDispatches : 0);
    const used = user.dispatchesUsedInCycle || 0;

    if (quota > 0 && used >= quota) {
      return {
        allowed: false,
        remaining: 0,
        quota,
        used,
        reason: `Franquia mensal de disparos (${quota}) atingida no ciclo atual. Faça upgrade de plano ou aguarde a renovação.`,
      };
    }

    return {
      allowed: true,
      remaining: quota > 0 ? Math.max(0, quota - used) : undefined,
      quota,
      used,
      isUnlimited: quota === 0
    };
  }

  // Rastreador em memória por envio/ciclo para garantir idempotência em retries
  private static dispatchTracker = new Map<string, { status: 'RESERVED' | 'CONFIRMED'; userId: string; timestamp: number }>();

  /**
   * Reserva e consome 1 disparo na franquia mensal de forma ATÔMICA no banco de dados.
   * Suporta dispatchKey idempotente para evitar consumo duplicado em retries do worker.
   */
  static async tryConsumeDispatchQuota(userOrParams: string | {
    userId: string;
    dispatchKey?: string;
  }): Promise<{
    allowed: boolean;
    isUnlimited?: boolean;
    used?: number;
    quota?: number;
    reason?: string;
    isIdempotent?: boolean;
  }> {
    const userId = typeof userOrParams === 'string' ? userOrParams : userOrParams.userId;
    const dispatchKey = typeof userOrParams === 'string' ? undefined : userOrParams.dispatchKey;

    // Se houver dispatchKey e já foi consumido/confirmado para este envio, retorna idempotente sem re-debitar
    if (dispatchKey && this.dispatchTracker.has(dispatchKey)) {
      const existing = this.dispatchTracker.get(dispatchKey)!;
      if (existing.userId === userId) {
        return {
          allowed: true,
          isIdempotent: true
        };
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        planId: true,
        subscriptionStatus: true,
        monthlyDispatchQuota: true,
        dispatchesUsedInCycle: true
      }
    });

    if (!user) {
      return { allowed: false, reason: 'Usuário não encontrado.' };
    }

    // Administradores e Legado Davi possuem envio irrestrito sem bloqueio por cota
    if (isUserUnlimited(user) || isLegacyPlan(user.planId)) {
      await prisma.user.update({
        where: { id: userId },
        data: { dispatchesUsedInCycle: { increment: 1 } }
      }).catch(() => {});

      if (dispatchKey) {
        this.dispatchTracker.set(dispatchKey, { status: 'CONFIRMED', userId, timestamp: Date.now() });
      }

      return { allowed: true, isUnlimited: true };
    }

    const plan = getPlanById(user.planId);
    const quota = (user.monthlyDispatchQuota && user.monthlyDispatchQuota > 0)
      ? user.monthlyDispatchQuota
      : (plan ? plan.monthlyDispatches : 1500);

    // Incremento condicional atômico: só incrementa se used < quota
    const updatedRows: Array<{ dispatchesUsedInCycle: number; monthlyDispatchQuota: number }> =
      await prisma.$queryRaw`
        UPDATE "User"
        SET "dispatchesUsedInCycle" = "dispatchesUsedInCycle" + 1
        WHERE "id" = ${userId}
          AND (${quota} = 0 OR "dispatchesUsedInCycle" < ${quota})
        RETURNING "dispatchesUsedInCycle", "monthlyDispatchQuota"
      `;

    if (!updatedRows || updatedRows.length === 0) {
      return {
        allowed: false,
        quota,
        used: user.dispatchesUsedInCycle,
        reason: `Franquia mensal de disparos (${quota}) atingida no ciclo atual. Faça upgrade de plano ou aguarde a renovação.`
      };
    }

    if (dispatchKey) {
      this.dispatchTracker.set(dispatchKey, { status: 'RESERVED', userId, timestamp: Date.now() });
    }

    return {
      allowed: true,
      used: updatedRows[0].dispatchesUsedInCycle,
      quota
    };
  }

  /**
   * Confirma definitivamente o consumo do disparo quando a transmissão é iniciada.
   * Preserva a proteção contra reenvio incerto se houver timeout posterior.
   */
  static confirmDispatchQuota(params: { userId: string; dispatchKey?: string }): void {
    const { userId, dispatchKey } = params;
    if (dispatchKey) {
      this.dispatchTracker.set(dispatchKey, { status: 'CONFIRMED', userId, timestamp: Date.now() });
    }
  }

  /**
   * Libera a cota reservada caso o envio seja abortado antes de qualquer transmissão efetiva
   * (ex: mensagem vazia, validação de blacklist ou erro pré-transmissão).
   */
  static async releaseDispatchQuota(params: { userId: string; dispatchKey?: string }): Promise<void> {
    const { userId, dispatchKey } = params;
    if (dispatchKey) {
      const tracked = this.dispatchTracker.get(dispatchKey);
      if (tracked && tracked.status === 'CONFIRMED') {
        // Já confirmado como transmitido: não estorna para preservar proteção contra reenvio incerto
        return;
      }
      this.dispatchTracker.delete(dispatchKey);
    }
    await this.refundDispatchQuota(userId);
  }

  /**
   * Estorna atomicamente 1 disparo caso o envio tenha sido cancelado antes da tentativa de transmissão
   * (ex: opt-out, blacklist LGPD ou número inválido pré-envio).
   */
  static async refundDispatchQuota(userId: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE "User"
        SET "dispatchesUsedInCycle" = GREATEST(0, "dispatchesUsedInCycle" - 1)
        WHERE "id" = ${userId}
      `;
    } catch (err: any) {
      console.warn(`[QUOTA REFUND WARNING] Falha ao estornar cota para ${userId}:`, err?.message);
    }
  }

  /**
   * Mantido para compatibilidade métrica com envios sem concorrência estrita.
   */
  static async recordDispatch(userId: string): Promise<void> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          dispatchesUsedInCycle: { increment: 1 }
        }
      });
    } catch (err: any) {
      console.warn(`[QUOTA WARNING] Falha ao registrar disparo para ${userId}:`, err?.message);
    }
  }

  /**
   * Reseta a contagem de disparos no início de um novo ciclo de faturamento.
   */
  static async resetCycleDispatches(userId: string, newQuota?: number): Promise<void> {
    const data: any = {
      dispatchesUsedInCycle: 0,
      cycleResetAt: new Date(),
    };

    if (newQuota !== undefined) {
      data.monthlyDispatchQuota = newQuota;
    }

    await prisma.user.update({
      where: { id: userId },
      data,
    });
  }
}
