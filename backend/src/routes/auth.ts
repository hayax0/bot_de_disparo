import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { isUserAdmin, isSubscriptionActive } from '../services/SubscriptionManager';
import { EmailService } from '../services/EmailService';
import { consumeRegistrationCode, RegistrationError, requestRegistrationCode, validateRegistrationCode } from '../services/RegistrationVerification';
import { authenticate } from '../middlewares/auth';
import {
  loginLimiter,
  registerLimiter,
  confirmCodeLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter
} from '../middlewares/rateLimiter';
import {
  validateBody,
  loginSchema,
  registerSchema,
  confirmCodeSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} from '../lib/validation';
import { PasswordResetService, PasswordResetError } from '../services/PasswordResetService';

const router = Router();

// 1. Solicitação de código de confirmação de cadastro
router.post(
  '/register/code',
  confirmCodeLimiter,
  validateBody(confirmCodeSchema),
  async (req: Request, res: Response): Promise<any> => {
    const { email } = req.body;
    try {
      await requestRegistrationCode(email);
      return res.json({ message: 'Código enviado. Confira sua caixa de entrada e spam.' });
    } catch (error) {
      if (error instanceof RegistrationError) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Não foi possível solicitar o código.' });
    }
  }
);

// 2. Cadastro / Ativação de conta
router.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  async (req: Request, res: Response): Promise<any> => {
    const { email, password, name, verificationCode } = req.body;
    const cleanEmail = email;

    try {
      const existingUser = await prisma.user.findUnique({
        where: { email: cleanEmail },
        include: { workspaces: true }
      });

      if (existingUser) {
        // Caso a conta tenha sido pré-criada pelo webhook da Cakto com senha provisória:
        if (existingUser.password.startsWith('$WEBHOOK_TEMP$')) {
          const claim = await validateRegistrationCode(cleanEmail, verificationCode);
          const hashedPassword = await bcrypt.hash(password, 10);
          const updated = await prisma.$transaction(async tx => {
            await consumeRegistrationCode(tx, cleanEmail, claim);
            const changed = await tx.user.updateMany({
              where: { id: existingUser.id, password: existingUser.password },
              data: {
                password: hashedPassword,
                name: name ? String(name).trim() : existingUser.name,
                termsAcceptedAt: new Date(),
                termsVersion: '1.0',
                authVersion: { increment: 1 },
                ...(isUserAdmin(cleanEmail) ? { role: 'ADMIN', subscriptionStatus: 'LIFETIME' } : {}),
              },
            });
            if (changed.count !== 1) throw new RegistrationError('Esta conta já foi ativada. Faça login.', 409);
            return tx.user.findUniqueOrThrow({
              where: { id: existingUser.id },
              include: { workspaces: true }
            });
          });

          const workspaceId = updated.workspaces[0]?.id;
          const token = jwt.sign(
            { userId: updated.id, authVersion: updated.authVersion, workspaceId, role: updated.role },
            ENV.JWT_SECRET,
            { expiresIn: '7d', algorithm: 'HS256' }
          );

          return res.status(200).json({
            token,
            user: {
              id: updated.id,
              email: updated.email,
              name: updated.name,
              role: updated.role,
              subscriptionStatus: updated.subscriptionStatus,
              subscriptionExpiresAt: updated.subscriptionExpiresAt,
              workspaceId
            }
          });
        }

        return res.status(400).json({ error: 'Já existe uma conta com este e-mail.' });
      }

      const isAdmin = isUserAdmin(cleanEmail);
      const claim = isAdmin ? await validateRegistrationCode(cleanEmail, verificationCode) : null;
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.$transaction(async tx => {
        if (claim) await consumeRegistrationCode(tx, cleanEmail, claim);
        return tx.user.create({
          data: {
            email: cleanEmail,
            password: hashedPassword,
            name: name ? String(name).trim() : null,
            role: isAdmin ? 'ADMIN' : 'USER',
            subscriptionStatus: isAdmin ? 'LIFETIME' : 'INACTIVE',
            termsAcceptedAt: new Date(),
            termsVersion: '1.0',
            authVersion: 0,
            workspaces: {
              create: {
                name: `${name ? String(name).trim() : 'Minha Empresa'}`,
              }
            }
          },
          include: {
            workspaces: true
          }
        });
      });

      const workspaceId = user.workspaces[0]?.id;
      const token = jwt.sign(
        { userId: user.id, authVersion: user.authVersion, workspaceId, role: user.role },
        ENV.JWT_SECRET,
        { expiresIn: '7d', algorithm: 'HS256' }
      );

      // Dispara o e-mail de convite de assinatura para novos cadastros (usuários comuns INACTIVE)
      if (!isAdmin && user.subscriptionStatus === 'INACTIVE') {
        EmailService.sendRegistrationInvitationEmail({
          email: user.email,
          name: user.name,
          checkoutUrl: ENV.CAKTO_CHECKOUT_URL
        }).then(async (emailResult) => {
          await prisma.subscriptionNotification.create({
            data: {
              userId: user.id,
              type: 'REGISTRATION_INVITE',
              cycle: 'REGISTRATION',
              recipientEmail: user.email,
              resendEmailId: emailResult.id || null,
              status: emailResult.success ? 'SENT' : 'FAILED',
              errorMessage: emailResult.error || null,
            }
          }).catch((err) => console.warn('[SUBSCRIPTION NOTIFICATION REGISTER WARN]:', err.message));
        }).catch((err) => {
          console.error(`[AUTH REGISTER EMAIL ERROR] Falha ao enviar convite para ${user.email}:`, err.message || err);
        });
      }

      res.status(201).json({ 
        token, 
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          subscriptionStatus: user.subscriptionStatus,
          subscriptionExpiresAt: user.subscriptionExpiresAt,
          workspaceId
        } 
      });
    } catch (error) {
      if (error instanceof RegistrationError) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error('Register error:', error);
      res.status(500).json({ error: 'Erro interno ao criar conta.' });
    }
  }
);

