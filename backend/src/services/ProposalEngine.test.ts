import { test } from 'node:test';
import assert from 'node:assert/strict';
import { temWebsiteValido, processarSpintax, formatarNomeEmpresa, gerarProposta } from './ProposalEngine';

// ── temWebsiteValido ────────────────────────────────────────────────
test('temWebsiteValido: aceita domínio próprio', () => {
  assert.equal(temWebsiteValido('https://www.clinicasmile.com.br'), true);
  assert.equal(temWebsiteValido('http://padraopires.com'), true);
});

test('temWebsiteValido: rejeita redes sociais e agregadores', () => {
  for (const url of [
    'https://instagram.com/empresa',
    'https://facebook.com/empresa',
    'https://linktr.ee/empresa',
    'https://wa.me/5511999999999',
    'https://empresa.wixsite.com/site',
    'https://bit.ly/abc123',
    'https://www.google.com/maps/search/?api=1&query=MMSilva',
    'https://maps.google.com/?cid=123456',
    'https://maps.app.goo.gl/abcxyz',
  ]) {
    assert.equal(temWebsiteValido(url), false, `esperava false para ${url}`);
  }
});

test('temWebsiteValido: rejeita valores vazios/inválidos', () => {
  assert.equal(temWebsiteValido(null), false);
  assert.equal(temWebsiteValido(undefined), false);
  assert.equal(temWebsiteValido(''), false);
  assert.equal(temWebsiteValido('não é url'), false);
});

// ── processarSpintax ────────────────────────────────────────────────
test('processarSpintax: escolhe uma opção do grupo', () => {
  const resultado = processarSpintax('{Olá|Oi|Fala} tudo bem?');
  assert.ok(['Olá tudo bem?', 'Oi tudo bem?', 'Fala tudo bem?'].includes(resultado));
});

test('processarSpintax: resolve spintax aninhado/múltiplo', () => {
  const r = processarSpintax('{A|B} {C|D} {E|F}');
  const partes = r.split(' ');
  assert.equal(partes.length, 3);
  assert.ok(['A', 'B'].includes(partes[0]));
  assert.ok(['C', 'D'].includes(partes[1]));
  assert.ok(['E', 'F'].includes(partes[2]));
});

test('processarSpintax: texto sem placeholder permanece intacto', () => {
  assert.equal(processarSpintax('mensagem normal'), 'mensagem normal');
});

// ── formatarNomeEmpresa ─────────────────────────────────────────────
test('formatarNomeEmpresa: remove sufixos jurídicos e capitaliza', () => {
  assert.equal(formatarNomeEmpresa('CLINICA SORRISO LTDA'), 'Clinica Sorriso');
  assert.equal(formatarNomeEmpresa('padaria pão quente - filial'), 'Padaria Pão Quente');
});

test('formatarNomeEmpresa: preserva preposições minúsculas no meio', () => {
  const r = formatarNomeEmpresa('Cafeteria do João MEI');
  assert.equal(r, 'Cafeteria do João');
});

test('formatarNomeEmpresa: fallback para "pessoal"', () => {
  assert.equal(formatarNomeEmpresa(''), 'pessoal');
  assert.equal(formatarNomeEmpresa(null), 'pessoal');
  assert.equal(formatarNomeEmpresa(undefined), 'pessoal');
  assert.equal(formatarNomeEmpresa('  '), 'pessoal');
});

test('formatarNomeEmpresa: limita a 3 palavras (4 se a 3ª for preposição)', () => {
  assert.equal(formatarNomeEmpresa('Academia Fitness Total Premium Plus'), 'Academia Fitness Total');
  const comPrep = formatarNomeEmpresa('Mercado da Esquina do Bairro Central');
  assert.equal(comPrep, 'Mercado da Esquina');
});

// ── gerarProposta ───────────────────────────────────────────────────
const campanhaBase = {
  messageComSite: 'Olá {nome}! Vi seu site {website}.',
  messageSemSite: 'Olá {nome}! Notei que vocês no {bairro} ainda não têm site.',
};

test('gerarProposta: lead com site usa mensagem "com site"', () => {
  const msg = gerarProposta(
    { title: 'Clínica X', website: 'https://clinicax.com.br' },
    campanhaBase
  );
  assert.match(msg, /^Olá Clínica X!/);
  assert.ok(msg.includes('clinicax.com.br'));
});

test('gerarProposta: lead sem site usa mensagem "sem site"', () => {
  const msg = gerarProposta(
    { title: 'Padaria Y', website: null, neighborhood: 'Centro' },
    campanhaBase
  );
  assert.ok(msg.includes('Padaria Y'));
  assert.ok(msg.includes('Centro'));
  assert.ok(msg.includes('site'));
});

test('gerarProposta: lead com rede social cai na mensagem "sem site"', () => {
  const msg = gerarProposta(
    { title: 'Loja Z', website: 'https://instagram.com/lojaz' },
    campanhaBase
  );
  assert.ok(msg.includes('ainda não têm site'));
});

test('gerarProposta: fallback — se mensagem "com site" vazia, usa a outra', () => {
  const msg = gerarProposta(
    { title: 'Empresa W', website: 'https://empresaw.com.br' },
    { messageComSite: '', messageSemSite: 'Oi {nome}!' }
  );
  assert.equal(msg, 'Oi Empresa W!');
});

test('gerarProposta: bairro ausente vira "sua região"', () => {
  const msg = gerarProposta(
    { title: 'Restaurante K', website: null, neighborhood: null },
    campanhaBase
  );
  assert.ok(msg.includes('sua região'));
});

test('gerarProposta: retorna vazio quando não há template nenhum', () => {
  const msg = gerarProposta(
    { title: 'X', website: null },
    { messageComSite: '', messageSemSite: '' }
  );
  assert.equal(msg, '');
});

test('gerarProposta: substitui {meuNome} e {minhaEmpresa}', () => {
  const msg = gerarProposta(
    { title: 'X', website: null },
    { messageSemSite: '{meuNome} da {minhaEmpresa} falando.' },
    { meuNome: 'João', minhaEmpresa: 'AgênciaTop' }
  );
  assert.equal(msg, 'João da AgênciaTop falando.');
});
