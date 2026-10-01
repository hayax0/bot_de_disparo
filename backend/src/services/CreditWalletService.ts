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
   * Obtém ou inicializa atomicamente a carteira de créditos do usuário.
   */
  static async getOrCreateWallet(userId: string, tx?: Prisma.TransactionClient): Promise<any> {
    const client = tx || prisma;
    let wallet = await client.creditWallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
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
   * Não utiliza saldos fictícios (como 999999) para administradores;
   * expressa isenção através da flag 'isUnlimited: true'.
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
      planId: user.planId || (isLegacy ? 'LEGACY_DAVI' : 'START'),
      dispatchesUsedInCycle: user.dispatchesUsedInCycle,
      monthlyDispatchQuota: user.monthlyDispatchQuota,
    };
  }

  /**
   * Reserva créditos para operação assíncrona com persistência, hold contábil e idempotência.
   * Não concede bypass gratuito de busca ou IA para contas legadas.
   */
  static async reserveCredits(params: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    sourceType: 'COMPANY_SEARCH' | 'AI_ASSISTANT';
    sourceId?: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<{
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

    return await prisma.$transaction(async (tx) => {
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

        return {
          success: true,
          reservationId: existingReservation.id,
          reservedAmount: existingReservation.amount,
          isUnlimited: existingReservation.amount === 0,
          isIdempotent: true
        };
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
        const adminReservation = await tx.creditReservation.create({
          data: {
            walletId: wallet.id,
            userId,
            idempotencyKey,
            amount: 0,
            monthlyAmount: 0,
            purchasedAmount: 0,
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

      // 4. Clientes legados não ganham busca integrada ou IA gratuitas
      if (isLegacyPlan(user.planId)) {
        // Se a conta legada não comprou créditos avulsos, bloqueia operação paga
        const availablePurchased = wallet.purchasedBalance - wallet.reservedBalance;
        if (availablePurchased < amount) {
          throw new InsufficientCreditsError(
            'O plano legado não possui créditos inclusos para Busca Integrada ou IA. Adquira um pacote avulso de créditos ou realize upgrade de plano.'
          );
        }
      }

      // 5. Validação de assinatura ativa para novos planos
      if (!isSubscriptionActive(user)) {
        throw new WalletSuspendedError();
      }

      // 6. Expiração do saldo mensal
      const isMonthlyExpired = Boolean(
        wallet.monthlyExpiresAt && new Date(wallet.monthlyExpiresAt) < new Date()
      );
      const effectiveMonthly = isMonthlyExpired ? 0 : wallet.monthlyBalance;

      // 7. Disponibilidade de saldo
      const totalAvailable = effectiveMonthly + wallet.purchasedBalance - wallet.reservedBalance;
      if (totalAvailable < amount) {
        throw new InsufficientCreditsError(
          `Saldo insuficiente. Disponível: ${Math.max(0, totalAvailable)} créditos; Necessário: ${amount} créditos.`
        );
      }

      // 8. Alocação com prioridade de consumo (mensal -> comprado)
      const monthlyToHold = Math.min(effectiveMonthly, amount);
      const purchasedToHold = amount - monthlyToHold;

      // 9. Atualização atômica da carteira
      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          monthlyBalance: { decrement: monthlyToHold },
          purchasedBalance: { decrement: purchasedToHold },
          reservedBalance: { increment: amount }
        }
      });

      // 10. Criação do registro persistido de reserva
      const reservation = await tx.creditReservation.create({
        data: {
          walletId: wallet.id,
          userId,
          idempotencyKey,
          amount,
          monthlyAmount: monthlyToHold,
          purchasedAmount: purchasedToHold,
          status: 'PENDING',
          sourceType,
          sourceId: sourceId || null,
          description: description || `Reserva de ${amount} créditos para ${sourceType}`,
          metadata: metadata ? JSON.stringify(metadata) : null
        }
      });

      // 11. Auditoria contábil da retenção
      await tx.creditTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: -amount,
          type: 'RESERVATION_HOLD',
          balanceType: monthlyToHold > 0 && purchasedToHold > 0 ? 'MIXED' : monthlyToHold > 0 ? 'MONTHLY' : 'PURCHASED',
          monthlyAmount: -monthlyToHold,
          purchasedAmount: -purchasedToHold,
          sourceType,
          sourceId: reservation.id,
          description: `Retenção de reserva #${reservation.id.slice(0, 8)} (${sourceType})`,
          metadata: JSON.stringify({
            reservationId: reservation.id,
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
    }, { timeout: 15000 });
  }

  /**
   * Liquida uma reserva existente debitando estritamente o valor consumido
   * e estornando automaticamente o excedente não consumido de volta para a carteira.
   */
  static async settleReservation(params: {
    reservationId: string;
    actualConsumedAmount: number;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<{
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

    return await prisma.$transaction(async (tx) => {
      // 1. Busca a reserva
      const reservation = await tx.creditReservation.findUnique({
        where: { id: reservationId }
      });

      if (!reservation) {
        throw new Error(`Reserva não encontrada: ${reservationId}`);
      }

      // Lock consultivo na carteira do proprietário da reserva
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${reservation.userId}`}))`;

      // Idempotência: Se já liquidada, retorna sem movimentar novamente
      if (reservation.status === 'SETTLED') {
        const consumed = reservation.consumedAmount || 0;
        const released = reservation.amount - consumed;
        return {
          success: true,
          consumedAmount: consumed,
          releasedAmount: released,
          isUnlimited: reservation.amount === 0,
          isIdempotent: true
        };
      }

      if (reservation.status !== 'PENDING') {
        throw new Error(`Reserva em estado inválido para liquidação: ${reservation.status}.`);
      }

      // O consumo nunca pode ser maior que o valor retido
      if (actualConsumedAmount > reservation.amount && reservation.amount > 0) {
        throw new Error(
          `Consumo real (${actualConsumedAmount}) não pode exceder o montante reservado (${reservation.amount}).`
        );
      }

      // Tratamento para reserva administrativa (Admin com amount 0)
      if (reservation.amount === 0) {
        await tx.creditReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'SETTLED',
            consumedAmount: actualConsumedAmount,
            settledAt: new Date()
          }
        });

        return {
          success: true,
          consumedAmount: actualConsumedAmount,
          releasedAmount: 0,
          isUnlimited: true
        };
      }

      const wallet = await tx.creditWallet.findUnique({
        where: { id: reservation.walletId }
      });
      if (!wallet) throw new Error('Carteira não encontrada.');

      // 2. Apuração do consumo por compartimento (consome do mensal retido primeiro, depois do comprado retido)
      const consumedFromMonthly = Math.min(reservation.monthlyAmount, actualConsumedAmount);
      const consumedFromPurchased = actualConsumedAmount - consumedFromMonthly;

      // 3. Apuração do estorno do excedente não consumido
      const refundMonthly = Math.max(0, reservation.monthlyAmount - consumedFromMonthly);
      const refundPurchased = Math.max(0, reservation.purchasedAmount - consumedFromPurchased);
      const totalReleased = refundMonthly + refundPurchased;

      // Verifica se o ciclo mensal expirou durante a operação
      const isMonthlyExpired = Boolean(
        wallet.monthlyExpiresAt && new Date(wallet.monthlyExpiresAt) < new Date()
      );
      const restoreMonthly = isMonthlyExpired ? 0 : refundMonthly;

      // 4. Atualização da carteira
      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          monthlyBalance: { increment: restoreMonthly },
          purchasedBalance: { increment: refundPurchased },
          reservedBalance: { decrement: reservation.amount }
        }
      });

      // 5. Atualização da reserva
      await tx.creditReservation.update({
        where: { id: reservation.id },
        data: {
          status: 'SETTLED',
          consumedAmount: actualConsumedAmount,
          settledAt: new Date()
        }
      });

      // 6. Registro de consumo contábil
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

      // 7. Registro de estorno/liberação do excedente
      if (totalReleased > 0) {
        await tx.creditTransaction.create({
          data: {
            walletId: wallet.id,
            userId: reservation.userId,
            amount: totalReleased,
            type: 'RESERVATION_RELEASE',
            balanceType: refundMonthly > 0 && refundPurchased > 0 ? 'MIXED' : refundMonthly > 0 ? 'MONTHLY' : 'PURCHASED',
            monthlyAmount: restoreMonthly,
            purchasedAmount: refundPurchased,
            sourceType: reservation.sourceType,
            sourceId: reservation.id,
            description: `Estorno de saldo reservado não utilizado (${reservation.sourceType})`,
            metadata: JSON.stringify({
              reservationId: reservation.id,
              reservedAmount: reservation.amount,
              consumedAmount: actualConsumedAmount,
              refundMonthly: restoreMonthly,
              refundPurchased,
              expiredMonthlyOnRelease: isMonthlyExpired ? refundMonthly : 0
            })
          }
        });
      }

      return {
        success: true,
        consumedAmount: actualConsumedAmount,
        releasedAmount: totalReleased
      };
    }, { timeout: 15000 });
  }

  /**
   * Libera integralmente uma reserva ativa devolvendo o saldo retido.
   * Utilizado quando uma operação externa falha ou é cancelada.
   */
  static async releaseReservation(params: {
    reservationId: string;
    reason?: string;
  }): Promise<{
    success: boolean;
    releasedAmount: number;
    isUnlimited?: boolean;
    isIdempotent?: boolean;
  }> {
    const { reservationId, reason } = params;

    if (!reservationId) {
      throw new Error('Identificador da reserva é obrigatório para liberação.');
    }

    return await prisma.$transaction(async (tx) => {
      const reservation = await tx.creditReservation.findUnique({
        where: { id: reservationId }
      });

      if (!reservation) {
        throw new Error(`Reserva não encontrada: ${reservationId}`);
      }

      // Lock consultivo na carteira do usuário
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${reservation.userId}`}))`;

      if (reservation.status === 'RELEASED') {
        return {
          success: true,
          releasedAmount: reservation.amount,
          isUnlimited: reservation.amount === 0,
          isIdempotent: true
        };
      }

      if (reservation.status !== 'PENDING') {
        throw new Error(`Reserva em estado inválido para liberação: ${reservation.status}.`);
      }

      if (reservation.amount === 0) {
        await tx.creditReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'RELEASED',
            releasedAt: new Date(),
            description: reason || reservation.description
          }
        });

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

      const isMonthlyExpired = Boolean(
        wallet.monthlyExpiresAt && new Date(wallet.monthlyExpiresAt) < new Date()
      );
      const restoreMonthly = isMonthlyExpired ? 0 : reservation.monthlyAmount;

      // Devolve valores aos respectivos compartimentos
      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          monthlyBalance: { increment: restoreMonthly },
          purchasedBalance: { increment: reservation.purchasedAmount },
          reservedBalance: { decrement: reservation.amount }
        }
      });

      await tx.creditReservation.update({
        where: { id: reservation.id },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
          description: reason || reservation.description
        }
      });

      await tx.creditTransaction.create({
        data: {
          walletId: wallet.id,
          userId: reservation.userId,
          amount: reservation.amount,
          type: 'RESERVATION_RELEASE',
          balanceType: reservation.monthlyAmount > 0 && reservation.purchasedAmount > 0 ? 'MIXED' : reservation.monthlyAmount > 0 ? 'MONTHLY' : 'PURCHASED',
          monthlyAmount: restoreMonthly,
          purchasedAmount: reservation.purchasedAmount,
          sourceType: reservation.sourceType,
          sourceId: reservation.id,
          description: `Liberação de reserva #${reservation.id.slice(0, 8)}: ${reason || 'Operação cancelada'}`,
          metadata: JSON.stringify({
            reservationId: reservation.id,
            reason,
            restoredMonthly: restoreMonthly,
            restoredPurchased: reservation.purchasedAmount,
            expiredMonthly: isMonthlyExpired ? reservation.monthlyAmount : 0
          })
        }
      });

      return {
        success: true,
        releasedAmount: reservation.amount
      };
    }, { timeout: 15000 });
  }

  /**
   * Concede créditos mensais no início ou renovação de ciclo da assinatura.
   * Não cumulativo: substitui o saldo mensal anterior e atualiza a data de expiração.
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

      // Substitui o saldo mensal anterior e atualiza validade
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
    }, { timeout: 15000 });
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
    }, { timeout: 15000 });
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
