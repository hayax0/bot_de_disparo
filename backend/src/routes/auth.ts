import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { isUserAdmin } from '../services/SubscriptionManager';

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

router.post('/register', async (req: Request, res: Response): Promise<any> => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: 'Formato de e-mail inválido.' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ error: 'A senha deve conter no mínimo 6 caracteres.' });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      return res.status(400).json({ error: 'Já existe uma conta com este e-mail.' });
    }

    const isAdmin = isUserAdmin(cleanEmail);
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        password: hashedPassword,
        name: name ? String(name).trim() : null,
        role: isAdmin ? 'ADMIN' : 'USER',
        subscriptionStatus: isAdmin ? 'LIFETIME' : 'INACTIVE',
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

    const workspaceId = user.workspaces[0]?.id;
    const token = jwt.sign(
      { userId: user.id, workspaceId, role: user.role },
      ENV.JWT_SECRET,
      { expiresIn: '7d' }
    );

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

    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    // Se o email está na lista de admins mas não estava como ADMIN no banco, atualiza automaticamente
    if (isUserAdmin(cleanEmail) && user.role !== 'ADMIN') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          role: 'ADMIN',
          subscriptionStatus: 'LIFETIME'
        },
        include: { workspaces: true }
      });
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

    // Auto-promove admin no /me também se necessário
    if (isUserAdmin(user.email) && user.role !== 'ADMIN') {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN', subscriptionStatus: 'LIFETIME' }
      });
      user.role = 'ADMIN';
      user.subscriptionStatus = 'LIFETIME';
    }

    res.json({ user });
  } catch (error) {
    console.error('Auth /me error:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do usuário.' });
  }
});

export default router;
