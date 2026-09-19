import { prisma } from '../lib/prisma';
import crypto from 'crypto';

export interface OptOutCheckResult {
  isOptOut: boolean;
  matchedKeyword?: string;
}

// Lista calibrada de palavras/expressões de opt-out (LGPD)
// Utiliza correspondência por palavra/frase exata para evitar falsos positivos
const OPT_OUT_PATTERNS = [
  /^(parar|pare|stop|sair|cancelar|descadastrar|descadastre-me)$/i,
  /\b(nao quero receber|não quero receber|remover meu numero|remover meu número)\b/i,
  /\b(me remova|me descadastre|me tira da lista|tire meu numero|tire meu número)\b/i,
  /\b(pare de enviar|pare de mandar|nao envie mais|não envie mais|nao mande mais|não mande mais)\b/i,
  /\b(favor remover|favor descadastrar|favor cancelar envio)\b/i,
];

/**
 * Normaliza o texto removendo acentos, pontuações excessivas e espaços redundantes.
 */
export function normalizeOptOutText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/gi, ' ')       // substitui pontuações por espaço
    .replace(/\s+/g, ' ')            // consolida espaços
    .trim();
}

/**
 * Extrai o texto da mensagem do Baileys cobrindo todos os formatos relevantes
 */
export function extractMessageText(messageObj: any): string {
  if (!messageObj) return '';

  if (typeof messageObj === 'string') return messageObj;

  // 1. Mensagem direta de texto
  if (messageObj.conversation) {
    return String(messageObj.conversation);
  }

  // 2. Mensagem de texto estendida (com link ou resposta)
  if (messageObj.extendedTextMessage?.text) {
    return String(messageObj.extendedTextMessage.text);
  }

  // 3. Imagem ou vídeo com legenda (caption)
  if (messageObj.imageMessage?.caption) {
    return String(messageObj.imageMessage.caption);
  }
  if (messageObj.videoMessage?.caption) {
    return String(messageObj.videoMessage.caption);
  }

  // 4. Documento com legenda
  if (messageObj.documentMessage?.caption) {
    return String(messageObj.documentMessage.caption);
  }

  // 5. Botões de resposta ou lista
  if (messageObj.buttonsResponseMessage?.selectedDisplayText) {
    return String(messageObj.buttonsResponseMessage.selectedDisplayText);
  }
  if (messageObj.templateButtonReplyMessage?.selectedDisplayText) {
    return String(messageObj.templateButtonReplyMessage.selectedDisplayText);
  }
  if (messageObj.listResponseMessage?.title) {
    return String(messageObj.listResponseMessage.title);
  }

  return '';
}

export class ContactPolicyService {
  /**
   * Avalia se uma mensagem expressa vontade de cancelamento/descadastro (Opt-Out)
   */
  static isOptOutMessage(rawText: string): OptOutCheckResult {
    const normalized = normalizeOptOutText(rawText);
    if (!normalized) return { isOptOut: false };

    for (const pattern of OPT_OUT_PATTERNS) {
      if (pattern.test(normalized)) {
        return { isOptOut: true, matchedKeyword: pattern.source };
      }
    }

    return { isOptOut: false };
  }

  /**
   * Processa o Opt-Out de forma atômica:
   * 1. Adiciona o telefone na Blacklist do workspace
   * 2. Atualiza todos os leads pendentes/na fila com status OPTED_OUT
   * 3. Registra em AuditLog para evidência regulatória LGPD
   */
  static async processOptOut(params: {
    phone: string;
    workspaceId: string;
    evidenceText: string;
  }): Promise<void> {
    const { phone, workspaceId, evidenceText } = params;
    const cleanPhone = phone.replace(/\D/g, '');

    await prisma.$transaction(async (tx) => {
      // 1. Registra ou atualiza na Blacklist
      const existing = await tx.blacklist.findFirst({
        where: {
          phone: cleanPhone,
          OR: [
            { scope: 'GLOBAL' },
            { scope: 'WORKSPACE', workspaceId }
          ]
        }
      });

      if (!existing) {
        await tx.blacklist.create({
          data: {
            scope: 'WORKSPACE',
            workspaceId,
            phone: cleanPhone,
            reason: 'OPT_OUT',
            source: 'INCOMING_MESSAGE',
            metadata: JSON.stringify({
              snippet: evidenceText.slice(0, 100),
              date: new Date().toISOString()
            })
          }
        });
      }

      // 2. Atualiza leads pendentes do workspace para OPTED_OUT
      await tx.lead.updateMany({
        where: {
          phone: { in: [cleanPhone, `+${cleanPhone}`] },
          campaign: { workspaceId },
          status: { in: ['PENDING', 'QUEUED', 'SENDING'] }
        },
        data: {
          status: 'OPTED_OUT',
          optedOutAt: new Date(),
          errorMessage: 'Contato solicitou cancelamento/descadastro (Opt-out LGPD).'
        }
      });

      // 3. Auditoria da ação
      await tx.auditLog.create({
        data: {
          workspaceId,
          action: 'BLACKLIST_ADD',
          targetType: 'BLACKLIST',
          targetId: cleanPhone,
          details: `Opt-out automático via mensagem recebida. Snippet: "${evidenceText.slice(0, 50)}"`
        }
      });
    });

    console.log(`[OPT-OUT LGPD] Telefone ${cleanPhone} incluído na Blacklist do workspace ${workspaceId}.`);
  }

  /**
   * Verifica se um telefone está bloqueado (Global ou Workspace)
   */
  static async isBlacklisted(phone: string, workspaceId: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');

    try {
      if (!prisma.blacklist?.findFirst) return false;
      const found = await prisma.blacklist.findFirst({
        where: {
          phone: cleanPhone,
          OR: [
            { scope: 'GLOBAL' },
            { scope: 'WORKSPACE', workspaceId }
          ]
        },
        select: { id: true, scope: true }
      });

      return !!found;
    } catch {
      return false;
    }
  }

}
