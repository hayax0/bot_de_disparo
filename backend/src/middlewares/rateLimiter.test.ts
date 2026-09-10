import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { confirmCodeLimiter, loginLimiter } from './rateLimiter';

async function createTestServer(limiter: any) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/test-endpoint', limiter, (req, res) => {
    res.json({ ok: true });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/test-endpoint`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(err => err ? reject(err) : resolve());
      server.closeAllConnections();
    })
  };
}

test('rateLimiter: confirmCodeLimiter bloqueia após 3 tentativas com 429 e mensagem em pt-BR', async (t) => {
  const { url, close } = await createTestServer(confirmCodeLimiter);
  t.after(close);

  const payload = { email: 'rate_test@empresa.com' };

  // 1ª, 2ª, 3ª requisições devem passar (200)
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 200, `Tentativa ${i + 1} deveria ter passado`);
  }

  // 4ª requisição deve ser barrada pelo limitador (429)
  const blockedRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.equal(blockedRes.status, 429, 'Deveria ter recebido HTTP 429 Too Many Requests');
  const body = await blockedRes.json();
  assert.equal(body.error, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
});
