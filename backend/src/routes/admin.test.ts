import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireAdmin } from './admin';
import { isUserAdmin } from '../services/SubscriptionManager';
import { ENV } from '../config/env';

ENV.ADMIN_EMAILS = [
  'caiocampos1009@gmail.com',
  'vitoriacampos241003@gmail.com',
  'vieiralacerda192@gmail.com',
  'vmariacamll@gmail.com',
  'dyonsonandrade@gmail.com'
];

test('Admin Security: requireAdmin rejeita requisição sem autenticação (401)', async () => {
  let statusReceived = 0;
  let jsonReceived: any = null;

  const req: any = { user: undefined };
  const res: any = {
    status: (s: number) => {
      statusReceived = s;
      return {
        json: (j: any) => { jsonReceived = j; }
      };
    }
  };

  await requireAdmin(req, res, () => {
    assert.fail('next() não deveria ser chamado para usuário não autenticado');
  });

  assert.equal(statusReceived, 401);
  assert.equal(jsonReceived?.error, 'Não autenticado.');
});

test('Admin Security: isUserAdmin reconhece estritamente os admins autorizados', () => {
  assert.equal(isUserAdmin('caiocampos1009@gmail.com'), true);
  assert.equal(isUserAdmin('vieiralacerda192@gmail.com'), true);
  assert.equal(isUserAdmin('usuario_comum@gmail.com'), false);
  assert.equal(isUserAdmin('hacker@invasao.com'), false);
});
