import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middlewares/auth';
import { ApifyCredentialService, IntegrationError } from '../services/ApifyCredentialService';
import { CreditWalletService } from '../services/CreditWalletService';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

import { AiCopyService } from '../services/AiCopyService';
import { getCommercialCatalog, getPlanById, getCreditPackageById, isLegacyPlan, isUserUnlimited } from '../config/plans';
import { QuotaService } from '../services/QuotaService';

const router = Router();
router.use(authenticate);
router.get('/plans', async (req, res) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        role: true,
        planId: true,
        monthlyDispatchQuota: true,
        dispatchesUsedInCycle: true,
      },
    });
    const isUnlimited = isUserUnlimited(user);
    const isLegacy = isLegacyPlan(user.planId);
    res.json({ ...getCommercialCatalog(),
      currentPlan: getPlanById(isUnlimited ? 'ADMIN_LIFETIME' : isLegacy ? 'LEGACY_DAVI' : user.planId),
      isUnlimited, isLegacy, dispatch: await QuotaService.canDispatch(user),
    });
  } catch { res.status(500).json({ error: 'Não foi possível carregar os planos. Tente novamente.' }); }
});

router.post('/checkout', (req, res) => {
  const { planId, packageId } = req.body || {};
  if (planId) {
    const plan = getPlanById(planId);
    if (!plan || plan.isLegacy || plan.isUnlimited || !plan.checkoutUrl) {
      return res.status(400).json({ error: 'Plano inválido para checkout.' });
    }
    return res.json({ checkoutUrl: plan.checkoutUrl, planId: plan.id });
  }

  if (packageId) {
    const pkg = getCreditPackageById(packageId);
    if (!pkg || !pkg.checkoutUrl) {
      return res.status(400).json({ error: 'Pacote de créditos inválido para checkout.' });
    }
    return res.json({ checkoutUrl: pkg.checkoutUrl, packageId: pkg.id });
  }

  return res.status(400).json({ error: 'Informe um plano ou pacote para checkout.' });
});
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
    res.json({ ...summary, transactions, purchaseEnabled: true, aiEnabled: AiCopyService.isAvailable() });
  } catch (error) { failure(res, error); }
});
export default router;
