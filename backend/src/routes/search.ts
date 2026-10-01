import { Router, Request, Response } from 'express';
import { authenticate, requireActiveSubscription } from '../middlewares/auth';
import { CompanySearchService } from '../services/CompanySearchService';
import { CreditWalletService } from '../services/CreditWalletService';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requireActiveSubscription);

const searchSchema = z.object({
  segment: z.string().min(2, 'O segmento/nicho deve ter ao menos 2 caracteres.'),
  location: z.string().min(2, 'A localização/cidade deve ter ao menos 2 caracteres.'),
  requestedCount: z.coerce.number().min(5, 'Mínimo de 5 empresas por busca.').max(200, 'Máximo de 200 empresas por busca.').default(20),
  targetCampaignId: z.string().uuid().optional(),
});

/**
 * Inicia uma busca de empresas (com reserva e liquidação automática de créditos).
 */
router.post('/', async (req: Request, res: Response): Promise<any> => {
  const userId = req.user!.userId;
  const workspaceId = req.user!.workspaceId;

  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' });
  }

  const { segment, location, requestedCount, targetCampaignId } = parsed.data;

  try {
    const searchResult = await CompanySearchService.executeSearch({
      userId,
      workspaceId,
      segment,
      location,
      requestedCount,
      targetCampaignId
    });

    res.status(201).json(searchResult);
  } catch (error: any) {
    if (error.name === 'InsufficientCreditsError') {
      return res.status(402).json({
        error: error.message,
        code: 'INSUFFICIENT_CREDITS'
      });
    }

    console.error('Erro na rota /api/search:', error);
    res.status(500).json({ error: error.message || 'Falha ao processar busca de empresas.' });
  }
});

/**
 * Lista as buscas realizadas no workspace.
 */
router.get('/', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = req.user!.workspaceId;

  try {
    const searches = await prisma.companySearch.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        query: true,
        segment: true,
        location: true,
        requestedCount: true,
        foundCount: true,
        usableCount: true,
        discardedCount: true,
        creditsConsumed: true,
        status: true,
        createdAt: true,
        _count: {
          select: { results: true }
        }
      }
    });

    res.json(searches);
  } catch (error: any) {
    console.error('Erro ao listar buscas:', error);
    res.status(500).json({ error: 'Erro ao carregar histórico de buscas.' });
  }
});

/**
 * Consulta estimativa de créditos para uma quantidade de empresas.
 */
router.get('/estimate', async (req: Request, res: Response): Promise<any> => {
  const userId = req.user!.userId;
  const count = Math.min(200, Math.max(5, parseInt(String(req.query.count || '20'), 10)));

  try {
    const wallet = await CreditWalletService.getWalletSummary(userId);
    res.json({
      requestedCount: count,
      estimatedCredits: count * 1, // 1 crédito por empresa aproveitável
      costPerCredit: 1,
      availableBalance: wallet.availableBalance,
      isUnlimited: wallet.isUnlimited,
      hasEnoughBalance: wallet.isUnlimited || wallet.availableBalance >= count
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao estimar créditos.' });
  }
});

/**
 * Obtém detalhes e resultados de uma busca específica.
 */
router.get('/:id', async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = req.user!.workspaceId;

  try {
    const search = await prisma.companySearch.findFirst({
      where: { id, workspaceId },
      include: {
        results: {
          orderBy: [{ isUsable: 'desc' }, { rating: 'desc' }]
        }
      }
    });

    if (!search) {
      return res.status(404).json({ error: 'Busca não encontrada.' });
    }

    res.json(search);
  } catch (error: any) {
    console.error('Erro ao buscar detalhes:', error);
    res.status(500).json({ error: 'Erro ao carregar detalhes da busca.' });
  }
});

/**
 * Adiciona empresas selecionadas de uma busca a uma campanha existente.
 */
router.post('/:id/add-to-campaign', async (req: Request, res: Response): Promise<any> => {
  const searchId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = req.user!.workspaceId;
  const { campaignId, companyResultIds } = req.body;

  if (!campaignId || !Array.isArray(companyResultIds) || companyResultIds.length === 0) {
    return res.status(400).json({ error: 'Selecione uma campanha e ao menos uma empresa.' });
  }

  try {
    const result = await CompanySearchService.addSelectedToCampaign({
      searchId,
      companyResultIds,
      campaignId,
      workspaceId
    });

    res.json({
      message: `${result.addedCount} empresas adicionadas com sucesso à campanha!`,
      addedCount: result.addedCount,
      duplicateCount: result.duplicateCount
    });
  } catch (error: any) {
    console.error('Erro ao adicionar leads à campanha:', error);
    res.status(500).json({ error: error.message || 'Falha ao vincular leads à campanha.' });
  }
});

export default router;
