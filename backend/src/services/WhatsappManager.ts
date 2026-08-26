import { Client, LocalAuth, Chat } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { prisma } from '../lib/prisma';

// This map holds the active Whatsapp clients in memory
// Key: workspaceId
const sessions = new Map<string, Client>();

export class WhatsappManager {
  
  static async getClient(workspaceId: string): Promise<Client> {
    if (sessions.has(workspaceId)) {
      return sessions.get(workspaceId)!;
    }

    // Initialize a new client
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: workspaceId,
        dataPath: './.wwebjs_auth' // Stores sessions locally inside backend folder
      }),
      puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ],
        timeout: 60000,
        protocolTimeout: 240000 
      }
    });

    sessions.set(workspaceId, client);

    client.on('qr', async (qrStr) => {
      console.log(`QR Code received for workspace ${workspaceId}`);
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

    client.on('ready', async () => {
      console.log(`WhatsApp ready for workspace ${workspaceId}`);
      await prisma.whatsappSession.upsert({
        where: { workspaceId },
        update: { status: 'CONNECTED', sessionData: null },
        create: { workspaceId, status: 'CONNECTED', sessionData: null }
      });
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
      console.log(`WhatsApp disconnected for workspace ${workspaceId}: ${reason}`);
      sessions.delete(workspaceId);
      await prisma.whatsappSession.update({
        where: { workspaceId },
        data: { status: 'DISCONNECTED', sessionData: null }
      });
    });

    client.initialize().catch(err => {
      console.error(`Failed to initialize client for ${workspaceId}`, err);
    });

    return client;
  }

  static async getStatus(workspaceId: string) {
    const session = await prisma.whatsappSession.findUnique({
      where: { workspaceId }
    });
    
    if (!session) {
      return { status: 'DISCONNECTED', qrCode: null };
    }

    // If we have a QR code, but the client in memory died, we should re-trigger
    if (!sessions.has(workspaceId) && session.status !== 'DISCONNECTED') {
       // Mark as disconnected so the frontend knows it needs to request connection again
       await prisma.whatsappSession.update({
         where: { workspaceId },
         data: { status: 'DISCONNECTED', sessionData: null }
       });
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
        await client.logout();
      } catch (e) {
        console.error('Error logging out', e);
      }
      sessions.delete(workspaceId);
    }
    await prisma.whatsappSession.update({
      where: { workspaceId },
      data: { status: 'DISCONNECTED', sessionData: null }
    });
  }

  static async sendMessage(workspaceId: string, phone: string, message: string) {
    const client = sessions.get(workspaceId);
    if (!client) {
      throw new Error('WhatsApp client not connected');
    }

    const chatId = `${phone}@c.us`;
    try {
      const chat = await client.getChatById(chatId) as Chat;
      if (chat) {
        await chat.sendStateTyping();
        // Simulate typing delay based on message length (min 3s, max 8s)
        const delay = Math.max(3000, Math.min(8000, message.length * 30));
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (err) {
      // Ignore if getChat fails, just try to send
    }

    await client.sendMessage(chatId, message);
  }
}
