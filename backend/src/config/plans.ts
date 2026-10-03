/**
 * Catálogo aprovado em 02/10/2026. IDs internos preservados para compatibilidade.
 * Novas compras permanecem desativadas até integração e validação da Cakto.
 */

import { ENV } from './env';

export interface PlanDefinition {
  id: string;
  name: string;
  priceCents: number; // em centavos (ex: 2799 = R$ 27,99)
  priceFormatted: string;
  monthlyDispatches: number; // Franquia mensal de disparos no WhatsApp
  monthlyCredits: number; // Créditos mensais exclusivos para IA
  maxWhatsappConnections: number;
  isPopular?: boolean;
  isLegacy?: boolean;
  isUnlimited?: boolean;
  description: string;
  features: string[];
  checkoutUrl?: string;
  caktoOfferId?: string;
  caktoOfferCode?: string;
}

export interface CreditPackageDefinition {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  priceFormatted: string;
  pricePerCreditFormatted: string;
  isPopular?: boolean;
  description: string;
  checkoutUrl: string;
  caktoOfferId: string;
  caktoOfferCode?: string;
}

export const OPERATION_CREDIT_COSTS = {
  COMPANY_SEARCH_USABLE_LEAD: 0, // Busca paga na conta Apify pessoal
  AI_ASSISTANT_QUERY: 1,         // 1 crédito por consulta/geração com IA
} as const;

export const PLANS: Record<string, PlanDefinition> = {
  START: {
    id: 'START',
    name: 'Essencial',
    priceCents: 2799,
    priceFormatted: '27,99',
    monthlyDispatches: 1000,
    monthlyCredits: 50,
    maxWhatsappConnections: 1,
    checkoutUrl: 'https://pay.cakto.com.br/3ejxmar_1165260',
    caktoOfferId: '1165260',
    caktoOfferCode: '3ejxmar',
    description: 'Ideal para profissionais autônomos e pequenos negócios iniciando a prospecção.',
    features: [
      '1.000 disparos por mês',
      '50 créditos mensais de IA',
      '1 conexão WhatsApp',
      'Busca integrada com sua própria conta Apify',
      'Campanhas e histórico de contatos',
      'Mensagens personalizadas com IA',
    ],
  },
  PRO: {
    id: 'PRO',
    name: 'Profissional',
    priceCents: 5599,
    priceFormatted: '55,99',
    monthlyDispatches: 3000,
    monthlyCredits: 150,
    maxWhatsappConnections: 1,
    isPopular: true,
    checkoutUrl: 'https://pay.cakto.com.br/9gwgit3_1165278',
    caktoOfferId: '1165278',
    caktoOfferCode: '9gwgit3',
    description: 'Para empresas em crescimento que precisam de fluxo diário consistente de leads.',
    features: [
      '3.000 disparos por mês',
      '150 créditos mensais de IA',
      '1 conexão WhatsApp',
      'Busca integrada com sua própria conta Apify',
      'Campanhas e histórico de contatos',
      'Mensagens personalizadas com IA',
    ],
  },
  SCALE: {
    id: 'SCALE',
    name: 'Premium',
    priceCents: 9599,
    priceFormatted: '95,99',
    monthlyDispatches: 6000,
    monthlyCredits: 300,
    maxWhatsappConnections: 1,
    checkoutUrl: 'https://pay.cakto.com.br/33zk2g2_1165304',
    caktoOfferId: '1165304',
    caktoOfferCode: '33zk2g2',
    description: 'Para operações comerciais ativas com alto volume de prospecção consultiva.',
    features: [
      '6.000 disparos por mês',
      '300 créditos mensais de IA',
      '1 conexão WhatsApp',
      'Busca integrada com sua própria conta Apify',
      'Campanhas e histórico de contatos',
      'Mensagens personalizadas com IA',
    ],
  },
  LEGACY_DAVI: {
    id: 'LEGACY_DAVI',
    name: 'Plano Legado',
    priceCents: 14599,
    priceFormatted: '145,99',
    monthlyDispatches: 0, // 0 = Sem limite comercial aplicado
    monthlyCredits: 0,
    maxWhatsappConnections: 1,
    isLegacy: true,
    description: 'Condição contratada original mantida integralmente.',
    features: [
      'Plano e valores contratuais preservados',
      'Sem créditos ou bloqueios por saldo de carteira',
      'Sem aplicação de novas franquias de disparos',
      'Operações originais de prospecção e envio preservadas',
    ],
  },
  ADMIN_LIFETIME: {
    id: 'ADMIN_LIFETIME',
    name: 'Acesso Vitalício (Admin)',
    priceCents: 0,
    priceFormatted: '0,00',
    monthlyDispatches: 0,
    monthlyCredits: 0,
    maxWhatsappConnections: 10,
    isUnlimited: true,
    description: 'Acesso completo vitalício e irrestrito para administradores da plataforma.',
    features: [
      'Acesso vitalício incondicional',
      'Disparos ilimitados sem franquia comercial',
      'Créditos ilimitados para IA',
      'Todas as funcionalidades liberadas',
    ],
  },
};

