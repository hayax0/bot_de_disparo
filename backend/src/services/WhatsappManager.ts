import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  WASocket
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

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

function scheduleReconnect(workspaceId: string) {
  if (manualDisconnects.has(workspaceId)) return;
  if (sessions.has(workspaceId) || initializing.has(workspaceId)) return;
  if (reconnectTimers.has(workspaceId)) return;

  const attempt = (reconnectAttempts.get(workspaceId) || 0) + 1;
  if (attempt > MAX_RECONNECT_ATTEMPTS) {
    console.error(`[WHATSAPP RECONNECT] Limite de ${MAX_RECONNECT_ATTEMPTS} tentativas atingido p/ workspace ${workspaceId}. Aguardando ação manual via watchdog.`);
    reconnectAttempts.delete(workspaceId);
    return;
  }
  reconnectAttempts.set(workspaceId, attempt);

  const exponential = Math.min(BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt - 1), MAX_RECONNECT_DELAY_MS);
  const jitter = Math.floor(Math.random() * 3000);
  const delay = exponential + jitter;

  console.log(`[WHATSAPP RECONNECT] Reconexão agendada p/ workspace ${workspaceId} em ${Math.round(delay / 1000)}s (tentativa ${attempt}/${MAX_RECONNECT_ATTEMPTS})`);

  const timer = setTimeout(() => {
    reconnectTimers.delete(workspaceId);
    if (manualDisconnects.has(workspaceId) || sessions.has(workspaceId)) return;
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

    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      browser: Browsers.appropriate('Chrome'),
      // DESATIVAÇÃO TOTAL DE SINCRONIZAÇÃO DE HISTÓRICO (mandatório p/ bot de disparos)
      shouldSyncHistoryMessage: () => false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
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
        console.log(`[WHATSAPP DISCONNECTED] Sessão desconectada para o workspace ${workspaceId}: status ${statusCode} (isLoggedOut=${isLoggedOut})`);

        sessions.delete(workspaceId);

        if (isLoggedOut) {
          console.log(`[WHATSAPP LOGOUT] Logout permanente detectado para workspace ${workspaceId}. Limpando arquivos de sessão...`);
          WhatsappManager.clearPairingState(workspaceId);
          reconnectAttempts.delete(workspaceId);
          clearReconnectTimer(workspaceId);
          cleanSessionDirectory(workspaceId);
          await prisma.whatsappSession.update({
            where: { workspaceId },
            data: { status: 'DISCONNECTED', sessionData: null }
          }).catch(() => {});
        } else {
          await prisma.whatsappSession.update({
            where: { workspaceId },
            data: { status: 'DISCONNECTED', sessionData: null }
          }).catch(() => {});
          scheduleReconnect(workspaceId);
        }
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
              status: 'SENT'
            },
            orderBy: { sentAt: 'desc' }
          });

          if (mostRecentLead) {
            await prisma.lead.update({
              where: { id: mostRecentLead.id },
              data: { status: 'REPLIED' }
            });
            console.log(`[LEAD REPLIED] Contato ${senderPhone} respondeu; Lead "${mostRecentLead.title}" atualizado para REPLIED.`);
          }
        }
      } catch (err) {
        console.error('Erro ao processar mensagem recebida:', err);
      }
    });

    return sock;
  }

  // Restaura sessões ativas automaticamente na inicialização do servidor
  static async restoreConnectedSessions() {
    try {
      const activeSessions = await prisma.whatsappSession.findMany({
        where: { status: 'CONNECTED' }
      });
      for (const sess of activeSessions) {
        if (!sessions.has(sess.workspaceId) && !initializing.has(sess.workspaceId)) {
          console.log(`[WHATSAPP RESTORE] Restaurando cliente em background para workspace ${sess.workspaceId}...`);
          this.getClient(sess.workspaceId).catch(e => {
            console.error(`Erro ao restaurar sessão para ${sess.workspaceId}:`, e);
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

  static async getStatus(workspaceId: string) {
    const session = await prisma.whatsappSession.findUnique({
      where: { workspaceId }
    });

    if (!session) {
      return { status: 'DISCONNECTED', qrCode: null };
    }

    const hasLiveClient = sessions.has(workspaceId) || initializing.has(workspaceId);

    // Se está CONNECTED no banco mas sem socket vivo, reconecta em background
    if (!hasLiveClient && session.status === 'CONNECTED') {
      const hasReconnectScheduled = reconnectTimers.has(workspaceId);
      this.getClient(workspaceId).catch(err => {
        console.error(`[AUTO RECONNECT] Erro ao reconectar workspace ${workspaceId}:`, err);
      });
      return { status: hasReconnectScheduled ? 'DISCONNECTED' : 'QRCODE', qrCode: null, reconnecting: true };
    }

    // QR órfão: reseta para DISCONNECTED
    if (!hasLiveClient && session.status === 'QRCODE') {
      await prisma.whatsappSession.update({
        where: { workspaceId },
        data: { status: 'DISCONNECTED', sessionData: null }
      }).catch(() => {});
      return { status: 'DISCONNECTED', qrCode: null };
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
        } catch {}
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
    if (direct) return direct;

    // 2. Se for número do Brasil (55 + DDD + 8 ou 9 dígitos)
    if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
      const ddd = clean.slice(2, 4);
      const rest = clean.slice(4);

      // Se tem 13 dígitos (55 + DDD + 9 + 8 dígitos), tenta sem o 9º dígito (contas antigas)
      if (clean.length === 13 && rest.startsWith('9')) {
        const withoutNine = `55${ddd}${rest.slice(1)}`;
        const fallbackRes = await checkNumber(withoutNine);
        if (fallbackRes) return fallbackRes;
      }

      // Se tem 12 dígitos (55 + DDD + 8 dígitos), tenta com o 9º dígito
      if (clean.length === 12) {
        const withNine = `55${ddd}9${rest}`;
        const fallbackRes = await checkNumber(withNine);
        if (fallbackRes) return fallbackRes;
      }
    }

    return null;
  }

  static async sendMessage(workspaceId: string, phone: string, message: string) {
    const client = sessions.get(workspaceId);
    if (!client) {
      throw new Error('WhatsApp não está conectado no momento.');
    }

    let targetChatId = await this.resolveNumberId(client, phone);
    if (!targetChatId) {
      const normalized = this.normalizeBrPhone(phone);
      if (normalized.startsWith('55') && (normalized.length === 12 || normalized.length === 13)) {
        targetChatId = `${normalized}@s.whatsapp.net`;
      } else {
        throw new Error('Número não possui conta ativa no WhatsApp (ou é telefone fixo)');
      }
    }

    // Simula tempo de digitação natural antes de disparar (mínimo 1.5s, máximo 3.5s)
    const delay = Math.max(1500, Math.min(3500, message.length * 15));
    await new Promise(r => setTimeout(r, delay));

    try {
      if (typeof client.sendMessage === 'function') {
        await client.sendMessage(targetChatId, { text: message });
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
