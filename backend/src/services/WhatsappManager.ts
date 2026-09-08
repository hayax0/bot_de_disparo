import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  WASocket,
  proto,
  CacheStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

// Armazenamento em memória compatível com a interface CacheStore do Baileys 6.7.24
export class MemoryCacheStore implements CacheStore {
  private map = new Map<string, any>();
  private maxItems: number;

  constructor(maxItems = 5000) {
    this.maxItems = maxItems;
  }

  get<T>(key: string): T | undefined {
    return this.map.get(key);
  }

  set<T>(key: string, value: T): void {
    if (this.map.size >= this.maxItems) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
      }
    }
    this.map.set(key, value);
  }

  del(key: string): void {
    this.map.delete(key);
  }

  flushAll(): void {
    this.map.clear();
  }
}

// Estados de conexão explícitos por Workspace
export type WorkspaceConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

// Clientes ativos em memória (workspaceId -> WASocket)
const sessions = new Map<string, WASocket>();
// Promessas de inicialização em andamento (evita criar 2 sockets concorrentes para o mesmo workspace)
const initializing = new Map<string, Promise<WASocket>>();
// Timers de reconexão automática (workspaceId -> Timeout)
const reconnectTimers = new Map<string, NodeJS.Timeout>();
// Tentativas de reconexão por workspace (para backoff exponencial)
const reconnectAttempts = new Map<string, number>();
// Workspaces desconectados manualmente pelo usuário (não devem reconectar sozinhos)
const manualDisconnects = new Set<string>();

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000;

const logger = pino({ level: 'silent' });

function getAuthDirectory(workspaceId: string): string {
  return path.join(process.cwd(), '.baileys_auth', workspaceId);
}

function cleanSessionDirectory(workspaceId: string) {
  try {
    const sessionDir = getAuthDirectory(workspaceId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`[WHATSAPP CLEANUP] Sessão Baileys limpa para workspace ${workspaceId}`);
    }
  } catch (fsErr) {
    console.warn(`[WHATSAPP CLEANUP] Falha ao limpar pasta de autenticação ${workspaceId}:`, fsErr);
  }
}

async function destroyAndCleanup(workspaceId: string, cleanFiles = false) {
  const client = sessions.get(workspaceId);
  sessions.delete(workspaceId);
  if (client) {
    try {
      client.end(undefined);
    } catch (err) {
      console.error(`[WHATSAPP DESTROY] Erro ao encerrar cliente de ${workspaceId}:`, err);
    }
  }
  if (cleanFiles) {
    cleanSessionDirectory(workspaceId);
  }
}

function clearReconnectTimer(workspaceId: string) {
  const timer = reconnectTimers.get(workspaceId);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(workspaceId);
  }
}

function scheduleReconnect(workspaceId: string, immediate = false) {
  if (manualDisconnects.has(workspaceId)) return;
  if (sessions.has(workspaceId) || initializing.has(workspaceId)) return;
  if (reconnectTimers.has(workspaceId)) return;

  const attempt = (reconnectAttempts.get(workspaceId) || 0) + 1;
  if (attempt > MAX_RECONNECT_ATTEMPTS) {
    console.error(`[WHATSAPP RECONNECT] Limite de ${MAX_RECONNECT_ATTEMPTS} tentativas atingido p/ workspace ${workspaceId}.`);
    reconnectAttempts.delete(workspaceId);
    return;
  }
  reconnectAttempts.set(workspaceId, attempt);

  const delay = immediate
    ? 1500
    : Math.min(BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt - 1), MAX_RECONNECT_DELAY_MS) + Math.floor(Math.random() * 2000);

  console.log(`[WHATSAPP RECONNECT] Reconexão agendada p/ workspace ${workspaceId} em ${Math.round(delay / 1000)}s (tentativa ${attempt}/${MAX_RECONNECT_ATTEMPTS})`);

  const timer = setTimeout(() => {
    reconnectTimers.delete(workspaceId);
    if (manualDisconnects.has(workspaceId) || sessions.has(workspaceId) || initializing.has(workspaceId)) return;
    WhatsappManager.getClient(workspaceId).catch(err => {
      console.error(`[WHATSAPP RECONNECT] Falha ao reconectar workspace ${workspaceId}:`, err?.message || err);
    });
  }, delay);

  reconnectTimers.set(workspaceId, timer);
}

