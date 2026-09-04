import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

// Clientes ativos em memória (workspaceId -> Client)
const sessions = new Map<string, Client>();
// Promessas de inicialização em andamento (evita criar 2 Chromiums p/ o mesmo workspace)
const initializing = new Map<string, Promise<Client>>();
// Timers de reconexão automática (workspaceId -> Timeout)
const reconnectTimers = new Map<string, NodeJS.Timeout>();
// Tentativas de reconexão por workspace (para backoff exponencial)
const reconnectAttempts = new Map<string, number>();
// Workspaces desconectados manualmente pelo usuário (não devem reconectar sozinhos)
const manualDisconnects = new Set<string>();

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000;

// Remove arquivos de lock do Chromium que impedem re-inicialização após kill abrupto (trata symlinks quebrados)
function removeChromiumLocks(workspaceId: string) {
  try {
    const sessionDir = path.join(process.cwd(), '.wwebjs_auth', `session-${workspaceId}`);
    if (!fs.existsSync(sessionDir)) return;

    const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'parent.lock'];
    
    // Remove locks na raiz da sessão e na pasta Default
    const dirsToCheck = [sessionDir, path.join(sessionDir, 'Default')];

    for (const dir of dirsToCheck) {
      if (!fs.existsSync(dir)) continue;
      try {
        const entries = fs.readdirSync(dir);
        for (const file of entries) {
          if (lockFiles.includes(file) || file.startsWith('Singleton')) {
            const lockPath = path.join(dir, file);
            try {
              fs.unlinkSync(lockPath);
              console.log(`[WHATSAPP LOCK] Lock removido com sucesso: ${lockPath}`);
            } catch {
              try { fs.rmSync(lockPath, { force: true }); } catch {}
            }
          }
        }
      } catch (readErr) {
        console.warn(`[WHATSAPP LOCK] Erro ao ler pasta ${dir}:`, readErr);
      }
    }
  } catch (err) {
    console.warn(`[WHATSAPP LOCK] Falha ao remover locks do Chromium p/ ${workspaceId}:`, err);
  }
}

function cleanSessionDirectory(workspaceId: string) {
  try {
    const sessionDir = path.join(process.cwd(), '.wwebjs_auth', `session-${workspaceId}`);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`[WHATSAPP AUTO-CLEANUP] Pasta de sessão antiga limpa com sucesso para workspace ${workspaceId}`);
    }
  } catch (fsErr) {
    console.warn(`[WHATSAPP AUTO-CLEANUP] Falha ao remover pasta de sessão para ${workspaceId}:`, fsErr);
  }
}

