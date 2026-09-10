import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { ENV } from '../config/env';

const redisUrl = process.env.REDIS_URL;
const isTest = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));

// Fábrica de conexões: BullMQ recomenda conexões DEDICADAS por componente
// (Queue, QueueEvents e Worker nunca devem compartilhar a mesma conexão)
export function createConnection(blocking = true): IORedis {
  const baseOptions = {
    maxRetriesPerRequest: blocking && !isTest ? null : 1,
    enableOfflineQueue: blocking && !isTest,
    enableReadyCheck: false,
    lazyConnect: isTest,
    retryStrategy: isTest ? () => null : undefined,
  };
  const client = redisUrl
    ? new IORedis(redisUrl, baseOptions)
    : new IORedis({
        host: ENV.REDIS_HOST,
        port: ENV.REDIS_PORT,
        password: ENV.REDIS_PASSWORD,
        ...baseOptions,
      });

  client.on('error', (err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Redis connection error]:', err.message);
    }
  });

  return client;
}

// Conexão compartilhada apenas para healthcheck / operações leves
const connection = isTest ? ({ ping: async () => 'PONG', on: () => {} } as any) : createConnection(false);

export const messageQueue = isTest
  ? ({ add: async () => ({ id: 'mock-job' }), on: () => {}, close: async () => {} } as any)
  : new Queue('message-queue', { connection: createConnection(false) });

export const queueEvents = isTest
  ? ({ on: () => {}, close: async () => {} } as any)
  : new QueueEvents('message-queue', { connection: createConnection() });

if (!isTest) {
  messageQueue.on('error', () => {});
  queueEvents.on('error', () => {});
}

export { connection };
