import dotenv from 'dotenv';
dotenv.config();

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

function getEnvVar(key: string, defaultValue?: string, required = false): string {
  const value = process.env[key] || defaultValue;
  if ((required || (isProduction && !defaultValue)) && (!value || value.trim() === '')) {
    throw new Error(`[CONFIG ERROR] Missing required environment variable: ${key}`);
  }
  return (value || '') as string;
}

// Em produção, exigir estritamente:
// JWT_SECRET, DATABASE_URL, CAKTO_WEBHOOK_SECRET, CRON_SECRET, REDIS_PASSWORD, PLATFORM_URL
if (isProduction) {
  const requiredProductionVars = [
    'JWT_SECRET',
    'DATABASE_URL',
    'CAKTO_WEBHOOK_SECRET',
    'CRON_SECRET',
    'REDIS_PASSWORD',
    'PLATFORM_URL',
  ];
  for (const v of requiredProductionVars) {
    if (!process.env[v] || process.env[v]!.trim() === '') {
      throw new Error(`[CONFIG ERROR] Missing required environment variable in production: ${v}`);
    }
  }
}

export const ENV = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: getEnvVar('DATABASE_URL', undefined, true),
  JWT_SECRET: getEnvVar('JWT_SECRET', undefined, true),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  CAKTO_WEBHOOK_SECRET: process.env.CAKTO_WEBHOOK_SECRET || '',
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS || '')
    .toLowerCase()
    .split(',')
    .map(e => e.trim())
    .filter(Boolean),
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || 'Disparador <noreply@botdisparo.cmpx.tec.br>',
  RESEND_REPLY_TO: process.env.RESEND_REPLY_TO || 'cmpxsuporte@gmail.com',
  PLATFORM_URL: process.env.PLATFORM_URL || (isProduction ? '' : 'http://localhost:3000'),
  CRON_SECRET: process.env.CRON_SECRET || (isProduction ? '' : 'cmpx_cron_dev_secret'),
  CAKTO_CHECKOUT_URL: process.env.CAKTO_CHECKOUT_URL || 'https://pay.cakto.com.br/at474et_1080517',
};
