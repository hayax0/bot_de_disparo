import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { PasswordResetService, PasswordResetError } from './PasswordResetService';
import { prisma } from '../lib/prisma';
import { mockMethod } from '../test-support/mockMethod';

test('PasswordResetService.requestReset: responde mensagem genérica mesmo se e-mail não existir', async (t) => {
  mockMethod(t, prisma.user, 'findUnique', async () => null);

  const result = await PasswordResetService.requestReset('inexistente@empresa.com');
  assert.equal(result.message, 'Se o e-mail estiver cadastrado, as instruções foram enviadas.');
});

test('PasswordResetService.requestReset: gera token seguro com hash sha256 e expiração de 15 minutos', async (t) => {
  const fakeUser = { id: 'u-123', email: 'contato@empresa.com', name: 'Admin Teste' };
  mockMethod(t, prisma.user, 'findUnique', async () => fakeUser);

  let invalidatedCount = 0;
  let createdData: any = null;

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      passwordResetToken: {
        updateMany: async (args: any) => {
          invalidatedCount++;
          return { count: 1 };
        },
        create: async (args: any) => {
          createdData = args.data;
          return { id: 'token-1', ...args.data };
        }
      }
    };
    return fn(tx);
  });

  const result = await PasswordResetService.requestReset('contato@empresa.com');
  assert.equal(result.message, 'Se o e-mail estiver cadastrado, as instruções foram enviadas.');
  assert.equal(invalidatedCount, 1, 'Deve invalidar tokens ativos anteriores');
  assert.ok(createdData, 'Deve ter criado o novo token');
  assert.equal(createdData.userId, 'u-123');
  assert.equal(typeof createdData.tokenHash, 'string');
  assert.equal(createdData.tokenHash.length, 64, 'Hash SHA-256 deve ter 64 caracteres');

  // Validação do tempo de expiração (~15 minutos a partir de agora)
  const diffMs = createdData.expiresAt.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  assert.equal(diffMinutes, 15, 'Token deve expirar em 15 minutos');
});

test('PasswordResetService.resetPassword: altera senha, consome token e incrementa authVersion', async (t) => {
  const plainToken = 'a'.repeat(64);
  const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

  const fakeRecord = {
    id: 'tok-rec-1',
    userId: 'u-123',
    tokenHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Válido por mais 10 min
    consumedAt: null,
    user: { id: 'u-123', email: 'user@test.com', authVersion: 0 }
  };

  let tokenConsumed = false;
  let userUpdated: any = null;

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      passwordResetToken: {
        findUnique: async () => fakeRecord,
        update: async (args: any) => {
          tokenConsumed = true;
          return { ...fakeRecord, ...args.data };
        },
        updateMany: async () => ({ count: 1 })
      },
      user: {
        update: async (args: any) => {
          userUpdated = args.data;
          return { id: 'u-123', ...args.data };
        }
      }
    };
    return fn(tx);
  });

  const res = await PasswordResetService.resetPassword(plainToken, 'novaSenhaForte123');
  assert.equal(res.success, true);
  assert.equal(tokenConsumed, true, 'Token deve ter sido marcado como consumido');
  assert.ok(userUpdated, 'Usuário deve ser atualizado');
  assert.deepEqual(userUpdated.authVersion, { increment: 1 }, 'authVersion deve ser incrementado');

  const passMatch = await bcrypt.compare('novaSenhaForte123', userUpdated.password);
  assert.equal(passMatch, true, 'Senha deve ser criptografada com bcrypt');
});

test('PasswordResetService.resetPassword: token expirado lança erro TOKEN_EXPIRED', async (t) => {
  const plainToken = 'b'.repeat(64);
  const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

  const expiredRecord = {
    id: 'tok-rec-2',
    userId: 'u-123',
    tokenHash,
    expiresAt: new Date(Date.now() - 5000), // Expirado há 5 segundos
    consumedAt: null,
    user: { id: 'u-123' }
  };

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      passwordResetToken: {
        findUnique: async () => expiredRecord,
      }
    };
    return fn(tx);
  });

  await assert.rejects(
    async () => PasswordResetService.resetPassword(plainToken, 'novaSenhaForte123'),
    (err: any) => {
      assert.equal(err instanceof PasswordResetError, true);
      assert.equal(err.code, 'TOKEN_EXPIRED');
      return true;
    }
  );
});

test('PasswordResetService.resetPassword: token já consumido lança erro TOKEN_ALREADY_USED', async (t) => {
  const plainToken = 'c'.repeat(64);
  const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

  const consumedRecord = {
    id: 'tok-rec-3',
    userId: 'u-123',
    tokenHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    consumedAt: new Date(Date.now() - 60000), // Já consumido há 1 min
    user: { id: 'u-123' }
  };

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      passwordResetToken: {
        findUnique: async () => consumedRecord,
      }
    };
    return fn(tx);
  });

  await assert.rejects(
    async () => PasswordResetService.resetPassword(plainToken, 'novaSenhaForte123'),
    (err: any) => {
      assert.equal(err instanceof PasswordResetError, true);
      assert.equal(err.code, 'TOKEN_ALREADY_USED');
      return true;
    }
  );
});
