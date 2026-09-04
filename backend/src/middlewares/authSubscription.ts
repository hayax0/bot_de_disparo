import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { isSubscriptionActive, isUserAdmin } from '../services/SubscriptionManager';

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

    // Administradores configurados por e-mail têm acesso vitalício garantido e nunca tomam 403
    if (isUserAdmin(user.email) || user.role === 'ADMIN' || user.subscriptionStatus === 'LIFETIME') {
      if (user.role !== 'ADMIN' || user.subscriptionStatus !== 'LIFETIME') {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: 'ADMIN', subscriptionStatus: 'LIFETIME' }
        }).catch(() => {});
      }
      return next();
    }

    if (!isSubscriptionActive(user)) {
      return res.status(403).json({
        error: 'Sua assinatura está inativa ou expirada. Renove seu plano para continuar utilizando a plataforma.',
        code: 'SUBSCRIPTION_REQUIRED',
        checkoutUrl: 'https://pay.cakto.com.br/at474et_1080517'
      });
    }

    next();
  } catch (error) {
    console.error('Erro no middleware requireActiveSubscription:', error);
    return res.status(500).json({ error: 'Erro ao validar status da assinatura' });
  }
}
