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
  planId: string;
  dispatchesUsedInCycle: number;
  monthlyDispatchQuota: number;
}

export class CreditWalletService {
  /**
   * Obtém ou inicializa a carteira de créditos de um usuário.
   */
  static async getOrCreateWallet(userId: string, tx?: Prisma.TransactionClient): Promise<any> {
    const client = tx || prisma;
    let wallet = await client.creditWallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      wallet = await client.creditWallet.create({
        data: {
          userId,
          monthlyBalance: 0,
          purchasedBalance: 0,
          reservedBalance: 0,
        }
      });
    }

    return wallet;
  }

  /**
   * Retorna o resumo completo e discriminado dos saldos do usuário.
   */
  static async getWalletSummary(userId: string): Promise<WalletSummary> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true }
    });

    if (!user) {
      throw new Error(`Usuário não encontrado: ${userId}`);
    }

    const isUnlimited = isUserUnlimited(user);
    const isLegacy = isLegacyPlan(user.planId);
    const isActive = isSubscriptionActive(user);

    const wallet = user.wallet || (await this.getOrCreateWallet(userId));

    if (isUnlimited) {
      return {
        walletId: wallet.id,
        userId: user.id,
        totalBalance: 999999,
        monthlyBalance: 999999,
        purchasedBalance: 999999,
        reservedBalance: 0,
        availableBalance: 999999,
        monthlyExpiresAt: null,
        isUnlimited: true,
        isLegacy: false,
        isActiveSubscription: true,
        planId: user.planId || 'ADMIN_LIFETIME',
        dispatchesUsedInCycle: user.dispatchesUsedInCycle,
        monthlyDispatchQuota: 0, // ilimitado
      };
    }

    if (isLegacy) {
      return {
        walletId: wallet.id,
        userId: user.id,
        totalBalance: 0,
        monthlyBalance: 0,
        purchasedBalance: 0,
        reservedBalance: 0,
        availableBalance: 0,
        monthlyExpiresAt: null,
        isUnlimited: false,
        isLegacy: true,
        isActiveSubscription: isActive,
        planId: 'LEGACY_DAVI',
        dispatchesUsedInCycle: user.dispatchesUsedInCycle,
        monthlyDispatchQuota: 0, // sem restrição de cota nova
      };
    }

    const totalBalance = wallet.monthlyBalance + wallet.purchasedBalance;
    const availableBalance = Math.max(0, totalBalance - wallet.reservedBalance);

    return {
      walletId: wallet.id,
      userId: user.id,
      totalBalance,
      monthlyBalance: wallet.monthlyBalance,
      purchasedBalance: wallet.purchasedBalance,
      reservedBalance: wallet.reservedBalance,
      availableBalance,
      monthlyExpiresAt: wallet.monthlyExpiresAt,
      isUnlimited: false,
      isLegacy: false,
      isActiveSubscription: isActive,
      planId: user.planId || 'START',
      dispatchesUsedInCycle: user.dispatchesUsedInCycle,
      monthlyDispatchQuota: user.monthlyDispatchQuota,
    };
  }

  /**
   * Reserva saldo para operação assíncrona (Hold transacional).
   * Impede gastos concorrentes além do saldo real.
   */
  static async reserveCredits(params: {
    userId: string;
    amount: number;
    sourceType: 'COMPANY_SEARCH' | 'AI_ASSISTANT';
    sourceId?: string;
    description?: string;
  }): Promise<{ success: boolean; reservedAmount: number; reservationId?: string; isBypass?: boolean }> {
    const { userId, amount, sourceType, sourceId, description } = params;

    if (amount <= 0) {
      throw new Error('A quantidade a reservar deve ser maior que zero.');
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Lock transacional por usuário (evita concorrência de reservas simultâneas)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { wallet: true }
      });

      if (!user) throw new Error('Usuário não encontrado.');

      // Administradores e Contas Legadas têm bypass
      if (isUserUnlimited(user) || isLegacyPlan(user.planId)) {
        return { success: true, reservedAmount: 0, isBypass: true };
      }

      // Validação de assinatura ativa para novas operações pagas
      if (!isSubscriptionActive(user)) {
        throw new WalletSuspendedError();
      }

      let wallet = user.wallet;
      if (!wallet) {
        wallet = await tx.creditWallet.create({
          data: { userId, monthlyBalance: 0, purchasedBalance: 0, reservedBalance: 0 }
        });
      }

      const totalBalance = wallet.monthlyBalance + wallet.purchasedBalance;
      const availableBalance = totalBalance - wallet.reservedBalance;

      if (availableBalance < amount) {
        throw new InsufficientCreditsError(
          `Saldo insuficiente. Disponível: ${availableBalance} créditos; Necessário: ${amount} créditos.`
        );
      }

      // Aplica o hold na carteira
      const updatedWallet = await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          reservedBalance: { increment: amount }
        }
      });

      const txRecord = await tx.creditTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: -amount,
          type: 'RESERVATION_HOLD',
          balanceType: 'MIXED',
          sourceType,
          sourceId: sourceId || null,
          description: description || `Reserva de saldo para ${sourceType}`,
          metadata: JSON.stringify({
            reservedAmount: amount,
            remainingReserved: updatedWallet.reservedBalance
          })
        }
      });

      return {
        success: true,
        reservedAmount: amount,
        reservationId: txRecord.id
      };
    }, { timeout: 10000 });
  }

  /**
   * Liquida uma reserva concluindo a cobrança real (Settlement).
   * Prioridade de consumo: Mensais primeiro, Comprados depois.
   * Libera automaticamente qualquer saldo reservado que não tenha sido utilizado.
   */
  static async settleReservation(params: {
    userId: string;
    reservedAmount: number;
    actualConsumedAmount: number;
    sourceType: 'COMPANY_SEARCH' | 'AI_ASSISTANT';
    sourceId?: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<{ success: boolean; consumedAmount: number; releasedAmount: number; isBypass?: boolean }> {
    const { userId, reservedAmount, actualConsumedAmount, sourceType, sourceId, description, metadata } = params;

    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { wallet: true }
      });

      if (!user) throw new Error('Usuário não encontrado.');

      if (isUserUnlimited(user) || isLegacyPlan(user.planId)) {
        return { success: true, consumedAmount: 0, releasedAmount: 0, isBypass: true };
      }

      const wallet = user.wallet;
      if (!wallet) throw new Error('Carteira não encontrada para liquidação.');

      // 1. Libera a reserva anterior
      const newReserved = Math.max(0, wallet.reservedBalance - reservedAmount);

      // 2. Apuração do consumo real com prioridade estrita (mensal -> comprado)
      let fromMonthly = 0;
      let fromPurchased = 0;

      if (actualConsumedAmount > 0) {
        fromMonthly = Math.min(wallet.monthlyBalance, actualConsumedAmount);
        const remainder = actualConsumedAmount - fromMonthly;
        fromPurchased = Math.min(wallet.purchasedBalance, remainder);
      }

      const newMonthly = Math.max(0, wallet.monthlyBalance - fromMonthly);
      const newPurchased = Math.max(0, wallet.purchasedBalance - fromPurchased);

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          monthlyBalance: newMonthly,
          purchasedBalance: newPurchased,
          reservedBalance: newReserved
        }
      });

      // 3. Registra transação de consumo real
      if (actualConsumedAmount > 0) {
        let balanceType = 'MONTHLY';
        if (fromMonthly > 0 && fromPurchased > 0) balanceType = 'MIXED';
        else if (fromPurchased > 0) balanceType = 'PURCHASED';

        await tx.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            amount: -actualConsumedAmount,
            type: 'CONSUMPTION',
            balanceType,
            monthlyAmount: fromMonthly,
            purchasedAmount: fromPurchased,
            sourceType,
            sourceId: sourceId || null,
            description: description || `Consumo de créditos (${sourceType})`,
            metadata: JSON.stringify({
              ...metadata,
              actualConsumed: actualConsumedAmount,
              fromMonthly,
              fromPurchased,
              resultingMonthly: newMonthly,
              resultingPurchased: newPurchased
            })
          }
        });
      }

      // 4. Se a reserva foi maior que o consumo, registra liberação do excedente
      const releasedAmount = Math.max(0, reservedAmount - actualConsumedAmount);
      if (releasedAmount > 0) {
        await tx.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            amount: releasedAmount,
            type: 'RESERVATION_RELEASE',
            balanceType: 'MIXED',
            sourceType,
            sourceId: sourceId || null,
            description: `Liberação de saldo reservado não utilizado (${sourceType})`,
            metadata: JSON.stringify({
              reservedAmount,
              actualConsumedAmount,
              releasedAmount
            })
          }
        });
      }

      return {
        success: true,
        consumedAmount: actualConsumedAmount,
        releasedAmount,
      };
    }, { timeout: 10000 });
  }

  /**
   * Cancela uma reserva integralmente (ex: falha de busca, erro na API externa).
   */
  static async releaseReservation(params: {
    userId: string;
    reservedAmount: number;
    sourceType: 'COMPANY_SEARCH' | 'AI_ASSISTANT';
    sourceId?: string;
    reason?: string;
  }): Promise<{ success: boolean; releasedAmount: number; isBypass?: boolean }> {
    const { userId, reservedAmount, sourceType, sourceId, reason } = params;

    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { wallet: true }
      });

      if (!user) throw new Error('Usuário não encontrado.');

      if (isUserUnlimited(user) || isLegacyPlan(user.planId)) {
        return { success: true, releasedAmount: 0, isBypass: true };
      }

      const wallet = user.wallet;
      if (!wallet) return { success: true, releasedAmount: 0 };

      const newReserved = Math.max(0, wallet.reservedBalance - reservedAmount);

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: { reservedBalance: newReserved }
      });

      await tx.creditTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: reservedAmount,
          type: 'RESERVATION_RELEASE',
          balanceType: 'MIXED',
          sourceType,
          sourceId: sourceId || null,
          description: `Liberação de reserva: ${reason || 'Operação cancelada ou falha'}`,
          metadata: JSON.stringify({ reservedAmount, reason })
        }
      });

      return { success: true, releasedAmount: reservedAmount };
    }, { timeout: 10000 });
  }

  /**
   * Concede créditos mensais incluídos na assinatura (no início ou renovação de ciclo).
   * Substitui o saldo mensal anterior (não cumulativo na proposta-base) e atualiza a validade.
   */
  static async grantMonthlyCredits(params: {
    userId: string;
    amount: number;
    expiresAt: Date;
    idempotencyKey?: string;
    description?: string;
  }): Promise<{ success: boolean; grantedAmount: number }> {
    const { userId, amount, expiresAt, idempotencyKey, description } = params;

    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`;

      // Verificação de idempotência financeira
      if (idempotencyKey) {
        const existingTx = await tx.creditTransaction.findUnique({
          where: { idempotencyKey }
        });
        if (existingTx) {
          console.log(`[WALLET IDEMPOTENT] Concessão mensal idempotente para ${userId}.`);
          return { success: true, grantedAmount: existingTx.amount };
        }
      }

      let wallet = await tx.creditWallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.creditWallet.create({
          data: { userId, monthlyBalance: 0, purchasedBalance: 0, reservedBalance: 0 }
        });
      }

      // Atualiza o saldo mensal do novo ciclo
      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          monthlyBalance: amount,
          monthlyExpiresAt: expiresAt
        }
      });

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

      return { success: true, grantedAmount: amount };
    }, { timeout: 10000 });
  }

  /**
   * Concede créditos comprados via recarga avulsa.
   * Acumulam no purchasedBalance e nunca expiram.
   */
  static async grantPurchasedCredits(params: {
    userId: string;
    amount: number;
    orderId?: string;
    idempotencyKey?: string;
    description?: string;
    priceCents?: number;
  }): Promise<{ success: boolean; newPurchasedBalance: number }> {
    const { userId, amount, orderId, idempotencyKey, description, priceCents } = params;

    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`;

      if (idempotencyKey) {
        const existingTx = await tx.creditTransaction.findUnique({
          where: { idempotencyKey }
        });
        if (existingTx) {
          console.log(`[WALLET IDEMPOTENT] Recarga avulsa idempotente para ${userId} pedido ${orderId}.`);
          const w = await tx.creditWallet.findUnique({ where: { userId } });
          return { success: true, newPurchasedBalance: w?.purchasedBalance || 0 };
        }
      }

      let wallet = await tx.creditWallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.creditWallet.create({
          data: { userId, monthlyBalance: 0, purchasedBalance: 0, reservedBalance: 0 }
        });
      }

      const updatedWallet = await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          purchasedBalance: { increment: amount }
        }
      });

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
            newPurchasedBalance: updatedWallet.purchasedBalance
          })
        }
      });

      return { success: true, newPurchasedBalance: updatedWallet.purchasedBalance };
    }, { timeout: 10000 });
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
    }, { timeout: 10000 });
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
