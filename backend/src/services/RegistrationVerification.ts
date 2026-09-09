import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { EmailService } from './EmailService';

export class RegistrationError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}

function hashCode(email: string, code: string) {
  return crypto.createHmac('sha256', ENV.JWT_SECRET).update(`${email}:${code}`).digest('hex');
}

export async function requestRegistrationCode(email: string) {
  const now = new Date();
  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashCode(email, code);
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`registration:${email}`}))`;
    const existing = await tx.registrationVerification.findUnique({ where: { email } });
    if (existing && now.getTime() - existing.requestedAt.getTime() < 60000) {
      throw new RegistrationError('Aguarde um minuto antes de solicitar outro código.', 429);
    }
    await tx.registrationVerification.upsert({
      where: { email },
      create: { email, codeHash, expiresAt: new Date(now.getTime() + 600000), requestedAt: now },
      update: { codeHash, expiresAt: new Date(now.getTime() + 600000), requestedAt: now, attempts: 0 },
    });
  });
  const result = await EmailService.sendRegistrationCode(email, code);
  if (!result.success) {
    // Mantém o cooldown mesmo quando o provedor falha.
    await prisma.registrationVerification.updateMany({ where: { email, codeHash }, data: { expiresAt: now } });
    throw new RegistrationError('Não foi possível enviar o código. Tente novamente em um minuto ou contate o suporte.', 503);
  }
}

// Tentativas incorretas são persistidas fora da transação do cadastro para não sofrer rollback.
export async function validateRegistrationCode(email: string, code: unknown): Promise<string> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw new RegistrationError('Confirme seu e-mail com o código de 6 dígitos.', 400, 'EMAIL_VERIFICATION_REQUIRED');
  }
  const claim = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`registration:${email}`}))`;
    const record = await tx.registrationVerification.findUnique({ where: { email } });
    if (!record || record.expiresAt <= new Date() || record.attempts >= 5) return null;
    await tx.registrationVerification.update({ where: { email }, data: { attempts: { increment: 1 } } });
    const expected = Buffer.from(record.codeHash, 'hex');
    const provided = Buffer.from(hashCode(email, code), 'hex');
    return expected.length === provided.length && crypto.timingSafeEqual(expected, provided) ? record.codeHash : null;
  });
  if (!claim) throw new RegistrationError('Código inválido ou expirado. Solicite outro código.', 400, 'EMAIL_VERIFICATION_REQUIRED');
  return claim;
}

export async function consumeRegistrationCode(tx: Prisma.TransactionClient, email: string, codeHash: string) {
  const consumed = await tx.registrationVerification.deleteMany({
    where: { email, codeHash, expiresAt: { gt: new Date() }, attempts: { lte: 5 } },
  });
  if (consumed.count !== 1) throw new RegistrationError('Código já utilizado ou expirado. Solicite outro código.', 400, 'EMAIL_VERIFICATION_REQUIRED');
}