// 3. Login
router.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response): Promise<any> => {
    const { email, password } = req.body;
    const cleanEmail = email;

    try {
      let user = await prisma.user.findUnique({
        where: { email: cleanEmail },
        include: { workspaces: true }
      });

      if (user && user.password.startsWith('$WEBHOOK_TEMP$')) {
        return res.status(401).json({
          error: 'Sua assinatura foi confirmada! Acesse a aba "Cadastre-se" com este mesmo e-mail para definir sua senha de acesso.'
        });
      }

      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      const workspaceId = user.workspaces[0]?.id;

      const token = jwt.sign(
        { userId: user.id, authVersion: user.authVersion, workspaceId, role: user.role },
        ENV.JWT_SECRET,
        { expiresIn: '7d', algorithm: 'HS256' }
      );

      res.json({ 
        token, 
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          subscriptionStatus: user.subscriptionStatus,
          subscriptionExpiresAt: user.subscriptionExpiresAt,
          workspaceId
        } 
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Erro interno ao realizar login.' });
    }
  }
);

// 4. Solicitação de recuperação de senha (link de uso único)
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validateBody(forgotPasswordSchema),
  async (req: Request, res: Response): Promise<any> => {
    const { email } = req.body;
    const result = await PasswordResetService.requestReset(email);
    return res.status(200).json(result);
  }
);

// 5. Redefinição de senha com token de uso único e invalidação de sessões anteriores
router.post(
  '/reset-password',
  resetPasswordLimiter,
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response): Promise<any> => {
    const { token, newPassword } = req.body;
    try {
      const result = await PasswordResetService.resetPassword(token, newPassword);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof PasswordResetError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({ error: 'Erro ao redefinir senha. Tente novamente mais tarde.' });
    }
  }
);

// 6. Dados do usuário autenticado (/me)
router.get('/me', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        createdAt: true,
        workspaces: {
          select: {
            id: true,
            name: true,
            whatsapp: {
              select: {
                status: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Auth /me error:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do usuário.' });
  }
});

// 7. Endpoint seguro para o botão "Verificar Pagamento" consultar o backend
router.post('/verify-payment', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;

    let user = await prisma.user.findUnique({
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
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const active = isSubscriptionActive(user);

    // Se no banco ainda consta ACTIVE mas a data já passou, sincroniza para PAST_DUE
    if (!active && user.subscriptionStatus === 'ACTIVE') {
      await prisma.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: 'PAST_DUE' }
      }).catch(() => {});
      user.subscriptionStatus = 'PAST_DUE';
    }

    return res.json({
      active,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
      },
      message: active
        ? 'Assinatura ativa e confirmada!'
        : 'Pagamento ainda não confirmado ou assinatura pendente.'
    });
  } catch (error) {
    console.error('Erro em /auth/verify-payment:', error);
    res.status(500).json({ error: 'Erro ao verificar pagamento no servidor.' });
  }
});

export default router;
