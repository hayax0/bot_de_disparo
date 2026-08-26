// Motor de Processamento de Propostas, Spintax e Higienização de Leads
export function temWebsiteValido(website: string | null | undefined): boolean {
  if (!website || typeof website !== 'string') return false;
  const url = website.toLowerCase().trim();
  const plataformasExcluidas = [
    'instagram.com', 'facebook.com', 'fb.com', 'linktr.ee', 'linktree',
    'wa.me', 'whatsapp.com', 'ueniweb.com', 'wixsite.com', 'site123.me',
    'canva.site', 'bit.ly', 'tinyurl.com', 'behance.net', 'linkedin.com'
  ];
  const ehRedeSocialOuAgregador = plataformasExcluidas.some(p => url.includes(p));
  if (ehRedeSocialOuAgregador) return false;
  const regexDominioProprio = /^https?:\/\/(www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?/;
  return regexDominioProprio.test(url);
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

  const templateString = possuiSite ? campaign.messageComSite : campaign.messageSemSite;
  if (!templateString) return '';

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
