import { Client, LocalAuth, Chat } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

// This map holds the active Whatsapp clients in memory
// Key: workspaceId
const sessions = new Map<string, Client>();

export class WhatsappManager {
  
  static async getClient(workspaceId: string): Promise<Client> {
    if (sessions.has(workspaceId)) {
      return sessions.get(workspaceId)!;
    }

    // Initialize a new client with clean native WhatsApp Web and Anti-Detection flags
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: workspaceId,
        dataPath: './.wwebjs_auth' // Stores sessions locally inside backend folder
      }),
      puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-blink-features=AutomationControlled',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        ],
        timeout: 90000,
        protocolTimeout: 300000 
      }
    });

    sessions.set(workspaceId, client);

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
      console.log(`[WHATSAPP AUTH] Sessão autenticada pelo celular para o workspace ${workspaceId}`);
      await prisma.whatsappSession.upsert({
        where: { workspaceId },
        update: { status: 'CONNECTED', sessionData: null },
        create: { workspaceId, status: 'CONNECTED', sessionData: null }
      });
    });

    client.on('loading_screen', async (percent, message) => {
      console.log(`[WHATSAPP LOADING] ${percent}% - ${message} no workspace ${workspaceId}`);
      await prisma.whatsappSession.upsert({
        where: { workspaceId },
        update: { status: 'CONNECTED', sessionData: null },
        create: { workspaceId, status: 'CONNECTED', sessionData: null }
      });
    });

    client.on('ready', async () => {
      console.log(`[WHATSAPP READY] Conectado e pronto para o workspace ${workspaceId}`);
      await prisma.whatsappSession.upsert({
        where: { workspaceId },
        update: { status: 'CONNECTED', sessionData: null },
        create: { workspaceId, status: 'CONNECTED', sessionData: null }
      });
    });

    client.on('auth_failure', async (msg) => {
      console.error(`[WHATSAPP AUTH FAILURE] Falha de autenticação no workspace ${workspaceId}:`, msg);
      sessions.delete(workspaceId);
      await prisma.whatsappSession.update({
        where: { workspaceId },
        data: { status: 'DISCONNECTED', sessionData: null }
      }).catch(() => {});
    });

    // Listener para capturar respostas e atualizar métricas de Leads Respondidos
    client.on('message', async (msg) => {
      try {
        if (!msg.from || msg.from.includes('@g.us') || msg.isStatus) return; // Ignora grupos e stories
        const senderPhone = msg.from.replace(/\D/g, '');
        if (!senderPhone) return;

        // Atualizar o lead mais recentemente enviado para este telefone no workspace
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
      await prisma.whatsappSession.update({
        where: { workspaceId },
        data: { status: 'DISCONNECTED', sessionData: null }
      }).catch(() => {});
    });

    client.initialize().catch(err => {
      console.error(`Failed to initialize client for ${workspaceId}`, err);
    });

    return client;
  }

  // Restaura sessões ativas automaticamente na inicialização do servidor
  static async restoreConnectedSessions() {
    try {
      const activeSessions = await prisma.whatsappSession.findMany({
        where: { status: 'CONNECTED' }
      });
      for (const sess of activeSessions) {
        if (!sessions.has(sess.workspaceId)) {
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

  static async getStatus(workspaceId: string) {
    const session = await prisma.whatsappSession.findUnique({
      where: { workspaceId }
    });
    
    if (!session) {
      return { status: 'DISCONNECTED', qrCode: null };
    }

    // Se a sessão está marcada como CONNECTED no banco mas o processo reiniciou, reconecta em background
    if (!sessions.has(workspaceId) && session.status === 'CONNECTED') {
      this.getClient(workspaceId).catch(err => {
        console.error(`[AUTO RECONNECT] Erro ao reconectar workspace ${workspaceId}:`, err);
      });
      return { status: 'CONNECTED', qrCode: null };
    }

    // Se a sessão está marcada como QRCODE no banco mas não há cliente gerando no momento (QR expirado/órfão), reseta
    if (!sessions.has(workspaceId) && session.status === 'QRCODE') {
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
    const client = sessions.get(workspaceId);
    if (client) {
      try {
        await client.logout().catch(() => {});
        await client.destroy().catch(() => {});
      } catch (e) {
        console.error('Error logging out client', e);
      }
      sessions.delete(workspaceId);
    }

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

  // Resolve o identificador correto do WhatsApp no Brasil (tratando presença ou ausência do 9º dígito)
  static async resolveNumberId(client: Client, phone: string): Promise<string> {
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
    } catch {
      // continua para fallbacks
    }

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

    // 3. Se o getNumberId falhar ou expirar, envia diretamente no formato JID padrão
    return `${clean}@c.us`;
  }

  static async sendMessage(workspaceId: string, phone: string, message: string) {
    const client = sessions.get(workspaceId);
    if (!client) {
      throw new Error('WhatsApp não está conectado no momento.');
    }

    const targetChatId = await this.resolveNumberId(client, phone);

    // Simula tempo de digitação natural antes de disparar (mínimo 1.5s, máximo 4s)
    const delay = Math.max(1500, Math.min(4000, message.length * 15));
    await new Promise(r => setTimeout(r, delay));

    await client.sendMessage(targetChatId, message);
  }
}
