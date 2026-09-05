import { Router, Request, Response } from 'express';
import { ENV } from '../config/env';
import { SubscriptionReminderService } from '../services/SubscriptionReminderService';

const router = Router();

/**
 * Middleware de proteção do Cron
 * Aceita header: Authorization: Bearer <CRON_SECRET> ou query ?secret=<CRON_SECRET>
 */
const requireCronAuth = (req: Request, res: Response, next: Function): any => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  const querySecret = req.query.secret as string | undefined;

  const providedSecret = token || querySecret;
  const configuredSecret = ENV.CRON_SECRET;

  if (!providedSecret || providedSecret !== configuredSecret) {
    console.warn(`[CRON AUTH WARN] Tentativa de acesso não autorizada à rota de cron de IP: ${req.ip}`);
    return res.status(401).json({ error: 'Não autorizado: CRON_SECRET inválido ou ausente.' });
  }

  next();
};

const handleCronExecution = async (req: Request, res: Response): Promise<any> => {
  try {
    const result = await SubscriptionReminderService.processReminders();
    return res.status(200).json({
      success: true,
      message: 'Rotina de avisos de vencimento executada com sucesso.',
      data: result,
      executedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[CRON ROUTE ERROR] Erro na execução do cron:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao processar avisos de vencimento.',
      details: error.message
    });
  }
};

router.post('/subscription-reminders', requireCronAuth, handleCronExecution);
router.get('/subscription-reminders', requireCronAuth, handleCronExecution);

export default router;
