import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { isUserAdmin, isSubscriptionActive } from '../services/SubscriptionManager';
import { EmailService } from '../services/EmailService';
import { consumeRegistrationCode, RegistrationError, requestRegistrationCode, validateRegistrationCode } from '../services/RegistrationVerification';

const router = Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Middleware de autenticação interna para rotas de auth
const authenticate = (req: Request, res: Response, next: Function): any => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

router.post('/register/code', async (req: Request, res: Response): Promise<any> => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!emailRegex.test(email) || email.length > 254) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  try {
    await requestRegistrationCode(email);
    return res.json({ message: 'Código enviado. Confira sua caixa de entrada e spam.' });
  } catch (error) {
    if (error instanceof RegistrationError) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: 'Não foi possível solicitar o código.' });
  }
});

router.post('/register', async (req: Request, res: Response): Promise<any> => {
  const { email, password, name, termsAccepted, verificationCode } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  if (termsAccepted !== true && termsAccepted !== 'true') {
    return res.status(400).json({ 
      error: 'É obrigatório ler e aceitar os Termos de Uso e a Política de Privacidade para criar uma conta.' 
    });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: 'Formato de e-mail inválido.' });
  }

  if (typeof password !== 'string' || password.length < 6 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: 'A senha deve conter no mínimo 6 caracteres.' });
  }

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
          { userId: updated.id, workspaceId, role: updated.role },
          ENV.JWT_SECRET,
          { expiresIn: '7d' }
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
      { userId: user.id, workspaceId, role: user.role },
      ENV.JWT_SECRET,
      { expiresIn: '7d' }
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
});

router.post('/login', async (req: Request, res: Response): Promise<any> => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();

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
      { userId: user.id, workspaceId, role: user.role },
      ENV.JWT_SECRET,
      { expiresIn: '7d' }
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
});

router.get('/me', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user.userId;
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

// Endpoint seguro para o botão "Verificar Pagamento" consultar o backend
router.post('/verify-payment', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

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
