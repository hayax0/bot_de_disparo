// Sentry precisa ser o PRIMEIRO import para instrumentar tudo corretamente
import { Sentry } from './lib/sentry';
import express from 'express';
import cors from 'cors';
import { ENV } from './config/env';
import { prisma } from './lib/prisma';
import { connection as redisConnection } from './services/queue';

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  Sentry.captureException(err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
  Sentry.captureException(reason);
});

import authRoutes from './routes/auth';
import whatsappRoutes from './routes/whatsapp';
import campaignsRoutes from './routes/campaigns';
import webhooksRoutes from './routes/webhooks';
import { campaignWorker, recoverOrphanedLeads } from './services/CampaignRunner';
import { messageQueue, queueEvents } from './services/queue';
import { WhatsappManager } from './services/WhatsappManager';

const app = express();

// Configuração estrita de CORS baseada em ENV
const allowedOrigins = ENV.CORS_ORIGIN.split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Permite chamadas sem origin (como curl, postman, healthcheck interno) ou se estiver na lista
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Recusa silenciosamente (sem headers CORS) em vez de lançar erro 500 sem tratamento
      console.warn(`[CORS] Origem bloqueada: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/webhooks', webhooksRoutes);

// Error handler do Sentry (depois das rotas, antes de qualquer handler customizado)
Sentry.setupExpressErrorHandler(app);

// Health check endpoint para monitoramento de infraestrutura
app.get('/api/health', async (req, res) => {
  let dbStatus = 'ok';
  let redisStatus = 'ok';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err: any) {
    dbStatus = `error: ${err.message}`;
  }

  try {
    await redisConnection.ping();
  } catch (err: any) {
    redisStatus = `error: ${err.message}`;
  }

  const isHealthy = dbStatus === 'ok' && redisStatus === 'ok';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      redis: redisStatus,
    }
  });
});

const server = app.listen(ENV.PORT, () => {
  console.log(`🚀 SaaS Bot Server running on port ${ENV.PORT} [${ENV.NODE_ENV}]`);
  // Restaura sessões ativas do WhatsApp em background
  WhatsappManager.restoreConnectedSessions();
  // Watchdog: restaura sessões que ficaram órfãs (Chromium crashado, etc.)
  WhatsappManager.startWatchdog(60000);
  // Recupera leads QUEUED sem job na fila (após reinício do servidor/Redis)
  recoverOrphanedLeads();
});

// ── Graceful shutdown ─────────────────────────────────────────────
// Fecha tudo na ordem correta para não corromper a sessão do WhatsApp
// (lock do Chromium) nem deixar jobs do BullMQ em estado inconsistente.
let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SHUTDOWN] Recebido ${signal}. Encerrando com segurança...`);

  const forceExit = setTimeout(() => {
    console.error('[SHUTDOWN] Timeout de 20s atingido, forçando saída.');
    process.exit(1);
  }, 20000);
  forceExit.unref();

  try {
    server.close();
    await campaignWorker.close();
    await messageQueue.close();
    await queueEvents.close();
    await WhatsappManager.destroyAll();
    await redisConnection.quit();
    await prisma.$disconnect();
    console.log('[SHUTDOWN] Encerrado com sucesso.');
    process.exit(0);
  } catch (err) {
    console.error('[SHUTDOWN] Erro durante encerramento:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
