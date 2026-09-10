import rateLimit, { Options } from 'express-rate-limit';
import { Request, Response } from 'express';

const standardErrorMessage = {
  error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
};

function createStandardLimiter(options: Partial<Options>) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: standardErrorMessage,
    validate: {
      keyGeneratorIpFallback: false,
      xForwardedForHeader: false,
      default: false,
    },
    handler: (req: Request, res: Response) => {
      res.status(429).json(standardErrorMessage);
    },
    ...options
  });
}

// Chave baseada em IP + E-mail normalizado
function ipAndEmailKeyGenerator(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const email = typeof req.body?.email === 'string'
    ? req.body.email.trim().toLowerCase()
    : '';
  return `${ip}_${email}`;
}

// 1. Login: 10 tentativas por 15 minutos por IP e e-mail
export const loginLimiter = createStandardLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: ipAndEmailKeyGenerator,
});

// 2. Cadastro: 10 por 15 minutos por IP
export const registerLimiter = createStandardLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req: Request) => req.ip || req.socket.remoteAddress || 'unknown-ip',
});

// 3. Código de confirmação: 3 por 15 minutos por IP e e-mail
export const confirmCodeLimiter = createStandardLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyGenerator: ipAndEmailKeyGenerator,
});

// 4. Recuperação de senha (solicitação): 3 por 15 minutos por IP e e-mail
export const forgotPasswordLimiter = createStandardLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyGenerator: ipAndEmailKeyGenerator,
});

// 5. Redefinição de senha: 10 por 15 minutos por IP
export const resetPasswordLimiter = createStandardLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req: Request) => req.ip || req.socket.remoteAddress || 'unknown-ip',
});

// 6. Webhook Cakto: 120 por minuto por IP
export const caktoWebhookLimiter = createStandardLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req: Request) => req.ip || req.socket.remoteAddress || 'unknown-ip',
});

// 7. Cron: 10 por minuto por IP
export const cronLimiter = createStandardLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req: Request) => req.ip || req.socket.remoteAddress || 'unknown-ip',
});
