import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { isUserUnlimited, isLegacyPlan, getPlanById, hasUnlimitedDispatches } from '../config/plans';

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
   * Administradores, Contas Legadas e exceções contratuais (Davi) têm permissão irrestrita.
   */
  static async canDispatch(userOrId: string | {
    id: string;
    email?: string | null;
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
          email: true,
          role: true,
          planId: true,
          subscriptionStatus: true,
          monthlyDispatchQuota: true,
          dispatchesUsedInCycle: true,
        }
      });
    } else {
      user = userOrId;
      if (user && user.email === undefined && user.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { email: true }
        });
        if (dbUser?.email) {
          user = { ...user, email: dbUser.email };
        }
      }
    }

    if (!user) {
      return { allowed: false, reason: 'Usuário não encontrado.' };
    }

    if (hasUnlimitedDispatches(user)) {
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
    reservationId?: string;
    cycleKey?: string;
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
          email: true,
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
              isUnlimited: hasUnlimitedDispatches(user),
              reservationId: existing.id,
              cycleKey: existing.cycleKey
            };
          }
        }
      }

      // 3. Administradores, Legado e contas especiais (Davi) possuem envio irrestrito sem bloqueio por cota
      if (hasUnlimitedDispatches(user)) {
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
      let createdReservation: any = null;
      if (dispatchKey) {
        createdReservation = await tx.dispatchReservation.upsert({
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
        quota,
        reservationId: createdReservation?.id,
        cycleKey
      };
    }, { timeout: 15000 });
  }

  /**
   * Confirma definitivamente o consumo do disparo quando a transmissão é iniciada.
   * Opera pelo identificador da reserva ou chave do envio.
   */
  static async confirmDispatchQuota(params: {
    userId: string;
    dispatchKey?: string | undefined;
    reservationId?: string | undefined;
  }): Promise<void> {
    const { userId, dispatchKey, reservationId } = params;
    if (!reservationId && !dispatchKey) return;

    if (reservationId) {
      await prisma.dispatchReservation.updateMany({
        where: { id: reservationId, status: 'RESERVED' },
        data: { status: 'CONFIRMED' }
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { cycleResetAt: true, createdAt: true }
    });
    const currentCycleKey = user ? getCycleKey(user) : undefined;

    await prisma.dispatchReservation.updateMany({
      where: {
        userId,
        dispatchKey: dispatchKey!,
        ...(currentCycleKey ? { cycleKey: currentCycleKey } : {}),
        status: 'RESERVED'
      },
      data: {
        status: 'CONFIRMED'
      }
    });
  }

  /**
   * Libera atomicamente a cota reservada caso o envio seja abortado antes de qualquer transmissão efetiva.
   * Respeita rigorosamente o ciclo da reserva: estornos de ciclos anteriores NÃO diminuem a franquia do ciclo novo.
   */
  static async releaseDispatchQuota(params: {
    userId: string;
    dispatchKey?: string | undefined;
    reservationId?: string | undefined;
  }): Promise<void> {
    const { userId, dispatchKey, reservationId } = params;

    if (!reservationId && !dispatchKey) {
      await this.refundDispatchQuota(userId);
      return;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Localiza a reserva pendente exata
      let reservation: any = null;
      if (reservationId) {
        reservation = await tx.dispatchReservation.findUnique({
          where: { id: reservationId }
        });
      } else if (dispatchKey) {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { cycleResetAt: true, createdAt: true }
        });
        const currentCycleKey = user ? getCycleKey(user) : undefined;
        reservation = await tx.dispatchReservation.findFirst({
          where: {
            userId,
            dispatchKey: dispatchKey!,
            ...(currentCycleKey ? { cycleKey: currentCycleKey } : {}),
            status: 'RESERVED'
          },
          orderBy: { createdAt: 'desc' }
        });
      }

      if (!reservation || reservation.status !== 'RESERVED') {
        // Já confirmada ou já liberada (proteção contra estorno repetido ou incerto)
        return;
      }

      // 2. Transição atômica condicional para RELEASED
      const updateResult = await tx.dispatchReservation.updateMany({
        where: {
          id: reservation.id,
          status: 'RESERVED'
        },
        data: {
          status: 'RELEASED'
        }
      });

      if (updateResult.count === 0) return;

      // 3. Verifica se o ciclo da reserva corresponde ao ciclo vigente do usuário
      const user = await tx.user.findUnique({
        where: { id: reservation.userId },
        select: { id: true, cycleResetAt: true, createdAt: true, dispatchesUsedInCycle: true }
      });

      if (!user) return;

      const currentCycleKey = getCycleKey(user);

      // Só estorna do contador do ciclo atual se a reserva pertencer ao ciclo ATUAL (Item 4)
      if (reservation.cycleKey === currentCycleKey) {
        await tx.$executeRaw`
          UPDATE "User"
          SET "dispatchesUsedInCycle" = GREATEST(0, "dispatchesUsedInCycle" - 1)
          WHERE "id" = ${reservation.userId}
        `;
      } else {
        console.log(`[QUOTA RELEASE] Reserva ${reservation.id} pertencente ao ciclo anterior (${reservation.cycleKey}) liberada após renovação para o ciclo (${currentCycleKey}). Contador do novo ciclo mantido intacto.`);
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
   * Suporta transação externa para garantir atomicidade com atualizações da assinatura.
   */
  static async resetCycleDispatches(userId: string, newQuota?: number, tx?: Prisma.TransactionClient): Promise<void> {
    const data: any = {
      dispatchesUsedInCycle: 0,
      cycleResetAt: new Date(),
    };

    if (newQuota !== undefined) {
      data.monthlyDispatchQuota = newQuota;
    }

    const db = tx || prisma;
    await db.user.update({
      where: { id: userId },
      data,
    });
  }
}
