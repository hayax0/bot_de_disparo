// Motor de Processamento de Propostas, Spintax e Higienização de Leads
export function temWebsiteValido(website: string | null | undefined): boolean {
  if (!website || typeof website !== 'string') return false;
  const raw = website.trim();
  let urlObj: URL;
  try {
    urlObj = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
  } catch {
    return false;
  }

  const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = urlObj.pathname.toLowerCase();

  const dominiosExcluidos = [
    'instagram.com', 'facebook.com', 'fb.com', 'linktr.ee', 'linktree',
    'wa.me', 'whatsapp.com', 'ueniweb.com', 'wixsite.com', 'site123.me',
    'canva.site', 'bit.ly', 'tinyurl.com', 'behance.net', 'linkedin.com',
    'google.com', 'google.com.br', 'goo.gl', 'waze.com', 't.me',
    'telegram.me', 'youtube.com', 'tiktok.com', 'twitter.com', 'x.com'
  ];

  const ehExcluido = dominiosExcluidos.some(d => hostname === d || hostname.endsWith(`.${d}`));
  if (ehExcluido) return false;

  // Rejeita links específicos do Google Maps ou caminhos de mapas
  if (hostname.includes('google') || pathname.includes('/maps')) return false;

  // Valida que possui formato de domínio próprio válido
  const regexDominioProprio = /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?$/;
  return regexDominioProprio.test(hostname);
}

export function processarSpintax(texto: string): string {
  let novoTexto = texto;
  while (novoTexto.includes('{') && novoTexto.includes('}')) {
    novoTexto = novoTexto.replace(/\{([^{}]+)\}/g, (_, opcoes) => {
      const lista = opcoes.split('|');
      return lista[Math.floor(Math.random() * lista.length)];
    });
  }
  return novoTexto;
}

export function formatarNomeEmpresa(nomeRaw: string | null | undefined): string {
  if (!nomeRaw || typeof nomeRaw !== 'string') return 'pessoal';
  let nome = nomeRaw.split(/[-|–:]/)[0].trim();
  nome = nome.replace(/\b(LTDA|ME|EPP|S\.A\.|S\/A|MEI|EIRELI|S\.S\.|SS|S\/C|S\.C\.|EIRELE|EIRELLI|MATRIZ|FILIAL|CNPJ)\b/gi, '').trim();
  nome = nome.replace(/^[^a-zA-Z0-9À-ÿ]+/g, '').replace(/[^a-zA-Z0-9À-ÿ]+$/g, '').trim();

  const preposicoes = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'para', 'com', 'ou']);
  let palavras = nome
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .split(/\s+/)
    .filter(p => /[a-zA-Z0-9À-ÿ]/.test(p));

  palavras = palavras.map((palavra, index) => {
    if (preposicoes.has(palavra) && index > 0) return palavra;
    return palavra.charAt(0).toUpperCase() + palavra.slice(1);
  });

  let resultadoPalavras = palavras.slice(0, 3);
  if (palavras.length > 3 && preposicoes.has(palavras[2])) {
    resultadoPalavras = palavras.slice(0, 4);
  }

  let resultado = resultadoPalavras.join(' ').trim();
  return resultado || 'pessoal';
}

export function gerarProposta(lead: any, campaign: any, senderInfo?: { meuNome?: string; minhaEmpresa?: string }): string {
  const nomeEmpresa = formatarNomeEmpresa(lead.title);
  const possuiSite = temWebsiteValido(lead.website);

  // Fallback inteligente: se uma das mensagens não foi informada, utiliza a outra disponível
  let templateString = '';
  if (possuiSite) {
    templateString = (campaign.messageComSite && campaign.messageComSite.trim())
      ? campaign.messageComSite
      : (campaign.messageSemSite || '');
  } else {
    templateString = (campaign.messageSemSite && campaign.messageSemSite.trim())
      ? campaign.messageSemSite
      : (campaign.messageComSite || '');
  }

  if (!templateString || !templateString.trim()) return '';

  const siteParaMensagem = possuiSite ? lead.website : '';
  const bairroParaMensagem = lead.neighborhood || 'sua região';
  const meuNome = senderInfo?.meuNome || '';
  const minhaEmpresa = senderInfo?.minhaEmpresa || '';

  let mensagemPronta = templateString
    .replace(/{nome}/gi, nomeEmpresa)
    .replace(/{website}/gi, siteParaMensagem)
    .replace(/{bairro}/gi, bairroParaMensagem)
    .replace(/{meuNome}/gi, meuNome)
    .replace(/{minhaEmpresa}/gi, minhaEmpresa);

  return processarSpintax(mensagemPronta);
}

export const VARIAVEIS_SUPORTADAS = ['nome', 'website', 'bairro', 'meuNome', 'minhaEmpresa'] as const;

export interface ValidacaoTemplateResult {
  valid: boolean;
  invalidVariables: string[];
  hasUnclosedBrackets: boolean;
  warnings: string[];
}