export const CREDIT_PACKAGES: Record<string, CreditPackageDefinition> = {
  PACKAGE_SMALL: {
    id: 'PACKAGE_SMALL',
    name: '100 créditos de IA',
    credits: 100,
    priceCents: 999,
    priceFormatted: '9,99',
    pricePerCreditFormatted: 'R$ 0,0999',
    checkoutUrl: 'https://pay.cakto.com.br/zmvfpjf_1165355',
    caktoOfferId: '1165355',
    caktoOfferCode: 'zmvfpjf',
    description: 'Ideal para testes rápidos, geração e refinamento de mensagens com IA.',
  },
  PACKAGE_MEDIUM: {
    id: 'PACKAGE_MEDIUM',
    name: '300 créditos de IA',
    credits: 300,
    priceCents: 2499,
    priceFormatted: '24,99',
    pricePerCreditFormatted: 'R$ 0,0833',
    isPopular: true,
    checkoutUrl: 'https://pay.cakto.com.br/dqywaqn_1165367',
    caktoOfferId: '1165367',
    caktoOfferCode: 'dqywaqn',
    description: 'Melhor relação custo-benefício para abastecer campanhas semanais de prospecção.',
  },
  PACKAGE_LARGE: {
    id: 'PACKAGE_LARGE',
    name: '700 créditos de IA',
    credits: 700,
    priceCents: 4999,
    priceFormatted: '49,99',
    pricePerCreditFormatted: 'R$ 0,0714',
    checkoutUrl: 'https://pay.cakto.com.br/cbd2uec_1165374',
    caktoOfferId: '1165374',
    caktoOfferCode: 'cbd2uec',
    description: 'Máximo desconto por crédito para geração de mensagens com IA.',
  },
};

export function getPlanById(planId?: string | null): PlanDefinition | null {
  if (!planId) return null;
  const upper = planId.trim().toUpperCase();
  return PLANS[upper] || null;
}

export function isLegacyPlan(planId?: string | null): boolean {
  if (!planId) return false;
  const upper = planId.trim().toUpperCase();
  return upper === 'LEGACY_DAVI' || upper === 'LEGACY';
}

/**
 * Benefício ilimitado depende ESTRITAMENTE do papel de ADMIN atual.
 * Ao remover o papel ADMIN, os privilégios cessam imediatamente.
 */
export function isUserUnlimited(user?: { role?: string | null } | null): boolean {
  if (!user) return false;
  return user.role === 'ADMIN';
}

export interface UserCapabilities {
  canUpload: boolean;
  canUseSearch: boolean;
  canUseAi: boolean;
  isUnlimited: boolean;
  requiresCredits: boolean;
  isLegacy: boolean;
  planId: string | null;
}

export function getUserCapabilities(user?: { role?: string | null; planId?: string | null } | null): UserCapabilities {
  if (!user) {
    return {
      canUpload: false,
      canUseSearch: false,
      canUseAi: false,
      isUnlimited: false,
      requiresCredits: true,
      isLegacy: false,
      planId: null,
    };
  }

  const isAdmin = user.role === 'ADMIN';
  const isLegacy = !isAdmin && isLegacyPlan(user.planId);
  const plan = getPlanById(user.planId);
  const isKnownNewPlan = !isAdmin && !isLegacy && Boolean(plan); // START, PRO, SCALE

  return {
    canUpload: isAdmin || isLegacy,
    canUseSearch: isAdmin || isKnownNewPlan,
    canUseAi: isAdmin || isKnownNewPlan,
    isUnlimited: isAdmin,
    requiresCredits: !isAdmin && isKnownNewPlan,
    isLegacy,
    planId: user.planId || (isLegacy ? 'LEGACY_DAVI' : null),
  };
}

