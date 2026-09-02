import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { ENV } from '../config/env';

const redisUrl = process.env.REDIS_URL;

const baseOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// Fábrica de conexões: BullMQ recomenda conexões DEDICADAS por componente
// (Queue, QueueEvents e Worker nunca devem compartilhar a mesma conexão)
export function createConnection(): IORedis {
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
const connection = createConnection();

export const messageQueue = new Queue('message-queue', { connection: createConnection() });
export const queueEvents = new QueueEvents('message-queue', { connection: createConnection() });

export { connection };