export class WhatsappManager {

  // Cache de códigos de pareamento (workspaceId -> { code, phone, expiresAt })
  private static pairingCache = new Map<string, { code: string; phone: string; expiresAt: number }>();
  // Workspaces atualmente em processo de pareamento por código (bloqueia sobreposição de QR no banco)
  private static pairingActive = new Set<string>();

  // Armazenamento em memória das mensagens enviadas para atender retries criptográficos do Signal/Baileys (key.id -> proto.IMessage)
  private static sentMessages = new Map<string, proto.IMessage>();
  private static readonly MAX_SENT_CACHE = 5000;

  static cacheSentMessage(id: string, message: proto.IMessage) {
    if (this.sentMessages.size >= this.MAX_SENT_CACHE) {
      const oldestKey = this.sentMessages.keys().next().value;
      if (oldestKey !== undefined) {
        this.sentMessages.delete(oldestKey);
      }
    }
    this.sentMessages.set(id, message);
  }

  static getCachedMessage(id: string): proto.IMessage | undefined {
    return this.sentMessages.get(id);
  }

  static clearSentMessagesCache() {
    this.sentMessages.clear();
  }

  // Recupera mensagem para retries criptográficos do Baileys/Signal (Cache em memória -> Fallback no banco de dados)
  static async recoverMessageContent(key: proto.IMessageKey): Promise<proto.IMessage | undefined> {
    if (!key?.id) return undefined;

    // 1. Tenta recuperar do cache rápido em memória
    const cached = WhatsappManager.getCachedMessage(key.id);
    if (cached) {
      return cached;
    }

    // 2. Fallback resiliente: busca no banco de dados para retries pós-restart
    try {
      const lead = await prisma.lead.findFirst({
        where: { wppMessageId: key.id },
        select: { messageContent: true }
      });
      if (lead?.messageContent) {
        console.log(`[WhatsApp Retry] Mensagem recuperada do banco de dados p/ retry criptográfico: messageId=${key.id}`);
        return {
          extendedTextMessage: {
            text: lead.messageContent
          }
        };
      }
    } catch (dbErr) {
      console.error(`[WhatsApp Retry] Erro ao buscar mensagem no banco para retry (id=${key.id}):`, dbErr);
    }

    return undefined;
  }

  // Máscara de telefone para logs seguros (ex: 5521997679775 -> 5521*****9775)
  static maskPhone(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    if (clean.length <= 6) return clean;
    const start = clean.slice(0, 4);
    const end = clean.slice(-4);
    return `${start}${'*'.repeat(Math.max(2, clean.length - 8))}${end}`;
  }

  static isPairingActive(workspaceId: string): boolean {
    const cached = this.pairingCache.get(workspaceId);
    if (!cached) return false;
    if (Date.now() > cached.expiresAt) {
      this.pairingCache.delete(workspaceId);
      this.pairingActive.delete(workspaceId);
      return false;
    }
    return true;
  }

  static clearPairingState(workspaceId: string) {
    this.pairingCache.delete(workspaceId);
    this.pairingActive.delete(workspaceId);
  }

  static getConnectionState(workspaceId: string): WorkspaceConnectionState {
    if (sessions.has(workspaceId)) return 'CONNECTED';
    if (initializing.has(workspaceId) || reconnectTimers.has(workspaceId)) return 'CONNECTING';
    return 'DISCONNECTED';
  }

