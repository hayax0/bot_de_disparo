import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';

const router = Router();

const authenticate = (req: Request, res: Response, next: Function): any => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Não autorizado. Faça login para continuar.' });

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
};

router.use(authenticate);

// Listar histórico consolidado e permanente de envios do Workspace
router.get('/', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = (req as any).user.workspaceId;

  if (!workspaceId) {
    return res.status(401).json({ error: 'Workspace não identificado.' });
  }

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const skip = (page - 1) * limit;

  // Filtro estritamente isolado pelo workspaceId do usuário autenticado
  const where: any = { workspaceId };

  if (search) {
    const cleanDigits = search.replace(/\D/g, '');
    where.OR = [
      { companyTitle: { contains: search, mode: 'insensitive' } },
      { neighborhood: { contains: search, mode: 'insensitive' } },
      { lastCampaignName: { contains: search, mode: 'insensitive' } },
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