// Destroi o cliente corretamente (mata o Chromium) e limpa o estado em memória
async function destroyAndCleanup(workspaceId: string, cleanFiles = false) {
  const client = sessions.get(workspaceId);
  sessions.delete(workspaceId);
  if (client) {
    try {
      await client.destroy();
    } catch (err) {
      console.error(`[WHATSAPP DESTROY] Erro ao destruir cliente de ${workspaceId}:`, err);
    }
  }
  removeChromiumLocks(workspaceId);
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

// Agenda reconexão automática com backoff exponencial + jitter
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

const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class WhatsappManager {

  static async getClient(workspaceId: string): Promise<Client> {
    const existing = sessions.get(workspaceId);
    if (existing) return existing;

    // Evitar corrida: se já existe uma inicialização em andamento, aguarda ela
    const pending = initializing.get(workspaceId);
    if (pending) return pending;

    manualDisconnects.delete(workspaceId);
    removeChromiumLocks(workspaceId);

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

  private static async createClient(workspaceId: string): Promise<Client> {
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: workspaceId,
        dataPath: './.wwebjs_auth'
      }),
      webVersionCache: {
        type: 'none'
      },
      userAgent: CHROME_USER_AGENT,
      bypassCSP: true,
      puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        headless: true,
        defaultViewport: { width: 1280, height: 800 },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--no-first-run',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-blink-features=AutomationControlled',
          `--user-agent=${CHROME_USER_AGENT}`
        ],
        timeout: 90000,
        protocolTimeout: 300000
      }
    });

    client.on('loading_screen', (percent, message) => {
      console.log(`[WHATSAPP LOADING] ${percent}% - ${message} (workspace ${workspaceId})`);
    });

    client.on('change_state', (state) => {
      console.log(`[WHATSAPP STATE] Estado alterado para: ${state} (workspace ${workspaceId})`);
    });

    client.on('qr', async (qrStr) => {
      console.log(`[WHATSAPP QR] QR Code gerado para o workspace ${workspaceId}`);
      try {
        const qrBase64 = await qrcode.toDataURL(qrStr);
        await prisma.whatsappSession.upsert({
          where: { workspaceId },
          update: { status: 'QRCODE', sessionData: qrBase64 },
          create: { workspaceId, status: 'QRCODE', sessionData: qrBase64 }
        });
      } catch (err) {
        console.error('Error generating QR code base64', err);
      }
    });

    client.on('authenticated', async () => {
      console.log(`[WHATSAPP AUTH] Sessão autenticada com sucesso no workspace ${workspaceId}`);
      reconnectAttempts.delete(workspaceId);
      await prisma.whatsappSession.upsert({
        where: { workspaceId },
        update: { status: 'CONNECTED', sessionData: null },
        create: { workspaceId, status: 'CONNECTED', sessionData: null }
      }).catch(err => console.error('Erro ao persistir autenticação:', err));
    });

    client.on('ready', async () => {
      console.log(`[WHATSAPP READY] Conectado e pronto para o workspace ${workspaceId}`);
      reconnectAttempts.delete(workspaceId);
      clearReconnectTimer(workspaceId);
      await prisma.whatsappSession.upsert({
        where: { workspaceId },
        update: { status: 'CONNECTED', sessionData: null },
        create: { workspaceId, status: 'CONNECTED', sessionData: null }
      }).catch(err => console.error('Erro ao persistir ready:', err));
    });

    client.on('auth_failure', async (msg) => {
      console.error(`[WHATSAPP AUTH FAILURE] Falha de autenticação no workspace ${workspaceId}:`, msg);
      reconnectAttempts.delete(workspaceId);
      await destroyAndCleanup(workspaceId, true);
      await prisma.whatsappSession.update({
        where: { workspaceId },
        data: { status: 'DISCONNECTED', sessionData: null }
      }).catch(() => {});
      // auth_failure geralmente exige novo QR Code — tenta reconectar p/ gerar novo QR
      scheduleReconnect(workspaceId);
    });

    // Listener para capturar respostas e atualizar métricas de Leads Respondidos
    client.on('message', async (msg) => {
      try {
        if (!msg.from || msg.from.includes('@g.us') || msg.isStatus) return; // Ignora grupos e stories
        const senderPhone = msg.from.replace(/\D/g, '');
        if (!senderPhone) return;

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
      } catch (err) {
        console.error('Erro ao processar mensagem recebida:', err);
      }
    });

    client.on('disconnected', async (reason) => {
      console.log(`[WHATSAPP DISCONNECTED] Sessão desconectada para o workspace ${workspaceId}: ${reason}`);
      sessions.delete(workspaceId);

      // Desliga o cliente sem apagar arquivos de sessão abruptamente
      setTimeout(async () => {
        try {
          await client.destroy().catch(() => {});
        } catch {}
        removeChromiumLocks(workspaceId);
      }, 1500);

      await prisma.whatsappSession.update({
        where: { workspaceId },
        data: { status: 'DISCONNECTED', sessionData: null }
      }).catch(() => {});

      // LOGOUT = ação manual no celular: não reconecta sozinho
      if (reason !== 'LOGOUT') {
        scheduleReconnect(workspaceId);
      }
    });

    try {
      await client.initialize();
      return client;
    } catch (err) {
      // Se o Chromium falhou ao iniciar, destrói tudo e agenda reconexão — sessão não fica órfã
      console.error(`[WHATSAPP INIT] Falha ao inicializar cliente p/ ${workspaceId}:`, (err as any)?.message || err);
      await destroyAndCleanup(workspaceId, true);
      removeChromiumLocks(workspaceId);
      scheduleReconnect(workspaceId);
      throw err;
    }
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

  // Watchdog: roda periodicamente e restaura sessões que constam CONNECTED no banco
  // mas não têm cliente vivo em memória (ex: após crash silencioso do Chromium)
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

    // Se está CONNECTED no banco mas sem cliente vivo, reconecta em background e avisa UI
    if (!hasLiveClient && session.status === 'CONNECTED') {
      const hasReconnectScheduled = reconnectTimers.has(workspaceId);
      this.getClient(workspaceId).catch(err => {
        console.error(`[AUTO RECONNECT] Erro ao reconectar workspace ${workspaceId}:`, err);
      });
      return { status: hasReconnectScheduled ? 'DISCONNECTED' : 'QRCODE', qrCode: null, reconnecting: true };
    }

    // QR órfão (cliente morreu enquanto gerava QR): reseta para DISCONNECTED
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

    await destroyAndCleanup(workspaceId);

    // Limpa a pasta de cache do Chromium para permitir nova conexão limpa
    try {
      const sessionDir = path.join(process.cwd(), '.wwebjs_auth', `session-${workspaceId}`);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`[WHATSAPP CLEANUP] Pasta de sessão limpa para workspace ${workspaceId}`);
      }
    } catch (fsErr) {
      console.warn('Não foi possível remover pasta de sessão:', fsErr);
    }

    await prisma.whatsappSession.update({
      where: { workspaceId },
      data: { status: 'DISCONNECTED', sessionData: null }
    }).catch(() => {});
  }

  // Destroi todos os clientes (usado no graceful shutdown)
  static async destroyAll() {
    console.log('[WHATSAPP SHUTDOWN] Encerrando todas as sessões do WhatsApp...');
    for (const [workspaceId] of sessions) {
      clearReconnectTimer(workspaceId);
      await destroyAndCleanup(workspaceId);
    }
  }

  // Resolve o identificador correto do WhatsApp no Brasil (tratando presença ou ausência do 9º dígito)
  static async resolveNumberId(client: Client, phone: string): Promise<string | null> {
    let clean = phone.replace(/\D/g, '').replace(/^0+/, '');
    if (clean.length >= 10 && clean.length <= 11) {
      clean = '55' + clean;
    }

    // 1. Tenta com o número exato fornecido
    try {
      const res = await client.getNumberId(clean);
      if (res && res._serialized) {
        return res._serialized;
      }
    } catch {}

    // 2. Se for número do Brasil (55 + DDD + 8 ou 9 dígitos)
    if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
      const ddd = clean.slice(2, 4);
      const rest = clean.slice(4);

      // Se tem 13 dígitos (55 + DDD + 9 + 8 dígitos), tenta consultar sem o 9º dígito (contas antigas)
      if (clean.length === 13 && rest.startsWith('9')) {
        const withoutNine = `55${ddd}${rest.slice(1)}`;
        try {
          const res = await client.getNumberId(withoutNine);
          if (res && res._serialized) {
            return res._serialized;
          }
        } catch {}
      }

      // Se tem 12 dígitos (55 + DDD + 8 dígitos), tenta consultar adicionando o 9º dígito
      if (clean.length === 12) {
        const withNine = `55${ddd}9${rest}`;
        try {
          const res = await client.getNumberId(withNine);
          if (res && res._serialized) {
            return res._serialized;
          }
        } catch {}
      }
    }

    return null;
  }

  static async sendMessage(workspaceId: string, phone: string, message: string) {
    const client = sessions.get(workspaceId);
    if (!client) {
      throw new Error('WhatsApp não está conectado no momento.');
    }

    // Valida e obtém o ID oficial registrado
    const targetChatId = await this.resolveNumberId(client, phone);
    if (!targetChatId) {
      throw new Error('Número não possui conta ativa no WhatsApp (ou é telefone fixo)');
    }

    // Simula tempo de digitação natural antes de disparar (mínimo 1.5s, máximo 3.5s)
    const delay = Math.max(1500, Math.min(3500, message.length * 15));
    await new Promise(r => setTimeout(r, delay));

    try {
      await client.sendMessage(targetChatId, message);
    } catch (sendErr: any) {
      const errMsg = sendErr?.message || String(sendErr);
      if (errMsg.includes('No LID') || errMsg.includes('wid error') || errMsg.includes('Cannot read properties of null')) {
        throw new Error('Número não possui conta ativa no WhatsApp (LID indisponível)');
      }
      throw sendErr;
    }
  }

  // Solicita autenticação via código de pareamento de 8 dígitos (sem câmera/QR Code)
  static async requestPairingCode(workspaceId: string, phone: string): Promise<string> {
    const client = await this.getClient(workspaceId);
    let clean = phone.replace(/\D/g, '').replace(/^0+/, '');
    if (clean.length >= 10 && clean.length <= 11) {
      clean = '55' + clean;
    }
    const code = await client.requestPairingCode(clean);
    console.log(`[WHATSAPP PAIRING CODE] Código gerado para ${clean} no workspace ${workspaceId}: ${code}`);
    return code;
  }
}
