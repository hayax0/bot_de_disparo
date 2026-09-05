import { Router, Request, Response } from 'express';
import { processCaktoWebhook } from '../services/SubscriptionManager';

const router = Router();

// Endpoint público do Webhook da Cakto
router.post('/cakto', async (req: Request, res: Response): Promise<any> => {
  try {
    const payload = req.body;
    console.log('[WEBHOOK CAKTO RECEBIDO]', JSON.stringify(payload, null, 2));

    const result = await processCaktoWebhook(payload, req.headers);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[ERRO WEBHOOK CAKTO]', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Erro ao processar Webhook da Cakto'
    });
  }
});

export default router;
