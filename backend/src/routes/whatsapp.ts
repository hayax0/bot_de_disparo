import { Router, Request, Response } from 'express';
import { WhatsappManager } from '../services/WhatsappManager';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { requireActiveSubscription } from '../middlewares/authSubscription';

const router = Router();

// Middleware to authenticate and extract workspaceId
const authenticate = (req: Request, res: Response, next: Function): any => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.use(authenticate);

router.post('/connect', requireActiveSubscription, async (req: Request, res: Response): Promise<any> => {
  const workspaceId = (req as any).user.workspaceId;
  try {
    await WhatsappManager.getClient(workspaceId);
    res.json({ message: 'Initializing connection...' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to initialize connection' });
  }
});

router.get('/status', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = (req as any).user.workspaceId;
  try {
    const status = await WhatsappManager.getStatus(workspaceId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

router.post('/disconnect', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = (req as any).user.workspaceId;
  try {
    await WhatsappManager.disconnect(workspaceId);
    res.json({ message: 'Disconnected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

export default router;
