import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { ENV } from '../config/env';

const redisUrl = process.env.REDIS_URL;

// Fábrica de conexões: BullMQ recomenda conexões DEDICADAS por componente
// (Queue, QueueEvents e Worker nunca devem compartilhar a mesma conexão)
export function createConnection(blocking = true): IORedis {
  const baseOptions = {
    maxRetriesPerRequest: blocking ? null : 1,
    enableOfflineQueue: blocking,
    enableReadyCheck: false,
  };
  return redisUrl
    ? new IORedis(redisUrl, baseOptions)
    : new IORedis({
        host: ENV.REDIS_HOST,
        port: ENV.REDIS_PORT,
        password: ENV.REDIS_PASSWORD,
        ...baseOptions,
      });
}

// Conexão compartilhada apenas para healthcheck / operações leves
const connection = createConnection(false);

export const messageQueue = new Queue('message-queue', { connection: createConnection(false) });
export const queueEvents = new QueueEvents('message-queue', { connection: createConnection() });

export { connection };
