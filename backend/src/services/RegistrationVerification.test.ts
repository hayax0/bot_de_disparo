import { mockMethod } from '../test-support/mockMethod';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { EmailService } from './EmailService';
import { consumeRegistrationCode, requestRegistrationCode, validateRegistrationCode } from './RegistrationVerification';

test('Confirmação: código expira, limita tentativas, pertence ao e-mail e só pode ser consumido uma vez', async t => {
  const records = new Map<string, any>();
  const tx: any = {
    $executeRaw: async () => 1,
    registrationVerification: {
      findUnique: async ({ where }: any) => records.get(where.email),
      upsert: async ({ where, create, update }: any) => { records.set(where.email, records.has(where.email) ? { ...records.get(where.email), ...update } : { attempts: 0, ...create }); },
      update: async ({ where }: any) => { records.get(where.email).attempts++; },
      deleteMany: async ({ where }: any) => {
        const record = records.get(where.email);
        if (!record || record.codeHash !== where.codeHash || record.expiresAt <= where.expiresAt.gt || record.attempts > 5) return { count: 0 };
        records.delete(where.email);
        return { count: 1 };
      },
    },
  };
  mockMethod(t, prisma, '$transaction', async (fn: any) => fn(tx));
  let deliveredCode = '';
  mockMethod(t, EmailService, 'sendRegistrationCode', async (_email, code) => { deliveredCode = code; return { success: true }; });
  await requestRegistrationCode('buyer@example.test');
  assert.match(deliveredCode, /^\d{6}$/);
  assert.notEqual(records.get('buyer@example.test').codeHash, deliveredCode);
  await assert.rejects(requestRegistrationCode('buyer@example.test'), { status: 429 });
  await assert.rejects(validateRegistrationCode('other@example.test', deliveredCode), { status: 400 });
  await assert.rejects(validateRegistrationCode('buyer@example.test', '000000'), { status: 400 });
  const hash = await validateRegistrationCode('buyer@example.test', deliveredCode);
  await consumeRegistrationCode(tx, 'buyer@example.test', hash);
  await assert.rejects(consumeRegistrationCode(tx, 'buyer@example.test', hash), { status: 400 });
  await requestRegistrationCode('buyer@example.test');
  records.get('buyer@example.test').expiresAt = new Date(0);
  await assert.rejects(validateRegistrationCode('buyer@example.test', deliveredCode), { status: 400 });
  records.get('buyer@example.test').expiresAt = new Date(Date.now() + 60000);
  for (let i = 0; i < 5; i++) await assert.rejects(validateRegistrationCode('buyer@example.test', '000000'));
  await assert.rejects(validateRegistrationCode('buyer@example.test', deliveredCode), { status: 400 });
});
