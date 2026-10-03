import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { isUserUnlimited, isLegacyPlan } from '../config/plans';
import { isSubscriptionActive } from './SubscriptionManager';

export class InsufficientCreditsError extends Error {
  constructor(message = 'Saldo de créditos insuficiente para realizar esta operação.') {
    super(message);
    this.name = 'InsufficientCreditsError';
  }
}

export class WalletSuspendedError extends Error {
  constructor(message = 'Assinatura inativa. Reative seu plano para utilizar créditos.') {
    super(message);
    this.name = 'WalletSuspendedError';
  }
}

export interface WalletSummary {
  walletId: string;
  userId: string;
  totalBalance: number;
  monthlyBalance: number;
  purchasedBalance: number;
  reservedBalance: number;
  availableBalance: number;
  monthlyExpiresAt: Date | null;
  isUnlimited: boolean;
  isLegacy: boolean;
  isActiveSubscription: boolean;
  planId: string | null;
  dispatchesUsedInCycle: number;
  monthlyDispatchQuota: number;
}

export class CreditWalletService {
  /**
   * Obtém ou inicializa atomicamente a carteira de créditos do usuário.
   */
  static async getOrCreateWallet(userId: string, tx?: Prisma.TransactionClient): Promise<any> {
    const client = tx || prisma;
    if (!client.creditWallet?.findUnique) return null;

    let wallet = await client.creditWallet.findUnique({
      where: { userId }
    });

    if (!wallet && client.creditWallet?.upsert) {
      wallet = await client.creditWallet.upsert({
        where: { userId },
        create: {
          userId,
          monthlyBalance: 0,
          purchasedBalance: 0,
          reservedBalance: 0,
        },
        update: {}
      });
    }

    return wallet;
  }

