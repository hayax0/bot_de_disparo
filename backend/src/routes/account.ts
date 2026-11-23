import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth';
import { accountSettingsLimiter } from '../middlewares/rateLimiter';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { EmailService } from '../services/EmailService';

const router = Router();
router.use(authenticate);

const accountNameSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(120, 'O nome pode ter até 120 caracteres.'),
});
const emailRequestSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.').max(254).transform(value => value.toLowerCase()),
});
const emailCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Digite o código de 6 dígitos.') });
const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe sua senha atual.').max(72),
  newPassword: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres.').max(72),
});

const avatarDir = path.resolve(process.cwd(), 'uploads', 'avatars');
const avatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!avatarTypes.has(file.mimetype)) return callback(new Error('Envie uma imagem PNG, JPG ou WebP.'));
    callback(null, true);
  },
});

function parseAvatar(req: Request, res: Response, next: NextFunction) {
  avatarUpload.single('avatar')(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'A foto deve ter no máximo 2 MB.' });
    }
    return res.status(400).json({ error: error.message || 'Não foi possível receber a foto.' });
  });
}

function detectImageExtension(buffer: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function hashEmailChange(userId: string, email: string, code: string) {
  return crypto.createHmac('sha256', ENV.JWT_SECRET).update(`${userId}:${email}:${code}`).digest('hex');
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

router.get('/me', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, avatarUrl: true, emailVerifiedAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Conta não encontrada.' });
    const pending = await prisma.emailChangeVerification.findUnique({
      where: { userId: user.id },
      select: { email: true, expiresAt: true },
    });
    return res.json({ user, pendingEmail: pending?.expiresAt && pending.expiresAt > new Date() ? pending.email : null });
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar as configurações da conta.' });
  }
});

router.put('/profile', accountSettingsLimiter, async (req, res) => {
  const parsed = accountNameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Confira o nome informado.' });
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { name: parsed.data.name },
      select: { id: true, email: true, name: true, avatarUrl: true, role: true, subscriptionStatus: true, planId: true, subscriptionExpiresAt: true },
    });
    return res.json({ user });
  } catch {
    return res.status(500).json({ error: 'Não foi possível salvar seu nome.' });
  }
});

router.post('/email/request', accountSettingsLimiter, async (req, res) => {
  const parsed = emailRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Informe um e-mail válido.' });

  const userId = req.user!.userId;
  const email = parsed.data.email;
  const now = new Date();
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
    if (!user) return res.status(404).json({ error: 'Conta não encontrada.' });
    if (user.email.toLowerCase() === email) return res.status(400).json({ error: 'Esse já é o e-mail atual da sua conta.' });
    const [existingAccount, pending] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.emailChangeVerification.findUnique({ where: { userId }, select: { requestedAt: true } }),
    ]);
    if (existingAccount) return res.status(409).json({ error: 'Não foi possível usar esse e-mail. Confira o endereço e tente outro.' });
    if (pending && now.getTime() - pending.requestedAt.getTime() < 60_000) {
      return res.status(429).json({ error: 'Aguarde um minuto antes de solicitar outro código.' });
    }
    const pendingForAnotherUser = await prisma.emailChangeVerification.findUnique({ where: { email }, select: { userId: true } });
    if (pendingForAnotherUser && pendingForAnotherUser.userId !== userId) {
      return res.status(409).json({ error: 'Não foi possível usar esse e-mail. Confira o endereço e tente outro.' });
    }

    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const codeHash = hashEmailChange(userId, email, code);
    await prisma.emailChangeVerification.upsert({
      where: { userId },
      create: { userId, email, codeHash, expiresAt: new Date(now.getTime() + 10 * 60_000), requestedAt: now, attempts: 0 },
      update: { email, codeHash, expiresAt: new Date(now.getTime() + 10 * 60_000), requestedAt: now, attempts: 0 },
    });

    const sent = await EmailService.sendEmailChangeCode({ email, code, name: user.name });
    if (!sent.success) {
      await prisma.emailChangeVerification.updateMany({ where: { userId, email, codeHash }, data: { expiresAt: now } });
      return res.status(503).json({ error: 'Não foi possível enviar o código agora. Tente novamente mais tarde.' });
    }
    return res.json({ message: 'Enviamos um código ao novo endereço. Seu e-mail atual continua ativo até a confirmação.' });
  } catch (error) {
    if (isUniqueConstraint(error)) return res.status(409).json({ error: 'Não foi possível usar esse e-mail. Confira o endereço e tente outro.' });
    return res.status(500).json({ error: 'Não foi possível iniciar a alteração de e-mail.' });
  }
});

