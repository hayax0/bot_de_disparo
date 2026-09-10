import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { prisma } from '../lib/prisma';
import { connection as redisConnection } from '../services/queue';
import { mockMethod } from '../test-support/mockMethod';

async function serveHealthApp(t: any) {
  const app = express();
  app.use(express.json());

  // Rota de liveness
  app.get('/api/health/live', (req, res) => {
    const mem = process.memoryUsage();
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      }
    });
  });

  // Handler de readiness
  const handleReadinessCheck = async (req: express.Request, res: express.Response) => {
    const startTime = Date.now();
    let dbStatus = 'ok';
    let redisStatus = 'ok';
    let workerStatus = 'ok';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      dbStatus = `error: ${err.message}`;
    }

    try {
      await redisConnection.ping();
      const lastHeartbeat = await (redisConnection as any).get?.('worker:heartbeat');
      if (lastHeartbeat) {
        const ageMs = Date.now() - parseInt(lastHeartbeat, 10);
        if (ageMs > 60000) {
          workerStatus = `degraded: sem heartbeat há ${Math.round(ageMs / 1000)}s`;
        }
      } else {
        workerStatus = 'initializing';
      }
    } catch (err: any) {
      redisStatus = `error: ${err.message}`;
      workerStatus = 'unknown: redis indisponível';
    }

    const responseTimeMs = Date.now() - startTime;
    const mem = process.memoryUsage();
    const isHealthy = dbStatus === 'ok' && redisStatus === 'ok';

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTimeMs,
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      },
      services: {
        database: dbStatus,
        redis: redisStatus,
        worker: workerStatus,
      }
    });
  };

  app.get('/api/health/ready', handleReadinessCheck);
  app.get('/api/health', handleReadinessCheck);

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
    server.closeAllConnections();
  }));

  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('GET /api/health/live: retorna 200 com status alive e métricas de memória', async (t) => {
  const base = await serveHealthApp(t);
  const res = await fetch(`${base}/api/health/live`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'alive');
  assert.equal(typeof data.uptimeSeconds, 'number');
  assert.equal(typeof data.memory.rssMb, 'number');
});

test('GET /api/health/ready: retorna 200 quando DB e Redis respondem sem escrita no Postgres', async (t) => {
  mockMethod(t, prisma, '$queryRaw', async () => [{ '?column?': 1 }]);
  mockMethod(t, redisConnection, 'ping', async () => 'PONG');
  (redisConnection as any).get = async () => String(Date.now());

  const base = await serveHealthApp(t);
  const res = await fetch(`${base}/api/health/ready`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'healthy');
  assert.equal(data.services.database, 'ok');
  assert.equal(data.services.redis, 'ok');
  assert.equal(data.services.worker, 'ok');
  assert.equal(typeof data.responseTimeMs, 'number');
});

test('GET /api/health/ready: retorna 503 e status degraded se o PostgreSQL falhar', async (t) => {
  mockMethod(t, prisma, '$queryRaw', async () => { throw new Error('Connection refused'); });
  mockMethod(t, redisConnection, 'ping', async () => 'PONG');

  const base = await serveHealthApp(t);
  const res = await fetch(`${base}/api/health/ready`);
  assert.equal(res.status, 503);
  const data = await res.json();
  assert.equal(data.status, 'degraded');
  assert.equal(data.services.database.includes('Connection refused'), true);
});