  /**
   * Retorna o resumo fiel dos saldos do usuário com verificação de ciclo.
   * Modelo contábil de Hold: availableBalance = (effectiveMonthly + purchasedBalance) - reservedBalance.
   */
  static async getWalletSummary(userId: string): Promise<WalletSummary> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true }
    });

    if (!user) {
      throw new Error(`Usuário não encontrado: ${userId}`);
    }

    const isAdmin = isUserUnlimited(user);
    const isLegacy = isLegacyPlan(user.planId);
    const isActive = isSubscriptionActive(user);

    const wallet = user.wallet || (await this.getOrCreateWallet(userId));

    // Validação de expiração do saldo mensal
    const isMonthlyExpired = Boolean(
      wallet.monthlyExpiresAt && new Date(wallet.monthlyExpiresAt) < new Date()
    );
    const effectiveMonthly = isMonthlyExpired ? 0 : wallet.monthlyBalance;

    const totalBalance = effectiveMonthly + wallet.purchasedBalance;
    const availableBalance = Math.max(0, totalBalance - wallet.reservedBalance);

    return {
      walletId: wallet.id,
      userId: user.id,
      totalBalance,
      monthlyBalance: effectiveMonthly,
      purchasedBalance: wallet.purchasedBalance,
      reservedBalance: wallet.reservedBalance,
      availableBalance,
      monthlyExpiresAt: wallet.monthlyExpiresAt,
      isUnlimited: isAdmin,
      isLegacy,
      isActiveSubscription: isActive,
      planId: user.planId || (isLegacy ? 'LEGACY_DAVI' : null),
      dispatchesUsedInCycle: user.dispatchesUsedInCycle,
      monthlyDispatchQuota: user.monthlyDispatchQuota,
    };
  }

  /**
   * Reserva créditos para operação assíncrona com persistência, hold contábil e idempotência.
   * Não debita antecipadamente monthlyBalance/purchasedBalance (modelo Clean Hold).
   * Suporta transação externa via prismaClientOrTx.
   */
  static async reserveCredits(
    params: {
      userId: string;
      amount: number;
      idempotencyKey: string;
      sourceType: 'COMPANY_SEARCH' | 'AI_ASSISTANT';
      sourceId?: string;
      description?: string;
      metadata?: Record<string, any>;
    },
    prismaClientOrTx?: Prisma.TransactionClient
  ): Promise<{
    success: boolean;
    reservationId: string;
    reservedAmount: number;
    isUnlimited?: boolean;
    isIdempotent?: boolean;
  }> {
    const { userId, amount, idempotencyKey, sourceType, sourceId, description, metadata } = params;

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new Error('Chave de idempotência obrigatória para efetuar reserva de créditos.');
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('A quantidade de créditos a reservar deve ser um número inteiro positivo.');
    }

    if (amount > 1000) {
      throw new Error('Quantidade de créditos excede o limite operacional de 1.000 por reserva.');
    }

    const execute = async (tx: Prisma.TransactionClient) => {
      // 1. Lock consultivo transacional exclusivo por usuário
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`;

      // 2. Verificação de idempotência estrita
      const existingReservation = await tx.creditReservation.findUnique({
        where: { idempotencyKey }
      });

      if (existingReservation) {
        if (existingReservation.userId !== userId) {
          throw new Error('Chave de idempotência já utilizada por outro usuário.');
        }

        // Se a reserva já existe e está PENDING, é uma retenção válida ativa idempotente
        if (existingReservation.status === 'PENDING') {
          return {
            success: true,
            reservationId: existingReservation.id,
            reservedAmount: existingReservation.amount,
            isUnlimited: existingReservation.amount === 0,
            isIdempotent: true
          };
        }

        // Se a reserva já foi liquidada (SETTLED) ou expirada, não pode ser reutilizada
        if (existingReservation.status === 'SETTLED' || existingReservation.status === 'EXPIRED') {
          throw new Error(`Chave de idempotência já utilizada por uma reserva finalizada (${existingReservation.status}).`);
        }

        // Se a reserva estiver RELEASED:
        // Não permitir reativação se a reserva pertencer a uma operação terminal (ex: IA concluída ou com falha)
        if (existingReservation.status === 'RELEASED') {
          const terminalOp = await tx.aiOperation.findFirst({
            where: {
              OR: [
                { idempotencyKey },
                { reservationId: existingReservation.id }
              ],
              status: { in: ['COMPLETED', 'FAILED', 'PARTIAL'] }
            }
          });

          if (terminalOp) {
            throw new Error(`Não é permitido reativar reserva pertencente a uma operação terminal (${terminalOp.status}).`);
          }
        }
        // O fluxo continua abaixo para validar disponibilidade real de saldo e reservar atomicamente.
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { wallet: true }
      });

      if (!user) throw new Error('Usuário não encontrado.');

      let wallet = user.wallet;
      if (!wallet) {
        wallet = await tx.creditWallet.create({
          data: { userId, monthlyBalance: 0, purchasedBalance: 0, reservedBalance: 0 }
        });
      }

      // 3. Administradores possuem isenção comercial, mas registram reserva para rastreabilidade
      if (isUserUnlimited(user)) {
        const adminReservation = existingReservation
          ? await tx.creditReservation.update({
              where: { id: existingReservation.id },
              data: {
                status: 'PENDING',
                releasedAt: null,
                settledAt: null,
                amount: 0,
                monthlyAmount: 0,
                purchasedAmount: 0,
                monthlyExpiresAt: null,
                description: description || `Reativação administrativa (${sourceType})`,
                metadata: JSON.stringify({ isUnlimited: true, requestedAmount: amount, ...metadata })
              }
            })
          : await tx.creditReservation.create({
              data: {
                walletId: wallet.id,
                userId,
                idempotencyKey,
                amount: 0,
                monthlyAmount: 0,
                purchasedAmount: 0,
                monthlyExpiresAt: null,
                status: 'PENDING',
                sourceType,
                sourceId: sourceId || null,
                description: description || `Reserva administrativa (${sourceType})`,
                metadata: JSON.stringify({ isUnlimited: true, requestedAmount: amount, ...metadata })
              }
            });

        return {
          success: true,
          reservationId: adminReservation.id,
          reservedAmount: 0,
          isUnlimited: true
        };
      }

      // 5. Validação de assinatura ativa para novos planos
      if (!isLegacyPlan(user.planId) && !isSubscriptionActive(user)) {
        throw new WalletSuspendedError();
      }

      // 6. Expiração do saldo mensal
      const isMonthlyExpired = Boolean(
        wallet.monthlyExpiresAt && new Date(wallet.monthlyExpiresAt) < new Date()
      );
      const effectiveMonthly = isMonthlyExpired ? 0 : wallet.monthlyBalance;

      // 7. Cálculo das reservas pendentes comprometendo cada compartimento de saldo (Item 1)
      let committedMonthly = 0;
      let committedPurchased = 0;

      if (typeof tx.creditReservation?.aggregate === 'function') {
        const pendingCycleMonthlyResult = await tx.creditReservation.aggregate({
          where: {
            walletId: wallet.id,
            status: 'PENDING',
            monthlyExpiresAt: wallet.monthlyExpiresAt,
          },
          _sum: {
            monthlyAmount: true,
          }
        });
        committedMonthly = pendingCycleMonthlyResult?._sum?.monthlyAmount || 0;

        const pendingPurchasedResult = await tx.creditReservation.aggregate({
          where: {
            walletId: wallet.id,
            status: 'PENDING',
          },
          _sum: {
            purchasedAmount: true,
          }
        });
        committedPurchased = pendingPurchasedResult?._sum?.purchasedAmount || 0;
      } else {
        committedMonthly = Math.min(effectiveMonthly, wallet.reservedBalance);
        committedPurchased = Math.max(0, wallet.reservedBalance - committedMonthly);
      }

      const availableMonthly = Math.max(0, effectiveMonthly - committedMonthly);
      const availablePurchased = Math.max(0, wallet.purchasedBalance - committedPurchased);
      const totalAvailable = availableMonthly + availablePurchased;

      // 8. Clientes legados não possuem créditos inclusos: exigem saldo comprado livre
      if (isLegacyPlan(user.planId)) {
        if (availablePurchased < amount) {
          throw new InsufficientCreditsError(
            'O plano legado não possui créditos inclusos para Busca Integrada ou IA. Adquira um pacote avulso de créditos ou realize upgrade de plano.'
          );
        }
      }

      if (totalAvailable < amount) {
        throw new InsufficientCreditsError(
          `Saldo insuficiente. Disponível: ${totalAvailable} créditos (Mensal: ${availableMonthly}, Comprado: ${availablePurchased}); Necessário: ${amount} créditos.`
        );
      }

      // 9. Alocação de hold respeitando rigorosamente a disponibilidade restante de cada origem
      let monthlyToHold = 0;
      let purchasedToHold = 0;

      if (isLegacyPlan(user.planId)) {
        monthlyToHold = 0;
        purchasedToHold = amount;
      } else {
        monthlyToHold = Math.min(availableMonthly, amount);
        purchasedToHold = amount - monthlyToHold;
      }

      // 9. Atualização atômica da carteira: apenas incrementa reservedBalance
      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          reservedBalance: { increment: amount }
        }
      });

      // 10. Criação ou reativação persistida com verificação atômica de saldo
      const reservation = existingReservation
        ? await tx.creditReservation.update({
            where: { id: existingReservation.id },
            data: {
              amount,
              monthlyAmount: monthlyToHold,
              purchasedAmount: purchasedToHold,
              monthlyExpiresAt: wallet.monthlyExpiresAt,
              status: 'PENDING',
              releasedAt: null,
              settledAt: null,
              description: description || `Reativação de reserva de ${amount} créditos para ${sourceType}`,
              metadata: metadata ? JSON.stringify(metadata) : null
            }
          })
        : await tx.creditReservation.create({
            data: {
              walletId: wallet.id,
              userId,
              idempotencyKey,
              amount,
              monthlyAmount: monthlyToHold,
              purchasedAmount: purchasedToHold,
              monthlyExpiresAt: wallet.monthlyExpiresAt,
              status: 'PENDING',
              sourceType,
              sourceId: sourceId || null,
              description: description || `Reserva de ${amount} créditos para ${sourceType}`,
              metadata: metadata ? JSON.stringify(metadata) : null
            }
          });

      // 11. Auditoria contábil da retenção temporária (amount: 0 para evitar dupla contabilidade no extrato)
      await tx.creditTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: 0,
          type: 'RESERVATION_HOLD',
          balanceType: monthlyToHold > 0 && purchasedToHold > 0 ? 'MIXED' : monthlyToHold > 0 ? 'MONTHLY' : 'PURCHASED',
          monthlyAmount: 0,
          purchasedAmount: 0,
          sourceType,
          sourceId: reservation.id,
          description: `Retenção de reserva #${reservation.id.slice(0, 8)} (${sourceType}: ${amount} créditos)`,
          metadata: JSON.stringify({
            reservationId: reservation.id,
            heldAmount: amount,
            monthlyToHold,
            purchasedToHold,
            idempotencyKey
          })
        }
      });

      return {
        success: true,
        reservationId: reservation.id,
        reservedAmount: amount
      };
    };

    if (prismaClientOrTx) {
      return await execute(prismaClientOrTx);
    }
    return await prisma.$transaction(execute, { timeout: 15000 });
  }

  /**
   * Liquida uma reserva existente debitando estritamente o valor consumido
   * e liberando o hold da carteira de forma atômica e idempotente.
   * Suporta transação compartilhada via prismaClientOrTx.
   */
  static async settleReservation(
    params: {
      reservationId: string;
      actualConsumedAmount: number;
      description?: string;
      metadata?: Record<string, any>;
    },
    prismaClientOrTx?: Prisma.TransactionClient
  ): Promise<{
    success: boolean;
    consumedAmount: number;
    releasedAmount: number;
    isUnlimited?: boolean;
    isIdempotent?: boolean;
  }> {
    const { reservationId, actualConsumedAmount, description, metadata } = params;

    if (!reservationId) {
      throw new Error('Identificador da reserva é obrigatório para liquidação.');
    }

    if (!Number.isInteger(actualConsumedAmount) || actualConsumedAmount < 0) {
      throw new Error('A quantidade consumida deve ser um número inteiro maior ou igual a zero.');
    }

    const execute = async (tx: Prisma.TransactionClient) => {
      // 1. Transição condicional atômica: só quem transicionar de PENDING para SETTLED executa a movimentação
      const updateResult = await tx.creditReservation.updateMany({
        where: {
          id: reservationId,
          status: 'PENDING'
        },
        data: {
          status: 'SETTLED',
          consumedAmount: actualConsumedAmount,
          settledAt: new Date()
        }
      });

      // 2. Se não atualizou nenhuma linha, a reserva já foi liquidada, liberada ou não existe
      if (updateResult.count === 0) {
        const existing = await tx.creditReservation.findUnique({
          where: { id: reservationId }
        });

        if (!existing) {
          throw new Error(`Reserva não encontrada: ${reservationId}`);
        }

        if (existing.status === 'SETTLED') {
          const consumed = existing.consumedAmount || 0;
          const released = Math.max(0, existing.amount - consumed);
          return {
            success: true,
            consumedAmount: consumed,
            releasedAmount: released,
            isUnlimited: existing.amount === 0,
            isIdempotent: true
          };
        }

        throw new Error(`Reserva em estado inválido para liquidação: ${existing.status}.`);
      }

      // 3. Lê os dados da reserva que acabamos de transicionar atomicamente
      const reservation = await tx.creditReservation.findUnique({
        where: { id: reservationId }
      });
      if (!reservation) {
        throw new Error(`Reserva não encontrada após transição: ${reservationId}`);
      }

      // Advisory lock por segurança adicional dentro do escopo transacional
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${reservation.userId}`}))`;

      // Se for reserva administrativa (amount 0), encerra
      if (reservation.amount === 0) {
        return {
          success: true,
          consumedAmount: actualConsumedAmount,
          releasedAmount: 0,
          isUnlimited: true
        };
      }

      if (actualConsumedAmount > reservation.amount) {
        throw new Error(
          `Consumo real (${actualConsumedAmount}) não pode exceder o montante reservado (${reservation.amount}).`
        );
      }

      const wallet = await tx.creditWallet.findUnique({
        where: { id: reservation.walletId }
      });
      if (!wallet) throw new Error('Carteira não encontrada.');

      // 4. Apuração do consumo por compartimento
      const consumedFromMonthly = Math.min(reservation.monthlyAmount, actualConsumedAmount);
      const consumedFromPurchased = actualConsumedAmount - consumedFromMonthly;
      const releasedAmount = Math.max(0, reservation.amount - actualConsumedAmount);

      // 5. Verificação de expiração do ciclo original da reserva (Item 6)
      const isOriginalCycleExpired = Boolean(
        reservation.monthlyExpiresAt && new Date(reservation.monthlyExpiresAt) < new Date()
      );
      const hasRenewedNewCycle = Boolean(
        wallet.monthlyExpiresAt &&
        reservation.monthlyExpiresAt &&
        new Date(wallet.monthlyExpiresAt) > new Date(reservation.monthlyExpiresAt)
      );

      // 6. Atualização atômica da carteira:
      // - Desfaz o hold integral: reservedBalance decrementado por reservation.amount
      // - Se o ciclo da reserva NÃO expirou (ou ainda não renovou), debita consumedFromMonthly
      // - purchasedBalance debita consumedFromPurchased
      const walletUpdateData: any = {
        reservedBalance: { decrement: reservation.amount }
      };

      if (!hasRenewedNewCycle && consumedFromMonthly > 0) {
        walletUpdateData.monthlyBalance = { decrement: consumedFromMonthly };
      }
      if (consumedFromPurchased > 0) {
        walletUpdateData.purchasedBalance = { decrement: consumedFromPurchased };
      }

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: walletUpdateData
      });

      // 7. Registro de consumo definitivo no extrato
      if (actualConsumedAmount > 0) {
        await tx.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId: reservation.userId,
            amount: -actualConsumedAmount,
            type: 'CONSUMPTION',
            balanceType: consumedFromMonthly > 0 && consumedFromPurchased > 0 ? 'MIXED' : consumedFromMonthly > 0 ? 'MONTHLY' : 'PURCHASED',
            monthlyAmount: -consumedFromMonthly,
            purchasedAmount: -consumedFromPurchased,
            sourceType: reservation.sourceType,
            sourceId: reservation.sourceId,
            description: description || `Consumo de créditos (${reservation.sourceType})`,
            metadata: JSON.stringify({
              reservationId: reservation.id,
              actualConsumed: actualConsumedAmount,
              consumedFromMonthly,
              consumedFromPurchased,
              ...metadata
            })
          }
        });
      }

      // 8. Se o ciclo mensal original expirou e sobrou saldo mensal não consumido, audita a expiração
      const expiredMonthly = (reservation.monthlyAmount - consumedFromMonthly);
      if (isOriginalCycleExpired && expiredMonthly > 0) {
        await tx.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId: reservation.userId,
            amount: 0,
            type: 'EXPIRATION',
            balanceType: 'MONTHLY',
            monthlyAmount: 0,
            purchasedAmount: 0,
            sourceType: reservation.sourceType,
            sourceId: reservation.id,
            description: `Créditos mensais não consumidos da reserva #${reservation.id.slice(0, 8)} expirados com o ciclo original (${expiredMonthly} créditos)`,
            metadata: JSON.stringify({
              reservationId: reservation.id,
              expiredMonthlyCredits: expiredMonthly,
              originalMonthlyExpiresAt: reservation.monthlyExpiresAt
            })
          }
        });
      }

      // 9. Registro de liberação do hold restante no extrato (amount: 0 para consistência contábil)
      if (releasedAmount > 0) {
        await tx.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId: reservation.userId,
            amount: 0,
            type: 'RESERVATION_RELEASE',
            balanceType: reservation.monthlyAmount > 0 && reservation.purchasedAmount > 0 ? 'MIXED' : reservation.monthlyAmount > 0 ? 'MONTHLY' : 'PURCHASED',
            monthlyAmount: 0,
            purchasedAmount: 0,
            sourceType: reservation.sourceType,
            sourceId: reservation.id,
            description: `Liberação de hold residual da reserva #${reservation.id.slice(0, 8)} (${releasedAmount} créditos liberados)`,
            metadata: JSON.stringify({
              reservationId: reservation.id,
              reservedAmount: reservation.amount,
              consumedAmount: actualConsumedAmount,
              releasedAmount
            })
          }
        });
      }

      return {
        success: true,
        consumedAmount: actualConsumedAmount,
        releasedAmount
      };
    };

    if (prismaClientOrTx) {
      return await execute(prismaClientOrTx);
    }
    return await prisma.$transaction(execute, { timeout: 15000 });
  }

  /**
   * Libera integralmente uma reserva ativa devolvendo o hold de créditos.
   * Utilizado quando uma operação externa falha ou é cancelada.
   * Suporta transação compartilhada via prismaClientOrTx.
   */
  static async releaseReservation(
    params: {
      reservationId: string;
      reason?: string;
    },
    prismaClientOrTx?: Prisma.TransactionClient
  ): Promise<{
    success: boolean;
    releasedAmount: number;
    isUnlimited?: boolean;
    isIdempotent?: boolean;
  }> {
    const { reservationId, reason } = params;

    if (!reservationId) {
      throw new Error('Identificador da reserva é obrigatório para liberação.');
    }

    const execute = async (tx: Prisma.TransactionClient) => {
      // 1. Transição atômica condicional no banco de dados
      const updateResult = await tx.creditReservation.updateMany({
        where: {
          id: reservationId,
          status: 'PENDING'
        },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
          ...(reason ? { description: reason } : {})
        }
      });

      if (updateResult.count === 0) {
        const existing = await tx.creditReservation.findUnique({
          where: { id: reservationId }
        });

        if (!existing) {
          throw new Error(`Reserva não encontrada: ${reservationId}`);
        }

        if (existing.status === 'RELEASED') {
          return {
            success: true,
            releasedAmount: existing.amount,
            isUnlimited: existing.amount === 0,
            isIdempotent: true
          };
        }

        throw new Error(`Reserva em estado inválido para liberação: ${existing.status}.`);
      }

      const reservation = await tx.creditReservation.findUnique({
        where: { id: reservationId }
      });
      if (!reservation) {
        throw new Error(`Reserva não encontrada após transição: ${reservationId}`);
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${reservation.userId}`}))`;

      if (reservation.amount === 0) {
        return {
          success: true,
          releasedAmount: 0,
          isUnlimited: true
        };
      }

      const wallet = await tx.creditWallet.findUnique({
        where: { id: reservation.walletId }
      });
      if (!wallet) throw new Error('Carteira não encontrada.');

      // 2. Modelo Clean Hold: apenas decrementa reservedBalance (hold liberado)
      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          reservedBalance: { decrement: reservation.amount }
        }
      });

      // 3. Verifica expiração do ciclo original
      const isOriginalCycleExpired = Boolean(
        reservation.monthlyExpiresAt && new Date(reservation.monthlyExpiresAt) < new Date()
      );

      if (isOriginalCycleExpired && reservation.monthlyAmount > 0) {
        await tx.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId: reservation.userId,
            amount: 0,
            type: 'EXPIRATION',
            balanceType: 'MONTHLY',
            monthlyAmount: 0,
            purchasedAmount: 0,
            sourceType: reservation.sourceType,
            sourceId: reservation.id,
            description: `Créditos mensais da reserva cancelada #${reservation.id.slice(0, 8)} expirados com o ciclo original (${reservation.monthlyAmount} créditos)`,
            metadata: JSON.stringify({
              reservationId: reservation.id,
              expiredMonthlyCredits: reservation.monthlyAmount,
              originalMonthlyExpiresAt: reservation.monthlyExpiresAt
            })
          }
        });
      }

      // 4. Registro de liberação de hold no extrato
      await tx.creditTransaction.create({
        data: {
          walletId: wallet.id,
          userId: reservation.userId,
          amount: 0,
          type: 'RESERVATION_RELEASE',
          balanceType: reservation.monthlyAmount > 0 && reservation.purchasedAmount > 0 ? 'MIXED' : reservation.monthlyAmount > 0 ? 'MONTHLY' : 'PURCHASED',
          monthlyAmount: 0,
          purchasedAmount: 0,
          sourceType: reservation.sourceType,
          sourceId: reservation.id,
          description: `Liberação de reserva #${reservation.id.slice(0, 8)}: ${reason || 'Operação cancelada'}`,
          metadata: JSON.stringify({
            reservationId: reservation.id,
            reason,
            releasedAmount: reservation.amount
          })
        }
      });

      return {
        success: true,
        releasedAmount: reservation.amount
      };
    };

    if (prismaClientOrTx) {
      return await execute(prismaClientOrTx);
    }
    return await prisma.$transaction(execute, { timeout: 15000 });
  }

  /**
   * Concede créditos mensais no início ou renovação de ciclo da assinatura.
   * Não cumulativo: substitui o saldo mensal anterior e atualiza a data de expiração.
   * Suporta transação externa tx para atomicidade global.
   */
  static async grantMonthlyCredits(params: {
    userId: string;
    amount: number;
    expiresAt: Date;
    idempotencyKey?: string | undefined;
    description?: string | undefined;
    tx?: Prisma.TransactionClient | undefined;
  }): Promise<{ success: boolean; grantedAmount: number }> {
    const { userId, amount, expiresAt, idempotencyKey, description, tx: providedTx } = params;

    const executeGrant = async (tx: Prisma.TransactionClient) => {
      if (!providedTx) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`;
      }

      if (idempotencyKey && tx.creditTransaction?.findUnique) {
        const existingTx = await tx.creditTransaction.findUnique({
          where: { idempotencyKey }
        });
        if (existingTx) {
          console.log(`[WALLET IDEMPOTENT] Concessão mensal idempotente para ${userId}.`);
          return { success: true, grantedAmount: existingTx.amount };
        }
      }

      let wallet: any = null;
      if (tx.creditWallet?.findUnique) {
        wallet = await tx.creditWallet.findUnique({ where: { userId } });
        if (!wallet && tx.creditWallet?.create) {
          wallet = await tx.creditWallet.create({
            data: { userId, monthlyBalance: 0, purchasedBalance: 0, reservedBalance: 0 }
          });
        }
      }

      // Substitui o saldo mensal anterior e atualiza validade
      if (wallet && tx.creditWallet?.update) {
        await tx.creditWallet.update({
          where: { id: wallet.id },
          data: {
            monthlyBalance: amount,
            monthlyExpiresAt: expiresAt
          }
        });
      }

      if (wallet && tx.creditTransaction?.create) {
        await tx.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            amount,
            type: 'MONTHLY_GRANT',
            balanceType: 'MONTHLY',
            monthlyAmount: amount,
            purchasedAmount: 0,
            sourceType: 'SUBSCRIPTION_RENEWAL',
            idempotencyKey: idempotencyKey || null,
            description: description || `Créditos mensais do ciclo (válidos até ${expiresAt.toLocaleDateString('pt-BR')})`,
            metadata: JSON.stringify({ grantedAmount: amount, expiresAt })
          }
        });
      }

      return { success: true, grantedAmount: amount };
    };

    if (providedTx) {
      return await executeGrant(providedTx);
    }
    return await prisma.$transaction(executeGrant, { timeout: 15000 });
  }

  /**
   * Concede créditos comprados via recarga avulsa.
   * Acumulam no purchasedBalance e nunca expiram.
   * Suporta transação externa tx para atomicidade global.
   */
  static async grantPurchasedCredits(params: {
    userId: string;
    amount: number;
    orderId?: string | undefined;
    idempotencyKey?: string | undefined;
    description?: string | undefined;
    priceCents?: number | undefined;
    tx?: Prisma.TransactionClient | undefined;
  }): Promise<{ success: boolean; newPurchasedBalance: number }> {
    const { userId, amount, orderId, idempotencyKey, description, priceCents, tx: providedTx } = params;

    const executeGrant = async (tx: Prisma.TransactionClient) => {
      if (!providedTx) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`;
      }

      if (idempotencyKey && tx.creditTransaction?.findUnique) {
        const existingTx = await tx.creditTransaction.findUnique({
          where: { idempotencyKey }
        });
        if (existingTx) {
          console.log(`[WALLET IDEMPOTENT] Recarga avulsa idempotente para ${userId} pedido ${orderId}.`);
          const w = tx.creditWallet?.findUnique ? await tx.creditWallet.findUnique({ where: { userId } }) : null;
          return { success: true, newPurchasedBalance: w?.purchasedBalance || 0 };
        }
      }

      let wallet: any = null;
      if (tx.creditWallet?.findUnique) {
        wallet = await tx.creditWallet.findUnique({ where: { userId } });
        if (!wallet && tx.creditWallet?.create) {
          wallet = await tx.creditWallet.create({
            data: { userId, monthlyBalance: 0, purchasedBalance: 0, reservedBalance: 0 }
          });
        }
      }

      let updatedPurchasedBalance = amount;
      if (wallet && tx.creditWallet?.update) {
        const updatedWallet = await tx.creditWallet.update({
          where: { id: wallet.id },
          data: {
            purchasedBalance: { increment: amount }
          }
        });
        updatedPurchasedBalance = updatedWallet.purchasedBalance;
      }

      if (wallet && tx.creditTransaction?.create) {
        await tx.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            amount,
            type: 'PURCHASE_GRANT',
            balanceType: 'PURCHASED',
            monthlyAmount: 0,
            purchasedAmount: amount,
            sourceType: 'CREDIT_PURCHASE',
            sourceId: orderId || null,
            idempotencyKey: idempotencyKey || null,
            description: description || `Recarga avulsa de ${amount} créditos`,
            metadata: JSON.stringify({
              amount,
              orderId,
              priceCents,
              newPurchasedBalance: updatedPurchasedBalance
            })
          }
        });
      }

      return { success: true, newPurchasedBalance: updatedPurchasedBalance };
    };

    if (providedTx) {
      return await executeGrant(providedTx);
    }
    return await prisma.$transaction(executeGrant, { timeout: 15000 });
  }

  /**
   * Estorna créditos comprados em caso de reembolso ou chargeback.
   * Não deixa o saldo negativo caso o usuário já tenha consumido parte dos créditos.
   * Idempotente por idempotencyKey e suporta tx externo.
   */
  static async revokePurchasedCredits(params: {
    userId: string;
    amount: number;
    orderId?: string | undefined;
    idempotencyKey?: string | undefined;
    description?: string | undefined;
    tx?: Prisma.TransactionClient | undefined;
  }): Promise<{ success: boolean; revokedAmount: number; newPurchasedBalance: number }> {
    const { userId, amount, orderId, idempotencyKey, description, tx: providedTx } = params;

    const executeRevoke = async (tx: Prisma.TransactionClient) => {
      if (!providedTx) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`;
      }

      if (idempotencyKey && tx.creditTransaction?.findUnique) {
        const existingTx = await tx.creditTransaction.findUnique({
          where: { idempotencyKey }
        });
        if (existingTx) {
          console.log(`[WALLET IDEMPOTENT] Estorno de recarga já processado anteriormente para ${userId}.`);
          const w = tx.creditWallet?.findUnique ? await tx.creditWallet.findUnique({ where: { userId } }) : null;
          return {
            success: true,
            revokedAmount: Math.abs(existingTx.purchasedAmount || existingTx.amount),
            newPurchasedBalance: w?.purchasedBalance || 0
          };
        }
      }

      let wallet: any = null;
      if (tx.creditWallet?.findUnique) {
        wallet = await tx.creditWallet.findUnique({ where: { userId } });
      }
      if (!wallet) {
        return { success: true, revokedAmount: 0, newPurchasedBalance: 0 };
      }

      // Trata explicitamente créditos já consumidos: estorna até o limite do saldo sem corromper ou negativar
      const revokedAmount = Math.max(0, Math.min(wallet.purchasedBalance, amount));
      const newPurchasedBalance = wallet.purchasedBalance - revokedAmount;

      if (tx.creditWallet?.update) {
        await tx.creditWallet.update({
          where: { id: wallet.id },
          data: {
            purchasedBalance: newPurchasedBalance
          }
        });
      }

      if (tx.creditTransaction?.create) {
        await tx.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            amount: -revokedAmount,
            type: 'REFUND_REVOCATION',
            balanceType: 'PURCHASED',
            monthlyAmount: 0,
            purchasedAmount: -revokedAmount,
            sourceType: 'CREDIT_REFUND',
            sourceId: orderId || null,
            idempotencyKey: idempotencyKey || null,
            description: description || `Estorno por reembolso/disputa de recarga (${revokedAmount} créditos revogados)`,
            metadata: JSON.stringify({
              originalRequestedAmount: amount,
              actuallyRevokedAmount: revokedAmount,
              previousPurchasedBalance: wallet.purchasedBalance,
              newPurchasedBalance,
              orderId
            })
          }
        });
      }

      return { success: true, revokedAmount, newPurchasedBalance };
    };

    if (providedTx) {
      return await executeRevoke(providedTx);
    }
    return await prisma.$transaction(executeRevoke, { timeout: 15000 });
  }

  /**
   * Revoga créditos mensais do ciclo por cancelamento/reembolso da assinatura.
   */
  static async revokeMonthlyCredits(params: {
    userId: string;
    idempotencyKey?: string | undefined;
    description?: string | undefined;
    tx?: Prisma.TransactionClient | undefined;
  }): Promise<{ success: boolean; revokedAmount: number }> {
    const { userId, idempotencyKey, description, tx: providedTx } = params;

    const executeRevoke = async (tx: Prisma.TransactionClient) => {
      if (!providedTx) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`;
      }

      if (idempotencyKey && tx.creditTransaction?.findUnique) {
        const existingTx = await tx.creditTransaction.findUnique({
          where: { idempotencyKey }
        });
        if (existingTx) {
          return { success: true, revokedAmount: Math.abs(existingTx.monthlyAmount || existingTx.amount) };
        }
      }

      let wallet: any = null;
      if (tx.creditWallet?.findUnique) {
        wallet = await tx.creditWallet.findUnique({ where: { userId } });
      }
      if (!wallet || wallet.monthlyBalance <= 0) {
        return { success: true, revokedAmount: 0 };
      }

      const revokedAmount = wallet.monthlyBalance;
      if (tx.creditWallet?.update) {
        await tx.creditWallet.update({
          where: { id: wallet.id },
          data: {
            monthlyBalance: 0,
            monthlyExpiresAt: new Date()
          }
        });
      }

      if (tx.creditTransaction?.create) {
        await tx.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            amount: -revokedAmount,
            type: 'EXPIRATION',
            balanceType: 'MONTHLY',
            monthlyAmount: -revokedAmount,
            purchasedAmount: 0,
            sourceType: 'SUBSCRIPTION_RENEWAL',
            idempotencyKey: idempotencyKey || null,
            description: description || 'Revogação de créditos mensais por encerramento/reembolso da assinatura',
            metadata: JSON.stringify({ revokedMonthlyAmount: revokedAmount })
          }
        });
      }

      return { success: true, revokedAmount };
    };

    if (providedTx) {
      return await executeRevoke(providedTx);
    }
    return await prisma.$transaction(executeRevoke, { timeout: 15000 });
  }

  /**
   * Ajuste administrativo manual de saldo com auditoria e justificativa obrigatória.
   */
  static async adminAdjustCredits(params: {
    adminUserId: string;
    targetUserId: string;
    monthlyDelta: number;
    purchasedDelta: number;
    reason: string;
  }): Promise<{ success: boolean; newMonthlyBalance: number; newPurchasedBalance: number }> {
    const { adminUserId, targetUserId, monthlyDelta, purchasedDelta, reason } = params;

    if (!reason || reason.trim().length < 5) {
      throw new Error('Justificativa obrigatória (mínimo de 5 caracteres) para ajuste administrativo.');
    }

    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${targetUserId}`}))`;

      let wallet = await tx.creditWallet.findUnique({ where: { userId: targetUserId } });
      if (!wallet) {
        wallet = await tx.creditWallet.create({
          data: { userId: targetUserId, monthlyBalance: 0, purchasedBalance: 0, reservedBalance: 0 }
        });
      }

      const newMonthly = Math.max(0, wallet.monthlyBalance + monthlyDelta);
      const newPurchased = Math.max(0, wallet.purchasedBalance + purchasedDelta);
      const totalDelta = (newMonthly - wallet.monthlyBalance) + (newPurchased - wallet.purchasedBalance);

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          monthlyBalance: newMonthly,
          purchasedBalance: newPurchased
        }
      });

      await tx.creditTransaction.create({
        data: {
          walletId: wallet.id,
          userId: targetUserId,
          amount: totalDelta,
          type: 'ADMIN_ADJUSTMENT',
          balanceType: monthlyDelta !== 0 && purchasedDelta !== 0 ? 'MIXED' : monthlyDelta !== 0 ? 'MONTHLY' : 'PURCHASED',
          monthlyAmount: monthlyDelta,
          purchasedAmount: purchasedDelta,
          sourceType: 'ADMIN_MANUAL',
          sourceId: adminUserId,
          description: `Ajuste manual administrativo: ${reason}`,
          metadata: JSON.stringify({
            adminUserId,
            reason,
            monthlyDelta,
            purchasedDelta,
            newMonthly,
            newPurchased
          })
        }
      });

      return {
        success: true,
        newMonthlyBalance: newMonthly,
        newPurchasedBalance: newPurchased
      };
    }, { timeout: 15000 });
  }

  /**
   * Consulta o extrato de transações auditáveis com paginação.
   */
  static async getStatement(userId: string, limit = 50, offset = 0) {
    const transactions = await prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
      skip: Math.max(0, offset)
    });

    const total = await prisma.creditTransaction.count({
      where: { userId }
    });

    return {
      transactions,
      total,
      limit,
      offset
    };
  }
}
