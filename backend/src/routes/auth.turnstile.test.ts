import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import router from './auth';
import { ENV } from '../config/env';
import { prisma } from '../lib/prisma';
import { EmailService } from '../services/EmailService';
import { mockMethod } from '../test-support/mockMethod';

test('Turnstile protege emissão de código e criação de conta antes de efeitos colaterais', async t => {
  const original = { ...ENV };
  Object.assign(ENV, { TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'secret-key', PLATFORM_URL: 'https://abordai.example.test' });
  t.after(() => { Object.assign(ENV, original); });

  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/register`;
  const transaction = mockMethod(t, prisma, '$transaction', async (fn: (tx: unknown) => Promise<unknown>) => fn({
    $executeRaw: async () => 1,
    registrationVerification: { findUnique: async () => null, upsert: async () => ({}) },
  }));
  const email = mockMethod(t, EmailService, 'sendRegistrationCode', async () => ({ success: true }));
  let sequence = 0;
  const send = (path: string, turnstileToken?: string) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `challenge-${++sequence}@example.test`, password: 'test-password', termsAccepted: true, turnstileToken }),
  });
  const verified = { success: true, hostname: 'abordai.example.test', action: 'register' };
  const originalFetch = fetch;
  let reply: Response | Error;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
    if (url !== 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return originalFetch(url, options);
    calls++;
    assert.equal((options?.body as URLSearchParams).get('secret'), ENV.TURNSTILE_SECRET_KEY);
    if (reply instanceof Error) throw reply;
    return reply.clone();
  });

  const config = await fetch(base + '/config');
  assert.deepEqual(await config.json(), { turnstileSiteKey: 'site-key' });
  assert.equal(config.headers.get('cache-control'), 'no-store');
  for (const path of ['/code', '']) {
    const missing = await send(path);
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).code, 'TURNSTILE_REQUIRED');
  }
  assert.equal(calls, 0);

  reply = Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] });
  const replay = await send('/code', 'already-used');
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).code, 'TURNSTILE_INVALID');
  reply = Response.json({ ...verified, action: 'different-form' });
  assert.equal((await send('', 'wrong-action')).status, 400);
  reply = Response.json({ ...verified, hostname: 'different.example.test' });
  assert.equal((await send('', 'wrong-host')).status, 400);
  reply = new Error('Provider indisponível');
  assert.equal((await send('/code', 'unavailable')).status, 503);
  assert.equal(transaction.mock.callCount(), 0);
  assert.equal(email.mock.callCount(), 0);

  reply = Response.json(verified);
  assert.equal((await send('/code', 'valid-token')).status, 200);
  assert.equal(email.mock.callCount(), 1);
  const stillNeedsCode = await send('', 'another-valid-token');
  assert.equal(stillNeedsCode.status, 400);
  assert.equal((await stillNeedsCode.json()).code, 'EMAIL_VERIFICATION_REQUIRED');
});
