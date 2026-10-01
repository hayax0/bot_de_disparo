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

  /**
   * Reserva e consome 1 disparo na franquia mensal de forma ATÔMICA no banco de dados.
   * Impede que múltiplos workers concorrentes ultrapassem a cota contratada.
   */
  static async tryConsumeDispatchQuota(userId: string): Promise<{
    allowed: boolean;
    isUnlimited?: boolean;
    used?: number;
    quota?: number;
    reason?: string;
  }> {
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
      // Registra contagem métrica sem bloqueio
      await prisma.user.update({
        where: { id: userId },
        data: { dispatchesUsedInCycle: { increment: 1 } }
      }).catch(() => {});

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

    return {
      allowed: true,
      used: updatedRows[0].dispatchesUsedInCycle,
      quota
    };
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
