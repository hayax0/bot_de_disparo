import express from 'express';
import cors from 'cors';
import { ENV } from './config/env';
import { prisma } from './lib/prisma';
import { connection as redisConnection } from './services/queue';

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

import authRoutes from './routes/auth';
import whatsappRoutes from './routes/whatsapp';
import campaignsRoutes from './routes/campaigns';
import './services/CampaignRunner';
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
      callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/campaigns', campaignsRoutes);

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

app.listen(ENV.PORT, () => {
  console.log(`🚀 SaaS Bot Server running on port ${ENV.PORT} [${ENV.NODE_ENV}]`);
  // Restaura sessões ativas do WhatsApp em background
  WhatsappManager.restoreConnectedSessions();
});
