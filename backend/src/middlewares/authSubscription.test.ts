import test from 'node:test';
import assert from 'node:assert/strict';
import { requireActiveSubscription } from './authSubscription';

// Mock simples de Request e Response para testes unitários isolados
function createMockReqRes(userPayload: any) {
  const req: any = {
    user: userPayload,
    headers: {}
  };
  
  let statusCode = 200;
  let jsonBody: any = null;
  let nextCalled = false;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      jsonBody = data;
      return res;
    }
  };

  const next = () => {
    nextCalled = true;
  };

  return { req, res, next, getResult: () => ({ statusCode, jsonBody, nextCalled }) };
}

test('requireActiveSubscription: bloqueia requisição sem autenticação (401)', async () => {
  const { req, res, next, getResult } = createMockReqRes(null);
  await requireActiveSubscription(req, res, next);
  const result = getResult();

  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
});
