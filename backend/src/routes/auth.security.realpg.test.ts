import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

test('PostgreSQL Real: Validação de concorrência com advisory lock e rejeição de invasor', async t => {
  // Testa se a conexão com PostgreSQL real está ativa
  let isDbAvailable = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    isDbAvailable = true;
  } catch {
    isDbAvailable = false;
  }

  if (!isDbAvailable) {
    t.skip('PostgreSQL real não disponível no ambiente de teste local atual (Docker/Postgres inativo).');
    return;
  }

  const testEmail1 = `realpg_${Date.now()}_1@example.test`;
  const testEmail2 = `realpg_${Date.now()}_2@example.test`;

  t.after(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [testEmail1, testEmail2] }
      }
    }).catch(() => {});
  });

  // 1. Teste de bloqueio mútuo real com pg_advisory_xact_lock
  let lock1AcquiredAt = 0;
  let lock2AcquiredAt = 0;

  const runLockTx1 = prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account:${testEmail1}`}))`;
    lock1AcquiredAt = Date.now();
    await new Promise(r => setTimeout(r, 100)); // Segura o lock por 100ms
  });

  const runLockTx2 = prisma.$transaction(async tx => {
    // Tenta pegar o mesmo lock logo após tx1 começar
    await new Promise(r => setTimeout(r, 10));
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account:${testEmail1}`}))`;
    lock2AcquiredAt = Date.now();
  });

  await Promise.all([runLockTx1, runLockTx2]);
  assert.ok(
    lock2AcquiredAt >= lock1AcquiredAt + 90,
    'Transação 2 deve aguardar a liberação do pg_advisory_xact_lock da Transação 1'
  );

  // 2. Teste Central: Depois da regularização pelo titular, a senha e os tokens antigos do invasor são rejeitados
  const attackerPassword = await bcrypt.hash('attacker-secret-pass', 4);
  const victimNewPassword = 'victim-safe-pass-12345';

  const hijackedUser = await prisma.user.create({
    data: {
      email: testEmail2,
      name: 'Victim Account',
      password: attackerPassword,
      role: 'USER',
      subscriptionStatus: 'ACTIVE',
      authVersion: 0,
      emailVerifiedAt: null
    }
  });

  const attackerToken = jwt.sign(
    { userId: hijackedUser.id, authVersion: 0 },
    ENV.JWT_SECRET,
    { algorithm: 'HS256' }
  );

  // Titular regulariza a conta com nova senha sob transação e lock
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account:${testEmail2}`}))`;
    const userToVerify = await tx.user.findUniqueOrThrow({ where: { id: hijackedUser.id } });
    const newHashedPassword = await bcrypt.hash(victimNewPassword, 4);

    await tx.user.update({
      where: { id: userToVerify.id },
      data: {
        password: newHashedPassword,
        authVersion: { increment: 1 },
        emailVerifiedAt: new Date()
      }
    });
  });

  // Valida no banco de dados real
  const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: hijackedUser.id } });

  // A senha do invasor NÃO confere mais
  const isAttackerPassValid = await bcrypt.compare('attacker-secret-pass', updatedUser.password);
  assert.equal(isAttackerPassValid, false, 'A senha antiga do invasor deve ser inválida');

  // A nova senha do titular é a única válida
  const isVictimPassValid = await bcrypt.compare(victimNewPassword, updatedUser.password);
  assert.equal(isVictimPassValid, true, 'A nova senha do titular deve ser válida');

  // O token antigo do invasor é rejeitado pela verificação de authVersion
  const decoded: any = jwt.verify(attackerToken, ENV.JWT_SECRET);
  assert.notEqual(decoded.authVersion, updatedUser.authVersion, 'authVersion do token antigo deve divergir do banco');
  assert.equal(updatedUser.authVersion, 1);
  assert.ok(updatedUser.emailVerifiedAt instanceof Date);
});