router.post('/email/confirm', accountSettingsLimiter, async (req, res) => {
  const parsed = emailCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Digite o código enviado.' });
  const userId = req.user!.userId;
  const now = new Date();

  try {
    const outcome = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`email-change:${userId}`}))`;
      const pending = await tx.emailChangeVerification.findUnique({ where: { userId } });
      if (!pending) return { status: 400 as const, error: 'Solicite um novo código para continuar.' };
      if (pending.expiresAt <= now || pending.attempts >= 5) {
        await tx.emailChangeVerification.deleteMany({ where: { userId } });
        return { status: 410 as const, error: 'O código expirou. Solicite outro para continuar.' };
      }

      await tx.emailChangeVerification.update({ where: { userId }, data: { attempts: { increment: 1 } } });
      const expected = Buffer.from(pending.codeHash, 'hex');
      const provided = Buffer.from(hashEmailChange(userId, pending.email, parsed.data.code), 'hex');
      const codeIsValid = expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
      if (!codeIsValid) return { status: 400 as const, error: 'Código inválido. Confira a mensagem e tente novamente.' };

      const existingAccount = await tx.user.findUnique({ where: { email: pending.email }, select: { id: true } });
      if (existingAccount && existingAccount.id !== userId) {
        await tx.emailChangeVerification.delete({ where: { userId } });
        return { status: 409 as const, error: 'Não foi possível confirmar esse endereço. Solicite uma alteração para outro e-mail.' };
      }
      const currentUser = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!currentUser) return { status: 404 as const, error: 'Conta não encontrada.' };
      const user = await tx.user.update({
        where: { id: userId },
        data: { email: pending.email, emailVerifiedAt: now, authVersion: { increment: 1 } },
        select: { id: true, email: true, name: true, avatarUrl: true },
      });
      await tx.emailChangeVerification.delete({ where: { userId } });
      return { status: 200 as const, oldEmail: currentUser.email, user };
    });

    if (outcome.status !== 200) return res.status(outcome.status).json({ error: outcome.error });
    void EmailService.sendEmailChangedNotice({ oldEmail: outcome.oldEmail, newEmail: outcome.user.email, name: outcome.user.name }).catch(() => undefined);
    return res.json({
      message: 'E-mail confirmado e atualizado. Entre novamente com o novo endereço.',
      user: outcome.user,
      requiresReLogin: true,
    });
  } catch (error) {
    if (isUniqueConstraint(error)) return res.status(409).json({ error: 'Não foi possível confirmar esse endereço. Solicite uma alteração para outro e-mail.' });
    return res.status(500).json({ error: 'Não foi possível confirmar a alteração de e-mail.' });
  }
});

router.delete('/email/pending', accountSettingsLimiter, async (req, res) => {
  try {
    await prisma.emailChangeVerification.deleteMany({ where: { userId: req.user!.userId } });
    return res.json({ message: 'Alteração pendente cancelada.' });
  } catch {
    return res.status(500).json({ error: 'Não foi possível cancelar a alteração pendente.' });
  }
});

router.put('/password', accountSettingsLimiter, async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Confira os campos da nova senha.' });
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { password: true } });
    if (!user) return res.status(404).json({ error: 'Conta não encontrada.' });
    if (!await bcrypt.compare(parsed.data.currentPassword, user.password)) {
      return res.status(400).json({ error: 'A senha atual não confere.' });
    }
    if (await bcrypt.compare(parsed.data.newPassword, user.password)) {
      return res.status(400).json({ error: 'Escolha uma senha diferente da atual.' });
    }
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { password: await bcrypt.hash(parsed.data.newPassword, 10), authVersion: { increment: 1 } },
    });
    return res.json({ message: 'Senha atualizada. Entre novamente para continuar.', requiresReLogin: true });
  } catch {
    return res.status(500).json({ error: 'Não foi possível alterar sua senha.' });
  }
});

router.post('/avatar', accountSettingsLimiter, parseAvatar, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Escolha uma foto para enviar.' });
  const extension = detectImageExtension(req.file.buffer);
  if (!extension) return res.status(400).json({ error: 'O arquivo não parece ser uma imagem PNG, JPG ou WebP válida.' });

  const userId = req.user!.userId;
  const fileName = `${crypto.randomUUID()}.${extension}`;
  const filePath = path.join(avatarDir, fileName);
  const avatarUrl = `/uploads/avatars/${fileName}`;
  try {
    await fs.mkdir(avatarDir, { recursive: true });
    await fs.writeFile(filePath, req.file.buffer, { flag: 'wx', mode: 0o644 });
    const previousUser = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    if (!previousUser) {
      await fs.unlink(filePath).catch(() => undefined);
      return res.status(404).json({ error: 'Conta não encontrada.' });
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { id: true, email: true, name: true, avatarUrl: true, role: true, subscriptionStatus: true, planId: true, subscriptionExpiresAt: true },
    });
    const oldFileName = previousUser.avatarUrl?.startsWith('/uploads/avatars/') ? path.basename(previousUser.avatarUrl) : null;
    if (oldFileName && oldFileName !== fileName) await fs.unlink(path.join(avatarDir, oldFileName)).catch(() => undefined);
    return res.json({ user });
  } catch {
    await fs.unlink(filePath).catch(() => undefined);
    return res.status(500).json({ error: 'Não foi possível salvar sua foto.' });
  }
});

export default router;
