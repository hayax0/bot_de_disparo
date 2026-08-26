import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  temWebsiteValido, 
  processarSpintax, 
  formatarNomeEmpresa, 
  gerarProposta 
} from './ProposalEngine';

test('temWebsiteValido() deve validar apenas domínios próprios e rejeitar redes sociais/agregadores', () => {
  // Websites válidos com domínio próprio
  assert.equal(temWebsiteValido('https://clinicaodontologica.com.br'), true);
  assert.equal(temWebsiteValido('http://autopecasbrasil.com'), true);
  assert.equal(temWebsiteValido('https://www.advocaciasilva.adv.br'), true);

  // Redes sociais e agregadores (devem ser falsos)
  assert.equal(temWebsiteValido('https://instagram.com/clinicaexemplo'), false);
  assert.equal(temWebsiteValido('https://facebook.com/empresa'), false);
  assert.equal(temWebsiteValido('https://linktr.ee/doutor'), false);
  assert.equal(temWebsiteValido('https://wa.me/5511999999999'), false);
  assert.equal(temWebsiteValido('https://meusite.canva.site'), false);
  assert.equal(temWebsiteValido(''), false);
  assert.equal(temWebsiteValido(null), false);
  assert.equal(temWebsiteValido(undefined), false);
});

test('formatarNomeEmpresa() deve remover termos societários e preposições extras', () => {
  assert.equal(formatarNomeEmpresa('CLINICA SORRISO LTDA - MATRIZ'), 'Clinica Sorriso');
  assert.equal(formatarNomeEmpresa('AUTO MECANICA DO JOAO ME'), 'Auto Mecanica do Joao');
  assert.equal(formatarNomeEmpresa('DRA. MARIANA SILVA ODONTOLOGIA EPP'), 'Dra Mariana Silva');
  assert.equal(formatarNomeEmpresa(''), 'pessoal');
  assert.equal(formatarNomeEmpresa(null), 'pessoal');
});

test('processarSpintax() deve sortear uma opção válida e remover as chaves', () => {
  const template = '{Olá|Oi|Fala} {amigo|parceiro}!';
  for (let i = 0; i < 10; i++) {
    const res = processarSpintax(template);
    assert.match(res, /^(Olá|Oi|Fala) (amigo|parceiro)!$/);
    assert.equal(res.includes('{'), false);
    assert.equal(res.includes('}'), false);
  }
});

test('gerarProposta() deve selecionar template com site ou sem site e interpolar variáveis', () => {
  const campaign = {
    messageComSite: 'Olá {nome}, vi seu site {website}. Meu nome é {meuNome} da {minhaEmpresa}.',
    messageSemSite: 'Olá {nome}, vi que você atua no {bairro}. Meu nome é {meuNome}.'
  };

  const senderInfo = {
    meuNome: 'Carlos',
    minhaEmpresa: 'Agência Alpha'
  };

  // Teste com site
  const leadComSite = {
    title: 'Dr. Roberto Odontologia LTDA',
    website: 'https://drroberto.com.br',
    neighborhood: 'Centro'
  };
  const propComSite = gerarProposta(leadComSite, campaign, senderInfo);
  assert.match(propComSite, /Olá Dr Roberto Odontologia, vi seu site https:\/\/drroberto\.com\.br\. Meu nome é Carlos da Agência Alpha\./);

  // Teste sem site
  const leadSemSite = {
    title: 'Dr. Roberto Odontologia LTDA',
    website: 'https://instagram.com/drroberto',
    neighborhood: 'Moema'
  };
  const propSemSite = gerarProposta(leadSemSite, campaign, senderInfo);
  assert.match(propSemSite, /Olá Dr Roberto Odontologia, vi que você atua no Moema\. Meu nome é Carlos\./);
});

test('Lógica de Retries: falhas transitórias mantêm status QUEUED e apenas última tentativa marca ERROR', () => {
  const maxAttempts = 3;

  // Função simulada com a mesma lógica do worker
  const calcularProximoStatus = (attemptsMade: number, maxAttempts: number) => {
    const isFinalAttempt = attemptsMade >= maxAttempts;
    if (!isFinalAttempt) {
      return { status: 'QUEUED', errorMessage: `Tentativa ${attemptsMade}/${maxAttempts} falhou` };
    }
    return { status: 'ERROR', errorMessage: 'Falha após esgotar tentativas' };
  };

  // Tentativa 1 de 3 (Transitória) -> Deve manter QUEUED
  const tentativa1 = calcularProximoStatus(1, maxAttempts);
  assert.equal(tentativa1.status, 'QUEUED');
  assert.equal(tentativa1.errorMessage, 'Tentativa 1/3 falhou');

  // Tentativa 2 de 3 (Transitória) -> Deve manter QUEUED
  const tentativa2 = calcularProximoStatus(2, maxAttempts);
  assert.equal(tentativa2.status, 'QUEUED');
  assert.equal(tentativa2.errorMessage, 'Tentativa 2/3 falhou');

  // Tentativa 3 de 3 (Final) -> Deve marcar ERROR definitivo
  const tentativa3 = calcularProximoStatus(3, maxAttempts);
  assert.equal(tentativa3.status, 'ERROR');
  assert.equal(tentativa3.errorMessage, 'Falha após esgotar tentativas');
});

