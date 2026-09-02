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