  static async getClient(workspaceId: string): Promise<WASocket> {
    const existing = sessions.get(workspaceId);
    if (existing) return existing;

    const pending = initializing.get(workspaceId);
    if (pending) return pending;

    manualDisconnects.delete(workspaceId);

    const initPromise = this.createClient(workspaceId);
    initializing.set(workspaceId, initPromise);

    try {
      const client = await initPromise;
      sessions.set(workspaceId, client);
      return client;
    } finally {
      initializing.delete(workspaceId);
    }
  }

  private static async createClient(workspaceId: string): Promise<WASocket> {
    const authDir = getAuthDirectory(workspaceId);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1017054665] as [number, number, number]
    }));

    const msgRetryCounterCache = new MemoryCacheStore(5000);

    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      msgRetryCounterCache,
      getMessage: WhatsappManager.recoverMessageContent,
      printQRInTerminal: false,
      browser: Browsers.appropriate('Chrome'),
      // DESATIVAÇÃO TOTAL DE SINCRONIZAÇÃO DE HISTÓRICO (mandatório p/ bot de disparos)
      shouldSyncHistoryMessage: () => false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    // Salva credenciais atualizadas de forma segura
    sock.ev.on('creds.update', saveCreds);

    // Gerenciador de conexão e QR Code
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Se pareamento por código estiver ativo, não sobrescreve com QR code
        if (WhatsappManager.isPairingActive(workspaceId)) {
          console.log(`[WHATSAPP QR] QR Code suprimido para workspace ${workspaceId} pois pareamento por código está ativo.`);
          return;
        }

        console.log(`[WHATSAPP QR] QR Code gerado para o workspace ${workspaceId}`);
        try {
          const qrBase64 = await qrcode.toDataURL(qr);
          await prisma.whatsappSession.upsert({
            where: { workspaceId },
            update: { status: 'QRCODE', sessionData: qrBase64 },
            create: { workspaceId, status: 'QRCODE', sessionData: qrBase64 }
          });
        } catch (err) {
          console.error('[WHATSAPP QR ERROR] Erro ao gerar base64 do QR code:', err);
        }
      }

      if (connection === 'open') {
        console.log(`[WHATSAPP READY] Sessão conectada e pronta para o workspace ${workspaceId}`);
        WhatsappManager.clearPairingState(workspaceId);
        reconnectAttempts.delete(workspaceId);
        clearReconnectTimer(workspaceId);
        await prisma.whatsappSession.upsert({
          where: { workspaceId },
          update: { status: 'CONNECTED', sessionData: null },
          create: { workspaceId, status: 'CONNECTED', sessionData: null }
        }).catch(err => console.error('Erro ao persistir conexão no banco:', err));
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;
        const isReplaced = statusCode === DisconnectReason.connectionReplaced;

        console.log(`[WHATSAPP DISCONNECTED] Sessão desconectada p/ workspace ${workspaceId}: status ${statusCode} (loggedOut=${isLoggedOut}, restartRequired=${isRestartRequired}, replaced=${isReplaced})`);

        sessions.delete(workspaceId);

        if (isLoggedOut) {
          console.log(`[WHATSAPP LOGOUT] Logout permanente p/ workspace ${workspaceId}. Limpando arquivos...`);
          WhatsappManager.clearPairingState(workspaceId);
          reconnectAttempts.delete(workspaceId);
          clearReconnectTimer(workspaceId);
          cleanSessionDirectory(workspaceId);
          await prisma.whatsappSession.update({
            where: { workspaceId },
            data: { status: 'DISCONNECTED', sessionData: null }
          }).catch(() => {});
        } else if (isReplaced) {
          console.warn(`[WHATSAPP WARNING] Sessão substituída por outra conexão (440) no workspace ${workspaceId}. Evitando reconexão em loop.`);
          clearReconnectTimer(workspaceId);
          await prisma.whatsappSession.update({
            where: { workspaceId },
            data: { status: 'DISCONNECTED', sessionData: null }
          }).catch(() => {});
        } else {
          await prisma.whatsappSession.update({
            where: { workspaceId },
            data: { status: 'DISCONNECTED', sessionData: null }
          }).catch(() => {});
          scheduleReconnect(workspaceId, isRestartRequired);
        }
      }
    });

    // ── Processamento de ACKs e Confirmações de Entrega/Leitura ──
    sock.ev.on('messages.update', async (updates) => {
      try {
        for (const update of updates) {
          // Apenas processamos confirmações de mensagens enviadas por nós
          if (!update.key?.fromMe) continue;
          const messageId = update.key?.id;
          if (!messageId) continue;

          const status = update.update?.status;
          if (status === undefined || status === null) continue;

          await WhatsappManager.handleMessageStatusUpdate(workspaceId, messageId, status, update.key.remoteJid);
        }
      } catch (err) {
        console.error('[WHATSAPP ACK ERROR] Erro ao processar messages.update:', err);
      }
    });

    // Captura respostas dos contatos e atualiza métricas de Leads Respondidos
    sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        for (const msg of messages) {
          if (msg.key.fromMe) continue;
          const senderJid = msg.key.remoteJid;
          if (!senderJid || senderJid.includes('@g.us') || senderJid.includes('status@broadcast')) continue;

          const senderPhone = senderJid.replace(/\D/g, '');
          if (!senderPhone) continue;

          const mostRecentLead = await prisma.lead.findFirst({
            where: {
              OR: [
                { phone: senderPhone },
                { phone: { endsWith: senderPhone.length >= 8 ? senderPhone.slice(-8) : senderPhone } }
              ],
              campaign: { workspaceId },
              status: { in: ['SENT', 'DELIVERED', 'READ'] }
            },
            orderBy: { sentAt: 'desc' }
          });

          if (mostRecentLead) {
            await prisma.lead.update({
              where: { id: mostRecentLead.id },
              data: { status: 'REPLIED' }
            });
            console.log(`[LEAD REPLIED] Contato ${WhatsappManager.maskPhone(senderPhone)} respondeu; Lead "${mostRecentLead.title}" atualizado para REPLIED.`);
          }
        }
      } catch (err) {
        console.error('Erro ao processar mensagem recebida:', err);
      }
    });

    return sock;
  }

  // Atualização atômica, idempotente e monotônica do status do Lead a partir dos ACKs do Baileys
  static async handleMessageStatusUpdate(
    workspaceId: string,
    messageId: string,
    status: proto.WebMessageInfo.Status | number,
    remoteJid?: string | null
  ) {
    try {
      const lead = await prisma.lead.findFirst({
        where: {
          wppMessageId: messageId,
          campaign: { workspaceId }
        }
      });

      if (!lead) {
        return;
      }

      const maskedPhone = this.maskPhone(lead.phone);
      const now = new Date();

      // Se o lead já estiver em REPLIED, preserva REPLIED (não retrocede)
      if (lead.status === 'REPLIED') {
        if (status === proto.WebMessageInfo.Status.DELIVERY_ACK && !lead.deliveredAt) {
          await prisma.lead.update({ where: { id: lead.id }, data: { deliveredAt: now } });
        } else if ((status === proto.WebMessageInfo.Status.READ || status === proto.WebMessageInfo.Status.PLAYED) && !lead.readAt) {
          await prisma.lead.update({ where: { id: lead.id }, data: { readAt: now } });
        }
        return;
      }

      // Ordem monotônica: SENDING -> SENT -> DELIVERED -> READ
      if (status === proto.WebMessageInfo.Status.SERVER_ACK) {
        // 1 tick: WhatsApp aceitou/processou o envio
        if (lead.status === 'PENDING' || lead.status === 'QUEUED' || lead.status === 'SENDING') {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              status: 'SENT',
              sentAt: lead.sentAt || now
            }
          });
          console.log(`[WhatsApp ACK] SERVER_ACK recebido (1 tick ✓) | workspace=${workspaceId} leadId=${lead.id} messageId=${messageId} phone=${maskedPhone}`);
        }
      } else if (status === proto.WebMessageInfo.Status.DELIVERY_ACK) {
        // 2 ticks cinzas: Entregue ao aparelho de destino
        if (lead.status === 'PENDING' || lead.status === 'QUEUED' || lead.status === 'SENDING' || lead.status === 'SENT') {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              status: 'DELIVERED',
              deliveredAt: lead.deliveredAt || now
            }
          });
          console.log(`[WhatsApp ACK] DELIVERY_ACK recebido (2 ticks ✓✓) | workspace=${workspaceId} leadId=${lead.id} messageId=${messageId} phone=${maskedPhone}`);
        }
      } else if (status === proto.WebMessageInfo.Status.READ || status === proto.WebMessageInfo.Status.PLAYED) {
        // 2 ticks azuis: Mensagem visualizada pelo destinatário
        if (lead.status !== 'READ') {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              status: 'READ',
              deliveredAt: lead.deliveredAt || now,
              readAt: lead.readAt || now
            }
          });
          console.log(`[WhatsApp ACK] READ recebido (2 ticks azuis ✓✓) | workspace=${workspaceId} leadId=${lead.id} messageId=${messageId} phone=${maskedPhone}`);
        }
      }
    } catch (err: any) {
      console.error(`[WHATSAPP ACK ERROR] Falha ao atualizar status para messageId=${messageId}:`, err?.message || err);
    }
  }

  // Restaura sessões ativas automaticamente na inicialização do servidor
  static async restoreConnectedSessions() {
    try {
      const activeSessions = await prisma.whatsappSession.findMany({
        where: { status: 'CONNECTED' }
      });
      for (const sess of activeSessions) {
        if (!sessions.has(sess.workspaceId) && !initializing.has(sess.workspaceId) && !reconnectTimers.has(sess.workspaceId) && !manualDisconnects.has(sess.workspaceId)) {
          console.log(`[WHATSAPP RESTORE] Restaurando cliente em background para workspace ${sess.workspaceId}...`);
          this.getClient(sess.workspaceId).catch(e => {
            console.error(`Erro ao restaurar sessão para ${sess.workspaceId}:`, e?.message || e);
          });
        }
      }
    } catch (err) {
      console.error('Erro ao verificar sessões para restauração:', err);
    }
  }

  // Watchdog: roda periodicamente e restaura sessões que constam CONNECTED no banco mas sem socket ativo
  static startWatchdog(intervalMs = 60000) {
    setInterval(() => {
      this.restoreConnectedSessions();
    }, intervalMs);
    console.log(`[WHATSAPP WATCHDOG] Watchdog ativo (intervalo de ${intervalMs / 1000}s).`);
  }

  // Consulta de status do WhatsApp pura (sem abrir conexões silenciosas durante polling)
  static async getStatus(workspaceId: string) {
    const session = await prisma.whatsappSession.findUnique({
      where: { workspaceId }
    });

    if (!session) {
      return { status: 'DISCONNECTED', qrCode: null };
    }

    const isLive = sessions.has(workspaceId);
    const isConnecting = initializing.has(workspaceId) || reconnectTimers.has(workspaceId);

    // Se está CONNECTED no banco mas o socket não está vivo, reporta estado sem disparar socket concorrente
    if (!isLive && session.status === 'CONNECTED') {
      return {
        status: isConnecting ? 'CONNECTING' : 'DISCONNECTED',
        qrCode: null,
        reconnecting: isConnecting
      };
    }

    // QR órfão: se não está nem conectando nem ativo, limpa no banco
    if (!isLive && session.status === 'QRCODE') {
      if (!isConnecting) {
        await prisma.whatsappSession.update({
          where: { workspaceId },
          data: { status: 'DISCONNECTED', sessionData: null }
        }).catch(() => {});
        return { status: 'DISCONNECTED', qrCode: null };
      }
    }

    return {
      status: session.status,
      qrCode: session.status === 'QRCODE' ? session.sessionData : null
    };
  }

  static async disconnect(workspaceId: string) {
    manualDisconnects.add(workspaceId);
    clearReconnectTimer(workspaceId);
    reconnectAttempts.delete(workspaceId);

    await destroyAndCleanup(workspaceId, true);

    await prisma.whatsappSession.update({
      where: { workspaceId },
      data: { status: 'DISCONNECTED', sessionData: null }
    }).catch(() => {});
  }

  static async destroyAll() {
    console.log('[WHATSAPP SHUTDOWN] Encerrando todas as sessões do WhatsApp...');
    for (const [workspaceId] of sessions) {
      clearReconnectTimer(workspaceId);
      await destroyAndCleanup(workspaceId, false);
    }
  }

  // Resolve o identificador JID correto do WhatsApp no Brasil
  static async resolveNumberId(client: any, phone: string): Promise<string | null> {
    let clean = phone.replace(/\D/g, '').replace(/^0+/, '');
    if (clean.length >= 10 && clean.length <= 11) {
      clean = '55' + clean;
    }

    const checkNumber = async (num: string): Promise<string | null> => {
      if (typeof client?.onWhatsApp === 'function') {
        try {
          const res = await client.onWhatsApp(num);
          const item = Array.isArray(res) ? res[0] : res;
          if (item && item.exists && item.jid) {
            return item.jid;
          }
        } catch (queryErr: any) {
          console.warn(`[WhatsApp USync] Falha ao consultar onWhatsApp(${num}):`, queryErr?.message || queryErr);
        }
      } else if (typeof client?.getNumberId === 'function') {
        try {
          const res = await client.getNumberId(num);
          if (res && res._serialized) {
            return res._serialized;
          }
        } catch {}
      }
      return null;
    };

    // 1. Tenta com o número exato fornecido
    const direct = await checkNumber(clean);
    if (direct) {
      console.log(`[WhatsApp JID] Número ${this.maskPhone(phone)} resolvido diretamente -> ${direct}`);
      return direct;
    }

    // 2. Se for número do Brasil (55 + DDD + 8 ou 9 dígitos)
    if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
      const ddd = clean.slice(2, 4);
      const rest = clean.slice(4);

      // Se tem 13 dígitos (55 + DDD + 9 + 8 dígitos), tenta sem o 9º dígito (contas antigas)
      if (clean.length === 13 && rest.startsWith('9')) {
        const withoutNine = `55${ddd}${rest.slice(1)}`;
        const fallbackRes = await checkNumber(withoutNine);
        if (fallbackRes) {
          console.log(`[WhatsApp JID] Número ${this.maskPhone(phone)} resolvido sem 9º dígito -> ${fallbackRes}`);
          return fallbackRes;
        }
      }

      // Se tem 12 dígitos (55 + DDD + 8 dígitos), tenta com o 9º dígito
      if (clean.length === 12) {
        const withNine = `55${ddd}9${rest}`;
        const fallbackRes = await checkNumber(withNine);
        if (fallbackRes) {
          console.log(`[WhatsApp JID] Número ${this.maskPhone(phone)} resolvido com 9º dígito -> ${fallbackRes}`);
          return fallbackRes;
        }
      }
    }

    console.warn(`[WhatsApp JID] Número ${this.maskPhone(phone)} não possui WhatsApp ativo (resolveNumberId retornou null)`);
    return null;
  }

  // Envia mensagem e retorna os dados reais de envio do Baileys { messageId, jid }
  static async sendMessage(workspaceId: string, phone: string, message: string): Promise<{ messageId: string; jid: string }> {
    const client = sessions.get(workspaceId);
    if (!client) {
      throw new Error('WhatsApp não está conectado no momento.');
    }

    const targetChatId = await this.resolveNumberId(client, phone);
    if (!targetChatId) {
      throw new Error('Número não possui conta ativa no WhatsApp (ou é telefone fixo)');
    }

    const maskedPhone = this.maskPhone(phone);
    console.log(`[WhatsApp] Preparando envio | workspace=${workspaceId} phone=${maskedPhone} jid=${targetChatId}`);

    // Simula tempo de digitação natural antes de disparar (mínimo 1.5s, máximo 3.5s)
    const delay = Math.max(1500, Math.min(3500, message.length * 15));
    await new Promise(r => setTimeout(r, delay));

    try {
      if (typeof client.sendMessage === 'function') {
        const sent = await client.sendMessage(targetChatId, { text: message });
        const messageId = sent?.key?.id;
        if (!messageId) {
          throw new Error('Baileys não retornou o identificador da mensagem enviada.');
        }

        if (sent?.message) {
          WhatsappManager.cacheSentMessage(messageId, sent.message);
        }

        console.log(`[WhatsApp] Mensagem despachada no socket | workspace=${workspaceId} messageId=${messageId} jid=${targetChatId}`);
        return { messageId, jid: targetChatId };
      } else {
        throw new Error('Cliente WhatsApp inválido.');
      }
    } catch (sendErr: any) {
      console.error(`[WHATSAPP SEND ERROR] Falha ao enviar para ${targetChatId}:`, sendErr?.message || sendErr);
      throw sendErr;
    }
  }

  // Normaliza telefone brasileiro garantindo DDI 55, DDD e 9º dígito
  static normalizeBrPhone(phone: string): string {
    let clean = phone.replace(/\D/g, '').replace(/^0+/, '');

    if (clean.startsWith('55')) {
      if (clean.length === 12) {
        const ddd = clean.slice(2, 4);
        const num = clean.slice(4);
        if (['6', '7', '8', '9'].includes(num[0])) {
          clean = `55${ddd}9${num}`;
        }
      }
      return clean;
    }

    if (clean.length === 10) {
      const ddd = clean.slice(0, 2);
      const num = clean.slice(2);
      if (['6', '7', '8', '9'].includes(num[0])) {
        return `55${ddd}9${num}`;
      }
      return `55${clean}`;
    }

    if (clean.length === 11) {
      return `55${clean}`;
    }

    return clean;
  }

  // Solicita autenticação via código de pareamento de 8 dígitos (sem câmera/QR Code)
  static async requestPairingCode(workspaceId: string, phone: string): Promise<string> {
    const formattedPhone = this.normalizeBrPhone(phone);
    if (formattedPhone.length < 12) {
      throw new Error('Número de telefone inválido. Digite DDD + número celular com 9 dígitos (ex: 21997411009).');
    }

    const existing = this.pairingCache.get(workspaceId);
    if (existing && existing.phone === formattedPhone && existing.expiresAt > Date.now()) {
      console.log(`[WHATSAPP PAIRING] Reutilizando código ativo para ${formattedPhone} no workspace ${workspaceId}: ${existing.code}`);
      return existing.code;
    }

    this.pairingActive.add(workspaceId);
    const client = await this.getClient(workspaceId);

    // Aguarda o socket estabelecer o canal inicial caso seja recém-iniciado
    await new Promise(r => setTimeout(r, 1200));

    const rawCode = await client.requestPairingCode(formattedPhone);
    const code = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
    console.log(`[WHATSAPP PAIRING CODE] Código gerado para ${formattedPhone} no workspace ${workspaceId}: ${code}`);

    this.pairingCache.set(workspaceId, {
      code,
      phone: formattedPhone,
      expiresAt: Date.now() + 120000 // 2 minutos de validade
    });

    return code;
  }
}
