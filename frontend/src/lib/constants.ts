/**
 * Constantes oficiais do produto para garantir consistência em toda a aplicação.
 */
export const CAKTO_CHECKOUT_URL = "https://pay.cakto.com.br/at474et_1080517";

export const OFFICIAL_PLAN = {
  name: "Plano Mensal Recorrente",
  price: "145,99",
  currency: "R$",
  period: "/mês",
  description: "Acesso completo à plataforma de prospecção e automação de disparos.",
  features: [
    "Conexão do seu WhatsApp via QR Code com reconexão automática",
    "Fila inteligente de disparos com controle rigoroso de cadência",
    "Intervalos aleatórios entre envios para comportamento natural",
    "Importação de contatos e leads (Google Maps, CSV, JSON)",
    "Motor de Spintax e personalização dinâmica por lead ({nome}, {empresa})",
    "Histórico persistente de contatos para proteção contra recontato acidental",
    "Execução contínua 24/7 em nuvem (não precisa manter o computador ligado)",
    "Dashboard com métricas e status de entrega em tempo real",
    "Suporte técnico dedicado via WhatsApp",
  ],
  paymentNote: "Liberação imediata via PIX ou Cartão de Crédito",
};
