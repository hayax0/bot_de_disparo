/**
 * Configuração dos Planos Comerciais, Franquias, Carteira e Pacotes de Créditos.
 * 
 * NOTA COMERCIAL IMPORTANTE:
 * Os preços mensais são fixos conforme definido pelo proprietário:
 * - Plano Start: R$ 27,99/mês
 * - Plano Pro: R$ 55,99/mês
 * - Plano Scale: R$ 95,99/mês
 * 
 * Quantidades de créditos, disparos e pacotes de recarga são propostas técnicas
 * e aguardam validação comercial final antes de publicação oficial.
 */

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
}

export const OPERATION_CREDIT_COSTS = {
  COMPANY_SEARCH_USABLE_LEAD: 0, // Busca paga na conta Apify pessoal
  AI_ASSISTANT_QUERY: 1,         // 1 crédito por consulta/geração com IA
} as const;

export const PLANS: Record<string, PlanDefinition> = {
  START: {
    id: 'START',
    name: 'Start',
    priceCents: 2799,
    priceFormatted: '27,99',
    monthlyDispatches: 1500,
    monthlyCredits: 150,
    maxWhatsappConnections: 1,
    description: 'Ideal para profissionais autônomos e pequenos negócios iniciando a prospecção.',
    features: [
      '1.500 disparos mensais no WhatsApp (~50/dia)',
      '150 créditos mensais para IA',
      '1 Conexão WhatsApp ativa via QR Code',
      'Motor Spintax e cadência anti-bloqueio',
      'Histórico persistente e filtro anti-recontato',
      'Recarga de créditos avulsos disponível a qualquer momento',
    ],
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    priceCents: 5599,
    priceFormatted: '55,99',
    monthlyDispatches: 5000,
    monthlyCredits: 400,
    maxWhatsappConnections: 1,
    isPopular: true,
    description: 'Para empresas em crescimento que precisam de fluxo diário consistente de leads.',
    features: [
      '5.000 disparos mensais no WhatsApp (~170/dia)',
      '400 créditos mensais para IA',
      '1 Conexão WhatsApp ativa com reconexão automática',
      'Assistente de IA para geração de copies personalizadas',
      'Filtros inteligentes por categoria e região na busca',
      'Histórico completo e relatórios de entrega',
      'Recarga de créditos avulsos disponível a qualquer momento',
    ],
  },
  SCALE: {
    id: 'SCALE',
    name: 'Scale',
    priceCents: 9599,
    priceFormatted: '95,99',
    monthlyDispatches: 15000,
    monthlyCredits: 1000,
    maxWhatsappConnections: 2,
    description: 'Para operações comerciais ativas com alto volume de prospecção consultiva.',
    features: [
      '15.000 disparos mensais no WhatsApp (~500/dia)',
      '1.000 créditos mensais para IA',
      'Até 2 Conexões WhatsApp ativas',
      'Assistente de IA avançado para campanhas completas',
      'Prioridade na fila de buscas assíncronas',
      'Histórico corporativo sem limite de leads',
      'Recarga de créditos avulsos disponível a qualquer momento',
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
    name: 'Pacote Pequeno',
    credits: 200,
    priceCents: 1990,
    priceFormatted: '19,90',
    pricePerCreditFormatted: 'R$ 0,099',
    description: 'Ideal para testes rápidos, geração e refinamento de mensagens com IA.',
  },
  PACKAGE_MEDIUM: {
    id: 'PACKAGE_MEDIUM',
    name: 'Pacote Médio (Popular)',
    credits: 600,
    priceCents: 4990,
    priceFormatted: '49,90',
    pricePerCreditFormatted: 'R$ 0,083',
    isPopular: true,
    description: 'Melhor relação custo-benefício para abastecer campanhas semanais de prospecção.',
  },
  PACKAGE_LARGE: {
    id: 'PACKAGE_LARGE',
    name: 'Pacote Grande (Econômico)',
    credits: 1500,
    priceCents: 9990,
    priceFormatted: '99,90',
    pricePerCreditFormatted: 'R$ 0,066',
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