export function getCreditPackageById(packageId: string): CreditPackageDefinition | null {
  if (!packageId) return null;
  const upper = packageId.trim().toUpperCase();
  return CREDIT_PACKAGES[upper] || null;
}

export function getCommercialCatalog() {
  return {
    purchaseEnabled: false as const,
    plans: Object.values(PLANS).filter(plan => !plan.isLegacy && !plan.isUnlimited),
    packages: Object.values(CREDIT_PACKAGES),
    creditCostPerMessage: OPERATION_CREDIT_COSTS.AI_ASSISTANT_QUERY,
  };
}

export type CommercialItemType = 'PLAN' | 'PACKAGE' | 'LEGACY' | 'UNKNOWN';

export interface CommercialResolution {
  type: CommercialItemType;
  plan?: PlanDefinition;
  package?: CreditPackageDefinition;
  planId?: string;
  packageId?: string;
}

/**
 * Resolução rigorosa e segura do item comercial da Cakto.
 * Requer correspondência exata de ID ou Código da oferta cadastrada.
 * Não utiliza correspondência por substring nem fallbacks por nome para concessão financeira.
 * Produtos desconhecidos retornam UNKNOWN.
 */
export function resolveCommercialItem(item: any): CommercialResolution {
  if (!item || typeof item !== 'object') return { type: 'UNKNOWN' };

  const candidateOfferIds: string[] = [];
  const candidateOfferCodes: string[] = [];

  const addId = (val: any) => {
    if (val !== undefined && val !== null) {
      const s = String(val).trim();
      if (s && !candidateOfferIds.includes(s)) candidateOfferIds.push(s);
    }
  };

  const addCode = (val: any) => {
    if (val !== undefined && val !== null) {
      const s = String(val).trim().toLowerCase();
      if (s && !candidateOfferCodes.includes(s)) candidateOfferCodes.push(s);
    }
  };

  // Extração dos campos reais de identificação de oferta da Cakto
  addId(item.offer_id);
  addId(item.offer?.id);
  addId(item.offerId);
  addId(item.product?.offer_id);
  addId(item.product?.offerId);

  addCode(item.offer?.code);
  addCode(item.offer_code);
  addCode(item.code);
  addCode(item.product?.code);

  // Extração opcional da URL oficial de checkout da Cakto caso venha no item (formato: pay.cakto.com.br/CODIGO_ID)
  const checkoutUrl = String(item.checkout_url || item.payment_url || item.url || '').trim();
  if (checkoutUrl) {
    const match = checkoutUrl.match(/pay\.cakto\.com\.br\/([a-z0-9]+)_([0-9]+)/i);
    if (match) {
      addCode(match[1]);
      addId(match[2]);
    }
  }

  const exactMatch = (targetId?: string, targetCode?: string): boolean => {
    if (!targetId && !targetCode) return false;
    const idMatch = targetId ? candidateOfferIds.some(id => id === targetId) : false;
    const codeMatch = targetCode ? candidateOfferCodes.some(code => code === targetCode.toLowerCase()) : false;
    return idMatch || codeMatch;
  };

  // 1. Identificação estrita de Planos Comerciais Homologados
  for (const plan of Object.values(PLANS)) {
    if (plan.isLegacy || plan.isUnlimited) continue;
    if (exactMatch(plan.caktoOfferId, plan.caktoOfferCode)) {
      return { type: 'PLAN', plan, planId: plan.id };
    }
  }

  // 2. Identificação estrita de Pacotes de Recarga Homologados
  for (const pkg of Object.values(CREDIT_PACKAGES)) {
    if (exactMatch(pkg.caktoOfferId, pkg.caktoOfferCode)) {
      return { type: 'PACKAGE', package: pkg, packageId: pkg.id };
    }
  }

  // 3. Identificação estrita do Produto Legado (Davi) por configuração explícita de ID e Código
  const legacyOfferId = ENV.CAKTO_LEGACY_OFFER_ID;
  const legacyOfferCode = ENV.CAKTO_LEGACY_OFFER_CODE;
  if (exactMatch(legacyOfferId, legacyOfferCode)) {
    return { type: 'LEGACY', planId: 'LEGACY_DAVI' };
  }

  // Qualquer item desconhecido ou sem identificador exato homologado retorna UNKNOWN
  return { type: 'UNKNOWN' };
}
