import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { EmailService } from './EmailService';

export class PasswordResetError extends Error {
  constructor(message: string, public status: number = 400, public code?: string) {
    super(message);
    this.name = 'PasswordResetError';
  }
}

export class PasswordResetService {
  /**
   * Solicita redefinição de senha para um e-mail.
   * Sempre responde com sucesso genérico para prevenir enumeração de usuários.
   * Não grava o token em logs.
   */
  static async requestReset(email: string): Promise<{ message: string }> {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return { message: 'Se o e-mail estiver cadastrado, as instruções foram enviadas.' };
    }

    try {
      const user = await prisma.user.findUnique({
        where: { email: cleanEmail },
        select: { id: true, email: true, name: true }
      });

      if (!user) {
        // Retorna sucesso genérico para não expor quais e-mails estão cadastrados
        return { message: 'Se o e-mail estiver cadastrado, as instruções foram enviadas.' };
      }

      // Gera 32 bytes criptográficos aleatórios em formato hexadecimal
      const plainToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

      await prisma.$transaction(async (tx) => {
        // Invalida tokens anteriores ainda ativos deste usuário
        await tx.passwordResetToken.updateMany({
          where: {
            userId: user.id,
            consumedAt: null
          },
          data: {
            consumedAt: new Date()
          }
        });

        // Cria o novo token com hash
        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          }
        });
      });

      // Monta o link com o token em texto puro (não registrado em logs)
      const resetUrl = `${ENV.PLATFORM_URL}/recuperar-senha?token=${plainToken}`;

      // Despacha e-mail via Resend de forma assíncrona
      EmailService.sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        resetUrl
      }).catch((err) => {
        console.error('[PASSWORD RESET EMAIL ERROR] Falha ao enviar e-mail de recuperação:', err.message || err);
      });

      return { message: 'Se o e-mail estiver cadastrado, as instruções foram enviadas.' };
    } catch (error: any) {
      console.error('[PASSWORD RESET ERROR] Falha na solicitação:', error.message || error);
      return { message: 'Se o e-mail estiver cadastrado, as instruções foram enviadas.' };
    }
  }

  /**
   * Valida o token e define a nova senha na mesma transação.
   * Incrementa o authVersion do usuário, invalidando imediatamente todos os JWTs antigos.
   */
  static async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!token || typeof token !== 'string' || token.trim().length < 10) {
      throw new PasswordResetError('Token de recuperação inválido ou ausente.', 400);
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6 || Buffer.byteLength(newPassword) > 72) {
      throw new PasswordResetError('A nova senha deve ter entre 6 e 72 caracteres.', 400);
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const result = await prisma.$transaction(async (tx) => {
      const resetRecord = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true }
      });

      if (!resetRecord) {
        throw new PasswordResetError('Link de recuperação inválido ou expirado.', 400, 'INVALID_TOKEN');
      }

      if (resetRecord.consumedAt !== null) {
        throw new PasswordResetError('Este link de recuperação já foi utilizado.', 400, 'TOKEN_ALREADY_USED');
      }

      if (resetRecord.expiresAt.getTime() <= Date.now()) {
        throw new PasswordResetError('Este link de recuperação expirou. Solicite um novo link.', 400, 'TOKEN_EXPIRED');
      }

      // Consome o token atomicamente
      await tx.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { consumedAt: new Date() }
      });

      // Criptografa a nova senha com bcrypt (custo 10)
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Atualiza a senha e incrementa authVersion para invalidar sessões JWT anteriores
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: {
          password: hashedPassword,
          authVersion: { increment: 1 }
        }
      });

      // Invalida quaisquer outros tokens pendentes deste usuário
      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetRecord.userId,
          consumedAt: null
        },
        data: {
          consumedAt: new Date()
        }
      });

      return true;
    });

    return {
      success: result,
      message: 'Senha alterada com sucesso! Faça login com suas novas credenciais.'
    };
  }
}
