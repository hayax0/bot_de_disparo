import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { isUserAdmin } from '../services/SubscriptionManager';
import { authenticate } from '../middlewares/auth';
import { z } from 'zod';
import { validateBody, validateQuery } from '../lib/validation';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting rigoroso para rotas administrativas (60 requisições por minuto por IP)
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite de requisições excedido no painel administrativo.' },
  handler: (req: Request, res: Response) => {
    res.status(429).json({ error: 'Muitas requisições ao painel admin. Aguarde 1 minuto.' });
  }
});

/**
 * Middleware de Segurança Máxima (requireAdmin):
 * 1. Exige autenticação prévia (JWT válido, authVersion idêntica, email verificado).
 * 2. Consulta o usuário diretamente no banco de dados (evita token adulterado ou desatualizado).
 * 3. Valida se user.role === 'ADMIN' OU se está na lista de e-mails de administradores autorizados.
 * 4. Registra log de auditoria em caso de tentativa de invasão.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<any> {
  const currentUserId = req.user?.userId;
  if (!currentUserId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, email: true, role: true, emailVerifiedAt: true }
    });

    if (!dbUser || (dbUser.role !== 'ADMIN' && !isUserAdmin(dbUser.email))) {
      console.warn(
        `[SECURITY_AUDIT] Tentativa de acesso bloqueada ao painel admin! Usuário: ${req.user?.email || 'anônimo'} (ID: ${currentUserId}) IP: ${req.ip}`
      );
      return res.status(403).json({ error: 'Acesso estritamente restrito a administradores.' });
    }

    next();
  } catch (error) {
    console.error('[ADMIN AUTH ERROR]:', error);
    return res.status(500).json({ error: 'Erro ao validar privilégios administrativos.' });
  }
}

// Aplica autenticação, checagem estrita de ADMIN e rate limiting em todas as rotas
router.use(authenticate);
router.use(requireAdmin);
router.use(adminLimiter);

// ── 1. MÉTRICAS GLOBAIS DA PLATAFORMA (KPIs) ──────────────────────────
router.get('/metrics', async (req: Request, res: Response): Promise<any> => {
  try {
    const [
      totalUsers,
      activeSubscribers,
      lifetimeAdmins,
      inactiveUsers,
      totalCampaigns,
      totalDispatches,
      connectedWhatsapps
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { subscriptionStatus: 'ACTIVE' } }),
      prisma.user.count({
        where: {
          OR: [{ subscriptionStatus: 'LIFETIME' }, { role: 'ADMIN' }]
        }
      }),
      prisma.user.count({
        where: {
          subscriptionStatus: 'INACTIVE',
          role: { not: 'ADMIN' }
        }
      }),
      prisma.campaign.count(),
      prisma.dispatchHistory.count(),
      prisma.whatsappSession.count({ where: { status: 'CONNECTED' } })
    ]);

    return res.json({
      totalUsers,
      activeSubscribers,
      lifetimeAdmins,
      inactiveUsers,
      totalCampaigns,
      totalDispatches,
      connectedWhatsapps
    });
  } catch (error: any) {
    console.error('[ADMIN METRICS ERROR]:', error);
    return res.status(500).json({ error: 'Erro ao calcular métricas administrativas.' });
  }
});

// ── 2. LISTAGEM DE USUÁRIOS COM FILTROS E STATUS RELACIONAL ───────────
const listUsersQuerySchema = z.object({
  q: z.string().optional().transform(v => (v ? v.trim() : '')),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE', 'LIFETIME', 'PAST_DUE', 'CANCELED']).optional().default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/users', validateQuery(listUsersQuerySchema), async (req: Request, res: Response): Promise<any> => {
  try {
    const { q, status, page, limit } = (req as any).validatedQuery || req.query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } }
      ];
    }

    if (status && status !== 'ALL') {
      where.subscriptionStatus = status;
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          subscriptionStatus: true,
          subscriptionExpiresAt: true,
          createdAt: true,
          updatedAt: true,
          workspaces: {
            take: 1,
            select: {
              id: true,
              name: true,
              whatsapp: {
                select: {
                  status: true,
                  updatedAt: true
                }
              },
              _count: {
                select: {
                  campaigns: true,
                  dispatchHistory: true
                }
              }
            }
          }
        }
      })
    ]);

    const formattedUsers = users.map(u => {
      const primaryWorkspace = u.workspaces[0];
      return {
        id: u.id,
        email: u.email,
        name: u.name || 'Sem nome',
        role: u.role,
        subscriptionStatus: u.subscriptionStatus,
        subscriptionExpiresAt: u.subscriptionExpiresAt,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        stats: {
          campaignsCount: primaryWorkspace?._count?.campaigns ?? 0,
          dispatchesCount: primaryWorkspace?._count?.dispatchHistory ?? 0,
          whatsappStatus: primaryWorkspace?.whatsapp?.status ?? 'NONE',
          lastWhatsappUpdate: primaryWorkspace?.whatsapp?.updatedAt ?? null
        }
      };
    });

    return res.json({
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    });
  } catch (error: any) {
    console.error('[ADMIN USERS ERROR]:', error);
    return res.status(500).json({ error: 'Erro ao carregar lista de usuários.' });
  }
});

// ── 3. ALTERAÇÃO DE STATUS / PERMISSÕES DE UM USUÁRIO ──────────────────
const updateUserStatusSchema = z.object({
  subscriptionStatus: z.enum(['ACTIVE', 'INACTIVE', 'LIFETIME', 'PAST_DUE', 'CANCELED']).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  extendDays: z.number().int().min(1).max(3650).optional()
});

router.patch(
  '/users/:userId/status',
  validateBody(updateUserStatusSchema),
  async (req: Request, res: Response): Promise<any> => {
    try {
      const currentAdminId = req.user!.userId;
      const rawUserId = req.params.userId;
      const userId = Array.isArray(rawUserId) ? rawUserId[0] : String(rawUserId);
      const { subscriptionStatus, role, extendDays } = req.body;

      if (!subscriptionStatus && !role && !extendDays) {
        return res.status(400).json({ error: 'Informe ao menos um campo para alteração.' });
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!targetUser) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      // Proteção de segurança contra auto-rebaixamento acidental do admin logado
      if (currentAdminId === targetUser.id) {
        if (role && role !== 'ADMIN') {
          return res.status(400).json({ error: 'Você não pode remover seu próprio perfil de Administrador.' });
        }
        if (subscriptionStatus && subscriptionStatus === 'INACTIVE') {
          return res.status(400).json({ error: 'Você não pode desativar sua própria conta de Administrador.' });
        }
      }

      const updateData: any = {};

      if (role) {
        updateData.role = role;
      }

      if (subscriptionStatus) {
        updateData.subscriptionStatus = subscriptionStatus;
        if (subscriptionStatus === 'LIFETIME') {
          updateData.subscriptionExpiresAt = null;
        }
      }

      if (extendDays) {
        const baseDate = targetUser.subscriptionExpiresAt && targetUser.subscriptionExpiresAt > new Date()
          ? new Date(targetUser.subscriptionExpiresAt)
          : new Date();
        baseDate.setDate(baseDate.getDate() + extendDays);
        updateData.subscriptionExpiresAt = baseDate;
        updateData.subscriptionStatus = 'ACTIVE';
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          subscriptionStatus: true,
          subscriptionExpiresAt: true,
          updatedAt: true
        }
      });

      const primaryWs = await prisma.workspace.findFirst({
        where: { userId: targetUser.id },
        select: { id: true }
      });

      // Registro detalhado no Log de Auditoria
      await prisma.auditLog.create({
        data: {
          workspaceId: primaryWs?.id || null,
          userId: currentAdminId,
          action: 'SETTINGS_UPDATE',
          targetType: 'WORKSPACE',
          targetId: targetUser.id,
          details: `Admin ${req.user!.email} alterou conta ${targetUser.email}: status=${subscriptionStatus || 'inalterado'}, role=${role || 'inalterado'}, dias=${extendDays || 0}`,
          ip: typeof req.ip === 'string' ? req.ip : null
        }
      }).catch(err => console.warn('[ADMIN AUDIT LOG WARNING]:', err.message));

      return res.json({
        success: true,
        message: 'Conta atualizada com sucesso pelo administrador.',
        user: updatedUser
      });
    } catch (error: any) {
      console.error('[ADMIN UPDATE USER ERROR]:', error);
      return res.status(500).json({ error: 'Erro ao atualizar dados do usuário.' });
    }
  }
);

// ── 4. EXCLUSÃO CONTROLADA DE CONTA DE USUÁRIO ───────────────────────
router.delete('/users/:userId', async (req: Request, res: Response): Promise<any> => {
  try {
    const currentAdminId = req.user!.userId;
    const rawUserId = req.params.userId;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : String(rawUserId);

    if (currentAdminId === userId) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta de administrador.' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    // Exclusão no banco (todas as relações de Workspace, Leads e Campanhas são em Cascade)
    await prisma.user.delete({
      where: { id: userId }
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: currentAdminId,
        action: 'GLOBAL_BLOCK',
        targetType: 'WORKSPACE',
        targetId: userId,
        details: `Admin ${req.user!.email} excluiu a conta de ${targetUser.email} (ID: ${userId})`,
        ip: typeof req.ip === 'string' ? req.ip : null
      }
    }).catch(err => console.warn('[ADMIN AUDIT LOG DELETE WARNING]:', err.message));

    return res.json({
      success: true,
      message: `Usuário ${targetUser.email} removido com sucesso.`
    });
  } catch (error: any) {
    console.error('[ADMIN DELETE USER ERROR]:', error);
    return res.status(500).json({ error: 'Erro ao remover usuário.' });
  }
});

export default router;
