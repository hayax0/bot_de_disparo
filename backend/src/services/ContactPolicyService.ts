import { prisma } from '../lib/prisma';
import crypto from 'crypto';

export interface OptOutCheckResult {
  isOptOut: boolean;
  matchedKeyword?: string;
}

export interface BusinessWindowCheckResult {
  isInWindow: boolean;
  nextOpenTimestamp?: number;
  delayMs?: number;
  reason?: string;
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

  /**
   * Verifica se o contato já foi acionado recentemente no período de recontato
   */
  static async isRecentContact(params: {
    phone: string;
    workspaceId: string;
    recontactAfterDays: number;
  }): Promise<{ isRecent: boolean; lastSentAt?: Date }> {
    const { phone, workspaceId, recontactAfterDays } = params;
    if (recontactAfterDays <= 0) return { isRecent: false };

    const cleanPhone = phone.replace(/\D/g, '');
    const cutoffDate = new Date(Date.now() - recontactAfterDays * 24 * 60 * 60 * 1000);

    try {
      if (!prisma.dispatchHistory?.findFirst) return { isRecent: false };
      const history = await prisma.dispatchHistory.findFirst({
        where: {
          workspaceId,
          phone: cleanPhone,
          lastSentAt: { gte: cutoffDate }
        },
        select: { lastSentAt: true }
      });

      if (history) {
        return { isRecent: true, lastSentAt: history.lastSentAt };
      }

      return { isRecent: false };
    } catch {
      return { isRecent: false };
    }
  }

  /**
   * Avalia se o instante atual está dentro da janela comercial permitida da campanha.
   * Se estiver fora, calcula o timestamp da próxima abertura para usar no moveToDelayed do BullMQ.
   */
  static checkBusinessWindow(params: {
    now?: Date;
    scheduleStartMinute: number;
    scheduleEndMinute: number;
    scheduleDays: string; // Ex: "1,2,3,4,5,6" (0=Dom, 6=Sab)
    scheduleTimezone: string; // Ex: "America/Sao_Paulo"
  }): BusinessWindowCheckResult {
    const {
      now = new Date(),
      scheduleStartMinute,
      scheduleEndMinute,
      scheduleDays,
      scheduleTimezone
    } = params;

    const allowedDays = scheduleDays.split(',').map(d => parseInt(d.trim(), 10)).filter(n => !isNaN(n));

    // Formata o instante na timezone configurada
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: scheduleTimezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'narrow',
    });

    // Obtém detalhes locais da timezone
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';

    const localYear = parseInt(getPart('year'), 10);
    const localMonth = parseInt(getPart('month'), 10) - 1;
    const localDay = parseInt(getPart('day'), 10);
    const localHour = parseInt(getPart('hour'), 10);
    const localMinute = parseInt(getPart('minute'), 10);

    const localDate = new Date(localYear, localMonth, localDay, localHour, localMinute);
    const currentDayOfWeek = localDate.getDay(); // 0 a 6
    const currentMinuteOfDay = localHour * 60 + localMinute;

    const isDayAllowed = allowedDays.includes(currentDayOfWeek);
    const isTimeAllowed = currentMinuteOfDay >= scheduleStartMinute && currentMinuteOfDay < scheduleEndMinute;

    if (isDayAllowed && isTimeAllowed) {
      return { isInWindow: true };
    }

    // Calcula próxima abertura (pode ser hoje mais tarde ou no próximo dia permitido)
    let nextOpenMinuteOfDay = scheduleStartMinute;
    let daysToAdd = 0;

    if (isDayAllowed && currentMinuteOfDay < scheduleStartMinute) {
      // Abre ainda hoje mais tarde
      daysToAdd = 0;
    } else {
      // Procura o próximo dia permitido
      daysToAdd = 1;
      let nextDayOfWeek = (currentDayOfWeek + 1) % 7;
      while (!allowedDays.includes(nextDayOfWeek) && daysToAdd <= 7) {
        daysToAdd++;
        nextDayOfWeek = (nextDayOfWeek + 1) % 7;
      }
    }

    const minutesUntilNext = (daysToAdd * 24 * 60) + (nextOpenMinuteOfDay - currentMinuteOfDay);
    const delayMs = Math.max(minutesUntilNext * 60 * 1000, 60000); // Mínimo 1 minuto
    const nextOpenTimestamp = now.getTime() + delayMs;

    return {
      isInWindow: false,
      nextOpenTimestamp,
      delayMs,
      reason: !isDayAllowed
        ? `Dia da semana (${currentDayOfWeek}) fora dos permitidos [${scheduleDays}]`
        : `Horário (${localHour}:${String(localMinute).padStart(2, '0')}) fora da janela [${scheduleStartMinute / 60}h-${scheduleEndMinute / 60}h]`
    };
  }
}
