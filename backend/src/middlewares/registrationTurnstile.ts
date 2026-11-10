import type { NextFunction, Request, Response } from 'express';
import { ENV } from '../config/env';

export async function verifyRegistrationTurnstile(req: Request, res: Response, next: NextFunction) {
  if (!ENV.TURNSTILE_SECRET_KEY) return next();

  const token = req.body.turnstileToken?.trim();
  if (!token) {
    res.status(400).json({ code: 'TURNSTILE_REQUIRED', error: 'Conclua a verificação de segurança para continuar.' });
    return;
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: ENV.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Siteverify indisponível');

    const result = await response.json();
    if (typeof result?.success !== 'boolean' || result['error-codes']?.includes('internal-error') ||
      result['error-codes']?.includes('invalid-input-secret')) {
      throw new Error('Falha na validação do Turnstile');
    }
    const hostname = new URL(ENV.PLATFORM_URL).hostname;
    // O par oficial de teste retorna example.com e não inclui action.
    const validTestResult = ENV.NODE_ENV !== 'production' &&
      ENV.TURNSTILE_SECRET_KEY === '1x0000000000000000000000000000000AA' &&
      result.metadata?.result_with_testing_key === true;
    if (result.success && (validTestResult || (result.hostname === hostname && result.action === 'register'))) {
      return next();
    }
    res.status(400).json({ code: 'TURNSTILE_INVALID', error: 'A verificação de segurança expirou ou falhou. Tente novamente.' });
  } catch {
    res.status(503).json({ code: 'TURNSTILE_UNAVAILABLE', error: 'A verificação de segurança está indisponível. Tente novamente em instantes.' });
  }
}
