import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middlewares/auth';
import { validateQuery, paginationQuerySchema } from '../lib/validation';

const router = Router();

router.use(authenticate);

// Listar histórico consolidado e permanente de envios do Workspace
router.get('/', validateQuery(paginationQuerySchema), async (req: Request, res: Response): Promise<any> => {
  const workspaceId = req.user!.workspaceId;

  const query = ((req as any).validatedQuery || req.query) as unknown as { page: number; limit: number; search: string };
  const { page, limit, search } = query;
  const skip = (page - 1) * limit;

  // Filtro estritamente isolado pelo workspaceId do usuário autenticado
  const where: any = { workspaceId };

  if (search && search.trim() !== '') {
    const term = search.trim();
    const cleanDigits = term.replace(/\D/g, '');
    where.OR = [
      { companyTitle: { contains: term, mode: 'insensitive' } },
      { neighborhood: { contains: term, mode: 'insensitive' } },
      { lastCampaignName: { contains: term, mode: 'insensitive' } },
      ...(cleanDigits ? [{ phone: { contains: cleanDigits } }] : [])
    ];
  }

  try {
    const [items, filteredTotal, totalCompanies, dispatchesAgg] = await Promise.all([
      prisma.dispatchHistory.findMany({
        where,
        orderBy: { lastSentAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          companyTitle: true,
          phone: true,
          website: true,
          neighborhood: true,
          firstSentAt: true,
          lastSentAt: true,
          lastMessage: true,
          lastCampaignName: true,
          sendCount: true
        }
      }),
      prisma.dispatchHistory.count({ where }),
      prisma.dispatchHistory.count({ where: { workspaceId } }),
      prisma.dispatchHistory.aggregate({
        where: { workspaceId },
        _sum: { sendCount: true }
      })
    ]);

    res.json({
      items,
      pagination: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / limit)
      },
      stats: {
        totalCompanies,
        totalDispatches: dispatchesAgg._sum.sendCount || 0
      }
    });
  } catch (error) {
    console.error('Erro ao buscar histórico de disparos:', error);
    res.status(500).json({ error: 'Falha ao buscar histórico de disparos.' });
  }
});

export default router;
