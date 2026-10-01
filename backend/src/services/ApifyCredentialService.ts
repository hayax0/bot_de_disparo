import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class IntegrationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function encryptionKey(): Buffer {
  const value = process.env.INTEGRATION_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new IntegrationError('A configuração de integrações do servidor está indisponível.', 503);
  return Buffer.from(value, 'hex');
}

export function encryptApifyToken(token: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decryptApifyToken(value: string, userId: string): string {
  try {
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'v1') throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch { throw new IntegrationError('Não foi possível abrir a chave Apify. Entre em contato com o suporte.', 503); }
}

export class ApifyCredentialService {
  static async lock(tx: Prisma.TransactionClient, userId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`apify_credential:${userId}`}))`;
  }
  static async status(userId: string) {
    const row = await prisma.apifyCredential.findUnique({ where: { userId }, select: { accountName: true, updatedAt: true } });
    return { configured: Boolean(row), accountName: row?.accountName ?? null, updatedAt: row?.updatedAt ?? null };
  }
  static async token(userId: string) {
    const row = await prisma.apifyCredential.findUnique({ where: { userId } });
    if (!row) throw new IntegrationError('Conecte sua conta Apify antes de buscar empresas.');
    return decryptApifyToken(row.ciphertext, userId);
  }
  static async save(userId: string, token: string) {
    const ciphertext = encryptApifyToken(token, userId);
    let response: Response;
    try {
      response = await fetch('https://api.apify.com/v2/users/me', {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000)
      });
    } catch { throw new IntegrationError('A Apify não respondeu. Tente novamente.', 502); }
    if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403
      ? 'Chave inválida ou sem permissão para verificar a conta Apify.' : 'Não foi possível validar a chave na Apify. Tente novamente.', 400);
    const body = await response.json() as { data?: { username?: string; id?: string } };
    const accountName = body.data?.username || body.data?.id;
    if (!accountName) throw new IntegrationError('Resposta de autenticação inválida da Apify.', 502);
    await prisma.$transaction(async tx => {
      await this.lock(tx, userId);
      await this.assertIdle(tx, userId);
      await tx.apifyCredential.upsert({ where: { userId }, create: { userId, ciphertext, accountName }, update: { ciphertext, accountName } });
    });
    return this.status(userId);
  }
  static async remove(userId: string) {
    await prisma.$transaction(async tx => {
      await this.lock(tx, userId);
      await this.assertIdle(tx, userId);
      await tx.apifyCredential.deleteMany({ where: { userId } });
    });
  }
  private static async assertIdle(tx: Prisma.TransactionClient, userId: string) {
    if (await tx.companySearch.count({ where: { userId, billingMode: 'PERSONAL_APIFY', status: { in: ['PENDING', 'PROCESSING'] } } })) {
      throw new IntegrationError('Aguarde suas buscas em andamento antes de trocar ou remover a chave.', 409);
    }
  }
}
