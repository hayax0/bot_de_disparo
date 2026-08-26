import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { ENV } from '../config/env';

const redisUrl = process.env.REDIS_URL;

const connection = redisUrl 
  ? new IORedis(redisUrl, { maxRetriesPerRequest: null })
  : new IORedis({
      host: ENV.REDIS_HOST,
      port: ENV.REDIS_PORT,
      password: ENV.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
    });

export const messageQueue = new Queue('message-queue', { connection });
export const queueEvents = new QueueEvents('message-queue', { connection });

export { connection };
