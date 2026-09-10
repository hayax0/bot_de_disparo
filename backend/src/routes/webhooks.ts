import { Router, Request, Response } from 'express';
import { processCaktoWebhook, WebhookError } from '../services/SubscriptionManager';
import { caktoWebhookLimiter } from '../middlewares/rateLimiter';

const router = Router();

// Endpoint público do Webhook da Cakto com rate limiting generoso (120 req/min)
router.post('/cakto', caktoWebhookLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const payload = req.body;

    const result = await processCaktoWebhook(payload, req.headers);
    return res.status(result.success ? 200 : 400).json({ success: result.success, message: result.message });
  } catch (error: any) {
    if (!(error instanceof WebhookError)) console.error('[WEBHOOK CAKTO] Falha no processamento; evento pode ser repetido.');
    return res.status(error instanceof WebhookError ? error.status : 500).json({
      success: false,
      error: error instanceof WebhookError ? error.message : 'Erro ao processar Webhook da Cakto'
    });
  }
});

export default router;
