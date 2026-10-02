/**
 * Constantes oficiais do produto para garantir consistência em toda a aplicação.
 */
export const CAKTO_CHECKOUT_URL = "https://pay.cakto.com.br/9gwgit3_1165278";

export interface LandingPlan {
  id: string;
  name: string;
  price: string;
  currency: string;
  period: string;
  description: string;
  monthlyDispatches: string;
  monthlyCredits: string;
  isPopular?: boolean;
  checkoutUrl: string;
  features: string[];
  paymentNote: string;
}

export const LANDING_PLANS: LandingPlan[] = [
  {
    id: "START",
    name: "Essencial",
    price: "27,99",
    currency: "R$",
    period: "/mês",
    description: "Ideal para profissionais autônomos e pequenos negócios iniciando a prospecção ativa.",
    monthlyDispatches: "1.000 disparos por mês",
    monthlyCredits: "50 créditos mensais de IA",
    checkoutUrl: "https://pay.cakto.com.br/3ejxmar_1165260",
    paymentNote: "Liberação imediata via PIX ou Cartão",
    features: [
      "1.000 disparos mensais no WhatsApp",
      "50 créditos mensais para IA",
      "1 Conexão WhatsApp via QR Code",
      "Busca integrada com sua conta Apify",
      "Campanhas e histórico permanente",
      "Mensagens personalizadas com IA",
      "Cadência anti-bloqueio inteligente",
    ],
  },
  {
    id: "PRO",
    name: "Profissional",
    price: "55,99",
    currency: "R$",
    period: "/mês",
    description: "Para empresas em crescimento que precisam de fluxo diário consistente de novos leads.",
    monthlyDispatches: "3.000 disparos por mês",
    monthlyCredits: "150 créditos mensais de IA",
    isPopular: true,
    checkoutUrl: "https://pay.cakto.com.br/9gwgit3_1165278",
    paymentNote: "Plano mais escolhido • PIX ou Cartão",
    features: [
      "3.000 disparos mensais no WhatsApp (~100/dia)",
      "150 créditos mensais para IA",
      "1 Conexão WhatsApp com reconexão automática",
      "Busca avançada de empresas no Google Maps",
      "Assistente de IA para copies persuasivas",
      "Filtros inteligentes por categoria e região",
      "Campanhas e histórico sem limite de contatos",
      "Suporte prioritário via WhatsApp",
    ],
  },
  {
    id: "SCALE",
    name: "Premium",
    price: "95,99",
    currency: "R$",
    period: "/mês",
    description: "Para operações comerciais ativas com alto volume e velocidade de prospecção.",
    monthlyDispatches: "6.000 disparos por mês",
    monthlyCredits: "300 créditos mensais de IA",
    checkoutUrl: "https://pay.cakto.com.br/33zk2g2_1165304",
    paymentNote: "Máximo volume • PIX ou Cartão",
    features: [
      "6.000 disparos mensais no WhatsApp (~200/dia)",
      "300 créditos mensais para IA",
      "1 Conexão WhatsApp de alta estabilidade",
      "Busca integrada ilimitada com sua Apify",
      "Assistente de IA para campanhas completas",
      "Prioridade máxima na fila de envios",
      "Gestão de múltiplos disparos simultâneos",
      "Suporte VIP dedicado",
    ],
  },
];

export const OFFICIAL_PLAN = {
  name: LANDING_PLANS[1].name,
  price: LANDING_PLANS[1].price,
  currency: LANDING_PLANS[1].currency,
  period: LANDING_PLANS[1].period,
  description: LANDING_PLANS[1].description,
  features: LANDING_PLANS[1].features,
  paymentNote: LANDING_PLANS[1].paymentNote,
};