export function validarTemplateMensagem(texto: string | null | undefined): ValidacaoTemplateResult {
  if (!texto || typeof texto !== 'string') {
    return { valid: true, invalidVariables: [], hasUnclosedBrackets: false, warnings: [] };
  }

  const warnings: string[] = [];
  const invalidVariables: string[] = [];

  // 1. Checagem de chaves balanceadas
  let openCount = 0;
  let hasUnclosedBrackets = false;
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === '{') openCount++;
    if (texto[i] === '}') {
      openCount--;
      if (openCount < 0) {
        hasUnclosedBrackets = true;
      }
    }
  }
  if (openCount !== 0) {
    hasUnclosedBrackets = true;
    warnings.push('O texto possui chaves "{" ou "}" abertas sem fechamento correspondente.');
  }

  // 2. Extração de variáveis que não sejam spintax
  // Expressão regular procura blocos {qualquer_coisa}
  const regexBloco = /\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;
  const variaveisPermitidasLower = new Set(VARIAVEIS_SUPORTADAS.map(v => v.toLowerCase()));

  while ((match = regexBloco.exec(texto)) !== null) {
    const conteudo = match[1].trim();
    // Se possui pipe "|", é considerado bloco de Spintax {op1|op2}
    if (conteudo.includes('|')) {
      const opcoes = conteudo.split('|').map(o => o.trim());
      if (opcoes.some(o => o === '')) {
        warnings.push(`Spintax "{${conteudo}}" contém opção vazia. Verifique as barras "|".`);
      }
      continue;
    }

    // Caso não seja spintax, deve ser uma variável suportada
    const nomeVar = conteudo.toLowerCase();
    if (!variaveisPermitidasLower.has(nomeVar)) {
      const varComChave = `{${match[1]}}`;
      if (!invalidVariables.includes(varComChave)) {
        invalidVariables.push(varComChave);
        warnings.push(`Variável desconhecida "${varComChave}". As variáveis válidas são {nome}, {website}, {bairro}, {meuNome} e {minhaEmpresa}.`);
      }
    }
  }

  return {
    valid: invalidVariables.length === 0 && !hasUnclosedBrackets,
    invalidVariables,
    hasUnclosedBrackets,
    warnings
  };
}

export interface PreviewMessageParams {
  messageComSite?: string | null;
  messageSemSite?: string | null;
  senderInfo?: {
    meuNome?: string;
    minhaEmpresa?: string;
  };
  sampleLead?: {
    title?: string;
    website?: string | null;
    neighborhood?: string | null;
  };
}

export interface PreviewMessageResponse {
  valid: boolean;
  warnings: string[];
  notice: string;
  previews: {
    comSite: {
      rendered: string;
      lead: { title: string; website: string; neighborhood: string };
      warnings: string[];
    };
    semSite: {
      rendered: string;
      lead: { title: string; website: null; neighborhood: string };
      warnings: string[];
    };
  };
}

export function gerarPreviaMensagem(params: PreviewMessageParams): PreviewMessageResponse {
  const comSiteVal = validarTemplateMensagem(params.messageComSite);
  const semSiteVal = validarTemplateMensagem(params.messageSemSite);

  const allWarnings = Array.from(new Set([...comSiteVal.warnings, ...semSiteVal.warnings]));

  const leadComSite = {
    title: params.sampleLead?.title || 'Odonto Estética Silva',
    website: params.sampleLead?.website || 'https://odontoesteticasilva.com.br',
    neighborhood: params.sampleLead?.neighborhood || 'Vila Mariana'
  };

  const leadSemSite = {
    title: params.sampleLead?.title || 'Padaria Pão & Cia',
    website: null,
    neighborhood: params.sampleLead?.neighborhood || 'Pinheiros'
  };

  const senderInfo = {
    meuNome: params.senderInfo?.meuNome || 'Equipe de Atendimento',
    minhaEmpresa: params.senderInfo?.minhaEmpresa || 'Minha Empresa'
  };

  const campaignMock = {
    messageComSite: params.messageComSite || '',
    messageSemSite: params.messageSemSite || ''
  };

  const renderedComSite = gerarProposta(leadComSite, campaignMock, senderInfo);
  const renderedSemSite = gerarProposta(leadSemSite, campaignMock, senderInfo);

  return {
    valid: comSiteVal.valid && semSiteVal.valid,
    warnings: allWarnings,
    notice: 'A variação exibida é uma amostra: no momento do disparo, o Spintax sorteará uma opção para cada destinatário.',
    previews: {
      comSite: {
        rendered: renderedComSite,
        lead: leadComSite,
        warnings: comSiteVal.warnings
      },
      semSite: {
        rendered: renderedSemSite,
        lead: leadSemSite,
        warnings: semSiteVal.warnings
      }
    }
  };
}

