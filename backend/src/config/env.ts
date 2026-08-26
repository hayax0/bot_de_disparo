import dotenv from 'dotenv';
dotenv.config();

function getEnvVar(key: string, defaultValue?: string, required = false): string {
  const value = process.env[key] || defaultValue;
  if (required && (!value || value.trim() === '')) {
    throw new Error(`[CONFIG ERROR] Missing required environment variable: ${key}`);
  }
  return value as string;
}

export const ENV = {
  PORT: parseInt(getEnvVar('PORT', '3001'), 10),
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
  DATABASE_URL: getEnvVar('DATABASE_URL', undefined, true),
  JWT_SECRET: getEnvVar('JWT_SECRET', undefined, true),
  CORS_ORIGIN: getEnvVar('CORS_ORIGIN', 'http://localhost:3000'),
  REDIS_HOST: getEnvVar('REDIS_HOST', '127.0.0.1'),
  REDIS_PORT: parseInt(getEnvVar('REDIS_PORT', '6379'), 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
};
