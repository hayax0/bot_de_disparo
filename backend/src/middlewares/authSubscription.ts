import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { isSubscriptionActive } from '../services/SubscriptionManager';
import { ENV } from '../config/env';

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction): Promise<any> {
  const userId = (req as any).user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    // Privilégios persistidos; o e-mail informado não concede acesso por si só.
    if (user.role === 'ADMIN' || user.subscriptionStatus === 'LIFETIME') {
      return next();
    }

    if (!isSubscriptionActive(user)) {
      if (user.subscriptionStatus === 'ACTIVE') {
        await prisma.user.update({
          where: { id: user.id },
          data: { subscriptionStatus: 'PAST_DUE' }
        }).catch(() => {});
      }

      return res.status(403).json({
        error: 'Sua assinatura está inativa ou expirada. Renove seu plano para continuar utilizando a plataforma.',
        code: 'SUBSCRIPTION_REQUIRED',
        checkoutUrl: ENV.CAKTO_CHECKOUT_URL
      });
    }

    next();
  } catch (error) {
    console.error('Erro no middleware requireActiveSubscription:', error);
    return res.status(500).json({ error: 'Erro ao validar status da assinatura' });
  }
}
