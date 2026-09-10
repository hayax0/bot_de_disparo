import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { isSubscriptionActive } from '../services/SubscriptionManager';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  workspaceId: string;
  authVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware centralizado de autenticação.
 * Valida assinatura, expiração e algoritmo HS256 do JWT.
 * Consulta o usuário no banco de dados e compara authVersion (invalidando tokens emitidos antes da troca de senha).
 * Carrega o workspaceId autorizado diretamente do banco.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<any> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Não autorizado. Faça login para continuar.' });
  }

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET, { algorithms: ['HS256'] }) as {
      userId: string;
      authVersion?: number;
      workspaceId?: string;
      role?: string;
    };

    if (!decoded.userId) {
      return res.status(401).json({ error: 'Token inválido.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        authVersion: true,
        subscriptionStatus: true,
        workspaces: {
          select: { id: true },
          take: 1
        }
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    // Invalidação de sessões anteriores: se authVersion mudou, rejeita o token antigo
    if (decoded.authVersion !== undefined) {
      if (decoded.authVersion !== user.authVersion) {
        return res.status(401).json({ error: 'Sessão expirada devido à alteração de credenciais. Faça login novamente.' });
      }
    } else {
      // Token antigo sem authVersion: se a conta já resetou a senha (authVersion > 0), rejeita
      if (user.authVersion > 0) {
        return res.status(401).json({ error: 'Sessão expirada devido à alteração de credenciais. Faça login novamente.' });
      }
    }

    const workspaceId = user.workspaces[0]?.id;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Nenhum workspace vinculado a este usuário.' });
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      workspaceId,
      authVersion: user.authVersion,
    };

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Faça login novamente.' });
    }
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

/**
 * Middleware de autorização por perfil (role)
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): any => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso não autorizado para o seu perfil.' });
    }
    next();
  };
}

/**
 * Middleware para exigir assinatura ativa
 */
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction): Promise<any> {
  const userId = req.user?.userId;
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
