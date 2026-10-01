import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middlewares/auth';
import { ApifyCredentialService, IntegrationError } from '../services/ApifyCredentialService';
import { CreditWalletService } from '../services/CreditWalletService';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const router = Router();
router.use(authenticate);
const limiter = rateLimit({ windowMs: 60000, limit: 10, keyGenerator: req => req.user!.userId, message: { error: 'Muitas tentativas. Aguarde um minuto.' } });
const failure = (res: any, error: unknown) => res.status(error instanceof IntegrationError ? error.status : 500)
  .json({ error: error instanceof IntegrationError ? error.message : 'Não foi possível carregar ou atualizar a integração.' });
router.get('/apify', async (req, res) => {
  try { res.json(await ApifyCredentialService.status(req.user!.userId)); } catch (error) { failure(res, error); }
});
router.put('/apify', limiter, async (req, res) => {
  const input = z.object({ token: z.string().trim().min(15).max(512).regex(/^[a-zA-Z0-9_-]+$/) }).safeParse(req.body);
  req.body = { token: '[REDACTED]' };
  if (!input.success) { res.status(400).json({ error: 'Informe uma chave API válida da Apify.' }); return; }
  try { res.json(await ApifyCredentialService.save(req.user!.userId, input.data.token)); } catch (error) { failure(res, error); }
});
router.delete('/apify', limiter, async (req, res) => {
  try { await ApifyCredentialService.remove(req.user!.userId); res.json({ configured: false }); } catch (error) { failure(res, error); }
});
router.get('/ai-wallet', async (req, res) => {
  try {
    const userId = req.user!.userId;
    const summary = await CreditWalletService.getWalletSummary(userId);
    const transactions = await prisma.creditTransaction.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
      select: { id: true, amount: true, type: true, sourceType: true, description: true, createdAt: true } });
    res.json({ ...summary, transactions, purchaseEnabled: false, aiEnabled: false });
  } catch (error) { failure(res, error); }
});
export default router;
