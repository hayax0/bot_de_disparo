import { Router, Request, Response } from 'express';
import { WhatsappManager } from '../services/WhatsappManager';
import { authenticate, requireActiveSubscription } from '../middlewares/auth';
import { validateBody, whatsappPairSchema } from '../lib/validation';

const router = Router();

router.use(authenticate);

router.post('/connect', requireActiveSubscription, async (req: Request, res: Response): Promise<any> => {
  const workspaceId = req.user!.workspaceId;
  try {
    await WhatsappManager.getClient(workspaceId);
    res.json({ message: 'Initializing connection...' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to initialize connection' });
  }
});

router.get('/status', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = req.user!.workspaceId;
  try {
    const status = await WhatsappManager.getStatus(workspaceId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

router.post(
  '/pairing-code',
  requireActiveSubscription,
  validateBody(whatsappPairSchema),
  async (req: Request, res: Response): Promise<any> => {
    const workspaceId = req.user!.workspaceId;
    const { phone } = req.body;
    try {
      const code = await WhatsappManager.requestPairingCode(workspaceId, phone);
      res.json({ code });
    } catch (error: any) {
      console.error('Erro ao gerar código de pareamento:', error);
      res.status(500).json({ error: error?.message || 'Falha ao solicitar código de pareamento' });
    }
  }
);

router.post('/disconnect', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = req.user!.workspaceId;
  try {
    await WhatsappManager.disconnect(workspaceId);
    res.json({ message: 'Disconnected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

export default router;
