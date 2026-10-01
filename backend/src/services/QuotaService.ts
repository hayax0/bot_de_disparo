import { prisma } from '../lib/prisma';
import { isUserUnlimited, isLegacyPlan, getPlanById } from '../config/plans';

function getCycleKey(user: { cycleResetAt?: Date | null; createdAt?: Date }): string {
  if (user.cycleResetAt) {
    return user.cycleResetAt.toISOString();
  }
  const d = user.createdAt || new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

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
   * Reserva e consome 1 disparo na franquia mensal de forma ATÔMICA e PERSISTIDA no banco de dados.
   * Suporta dispatchKey e cycleKey para garantir idempotência estrita entre reinícios e múltiplos processos.
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

    return await prisma.$transaction(async (tx) => {
      // 1. Lock consultivo exclusivo por usuário no escopo da transação
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dispatch_quota:${userId}`}))`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          planId: true,
          subscriptionStatus: true,
          monthlyDispatchQuota: true,
          dispatchesUsedInCycle: true,
          cycleResetAt: true,
          createdAt: true
        }
      });

      if (!user) {
        return { allowed: false, reason: 'Usuário não encontrado.' };
      }

      const cycleKey = getCycleKey(user);

      // 2. Se houver dispatchKey, checa idempotência persistida no PostgreSQL por envio/ciclo
      if (dispatchKey) {
        const existing = await tx.dispatchReservation.findUnique({
          where: {
            userId_cycleKey_dispatchKey: {
              userId,
              cycleKey,
              dispatchKey
            }
          }
        });

        if (existing) {
          if (existing.status === 'CONFIRMED' || existing.status === 'RESERVED') {
            return {
              allowed: true,
              isIdempotent: true,
              used: user.dispatchesUsedInCycle,
              isUnlimited: isUserUnlimited(user) || isLegacyPlan(user.planId)
            };
          }
        }
      }

      // 3. Administradores e Legado Davi possuem envio irrestrito sem bloqueio por cota
      if (isUserUnlimited(user) || isLegacyPlan(user.planId)) {
        await tx.user.update({
          where: { id: userId },
          data: { dispatchesUsedInCycle: { increment: 1 } }
        });

        if (dispatchKey) {
          await tx.dispatchReservation.upsert({
            where: {
              userId_cycleKey_dispatchKey: {
                userId,
                cycleKey,
                dispatchKey
              }
            },
            create: {
              userId,
              cycleKey,
              dispatchKey,
              status: 'CONFIRMED'
            },
            update: {
              status: 'CONFIRMED'
            }
          });
        }

        return { allowed: true, isUnlimited: true };
      }

      const plan = getPlanById(user.planId);
      const quota = (user.monthlyDispatchQuota && user.monthlyDispatchQuota > 0)
        ? user.monthlyDispatchQuota
        : (plan ? plan.monthlyDispatches : 1500);

      // 4. Incremento condicional atômico: só incrementa se used < quota
      const updatedRows: Array<{ dispatchesUsedInCycle: number; monthlyDispatchQuota: number }> =
        await tx.$queryRaw`
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

      // 5. Persiste a reserva de disparo no banco com status RESERVED
      if (dispatchKey) {
        await tx.dispatchReservation.upsert({
          where: {
            userId_cycleKey_dispatchKey: {
              userId,
              cycleKey,
              dispatchKey
            }
          },
          create: {
            userId,
            cycleKey,
            dispatchKey,
            status: 'RESERVED'
          },
          update: {
            status: 'RESERVED'
          }
        });
      }

      return {
        allowed: true,
        used: updatedRows[0].dispatchesUsedInCycle,
        quota
      };
    }, { timeout: 15000 });
  }

  /**
   * Confirma definitivamente o consumo do disparo quando a transmissão é iniciada.
   * Transição atômica persistida no PostgreSQL. Preserva a proteção contra reenvio incerto.
   */
  static async confirmDispatchQuota(params: { userId: string; dispatchKey?: string }): Promise<void> {
    const { userId, dispatchKey } = params;
    if (!dispatchKey) return;

    await prisma.dispatchReservation.updateMany({
      where: {
        userId,
        dispatchKey,
        status: 'RESERVED'
      },
      data: {
        status: 'CONFIRMED'
      }
    });
  }

  /**
   * Libera atomicamente a cota reservada caso o envio seja abortado antes de qualquer transmissão efetiva.
   * Totalmente idempotente: liberação repetida não estorna duas vezes.
   */
  static async releaseDispatchQuota(params: { userId: string; dispatchKey?: string }): Promise<void> {
    const { userId, dispatchKey } = params;

    if (!dispatchKey) {
      await this.refundDispatchQuota(userId);
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Transição atômica condicional: só transiciona de RESERVED para RELEASED
      const updateResult = await tx.dispatchReservation.updateMany({
        where: {
          userId,
          dispatchKey,
          status: 'RESERVED'
        },
        data: {
          status: 'RELEASED'
        }
      });

      // Se atualizou 1 linha, estorna 1 disparo da cota do usuário
      if (updateResult.count > 0) {
        await tx.$executeRaw`
          UPDATE "User"
          SET "dispatchesUsedInCycle" = GREATEST(0, "dispatchesUsedInCycle" - 1)
          WHERE "id" = ${userId}
        `;
      }
    }, { timeout: 15000 });
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
