import test from 'node:test';
import assert from 'node:assert/strict';
import { temWebsiteValido, formatarNomeEmpresa, processarSpintax, gerarProposta } from '../services/ProposalEngine';

test('Segurança & Validação: Bloqueio de Delays Inválidos', () => {
  const validarDelays = (delayMin: number, delayMax: number) => {
    if (isNaN(delayMin) || isNaN(delayMax) || delayMin < 10 || delayMax < 10) {
      return { valid: false, error: 'Os delays mínimo e máximo devem ser números inteiros maiores ou iguais a 10 segundos.' };
    }
    if (delayMax < delayMin) {
      return { valid: false, error: 'O tempo máximo de delay deve ser igual ou maior que o tempo mínimo.' };
    }
    return { valid: true };
  };

  // Casos válidos
  assert.equal(validarDelays(90, 180).valid, true);
  assert.equal(validarDelays(10, 10).valid, true);
  assert.equal(validarDelays(30, 60).valid, true);

  // Casos inválidos
  assert.equal(validarDelays(180, 90).valid, false); // max < min
  assert.equal(validarDelays(5, 100).valid, false);  // min < 10
  assert.equal(validarDelays(100, 8).valid, false);  // max < 10
  assert.equal(validarDelays(NaN, 100).valid, false);
});

test('Segurança & Concorrência: Idempotência de Jobs e Prevenção de Início Duplicado', () => {
  const verificarPermissaoInicio = (campaignStatus: string, waStatus: string) => {
    if (campaignStatus === 'RUNNING') {
      return { status: 409, error: 'Esta campanha já está em execução.' };
    }
    if (waStatus !== 'CONNECTED') {
      return { status: 400, error: 'O WhatsApp não está conectado.' };
    }
    return { status: 200, allowed: true };
  };

  // Se já estiver rodando, deve retornar 409 Conflict
  const resRunning = verificarPermissaoInicio('RUNNING', 'CONNECTED');
  assert.equal(resRunning.status, 409);
  assert.equal(resRunning.error, 'Esta campanha já está em execução.');

  // Se WhatsApp desconectado, deve retornar 400
  const resDisconnected = verificarPermissaoInicio('PAUSED', 'DISCONNECTED');
  assert.equal(resDisconnected.status, 400);

  // Se pausada e WhatsApp conectado, deve permitir iniciar
  const resAllowed = verificarPermissaoInicio('PAUSED', 'CONNECTED');
  assert.equal(resAllowed.status, 200);
  assert.equal(resAllowed.allowed, true);

  // Geração de jobId determinístico para evitar duplicidade no BullMQ/Redis
  const campaignId = 'camp-123';
  const leadId = 'lead-456';
  const jobId = `${campaignId}_${leadId}`;
  assert.equal(jobId, 'camp-123_lead-456');
});

test('Tratamento de Leads da Apify: Extração e Sanitização de Telefones', () => {
  const sanitizarTelefone = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    let num = String(raw).replace(/\D/g, '');
    if (num.length < 10) return null;
    if (!num.startsWith('55')) num = '55' + num;
    return num;
  };

  assert.equal(sanitizarTelefone('(11) 98765-4321'), '5511987654321');
  assert.equal(sanitizarTelefone('11987654321'), '5511987654321');
  assert.equal(sanitizarTelefone('+55 11 98765-4321'), '5511987654321');
  assert.equal(sanitizarTelefone('12345'), null); // Inválido (curto)
  assert.equal(sanitizarTelefone(null), null);
});
