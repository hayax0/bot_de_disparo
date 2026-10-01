import { prisma } from '../lib/prisma';
import { isUserUnlimited, isLegacyPlan, getPlanById } from '../config/plans';

export class QuotaService {
  /**
   * Verifica se o usuário possui franquia de disparos disponível no ciclo atual.
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
    remaining?: number;
    quota?: number;
    used?: number;
    reason?: string;
    isUnlimited?: boolean;
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
        remaining: 999999,
        quota: 0,
        used: user.dispatchesUsedInCycle || 0,
      };
    }

    // Identifica a cota do plano
    const plan = getPlanById(user.planId);
    const quota = (user.monthlyDispatchQuota && user.monthlyDispatchQuota > 0)
      ? user.monthlyDispatchQuota
      : plan.monthlyDispatches;
    const used = user.dispatchesUsedInCycle || 0;

    if (used >= quota) {
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
      remaining: Math.max(0, quota - used),
      quota,
      used,
    };
  }

  /**
   * Contabiliza 1 disparo consumido na franquia mensal do ciclo.
   * Não bloqueia nem incrementa de forma punitiva administradores e legados.
   */
  static async recordDispatch(userId: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, planId: true, subscriptionStatus: true }
      });

      if (!user) return;

      // Mantém contagem métrica sem impor limite ao admin ou legado
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
