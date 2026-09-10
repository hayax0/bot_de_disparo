import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middlewares/auth';
import { AnonymizationService } from '../services/AnonymizationService';
import { z } from 'zod';
import { validateBody } from '../lib/validation';

const router = Router();
router.use(authenticate);

// Schemas Zod para contatos e blacklist
export const addToBlacklistSchema = z.object({
  phone: z.string().min(8, 'Telefone inválido'),
  scope: z.enum(['WORKSPACE', 'GLOBAL']).default('WORKSPACE'),
  reason: z.enum(['OPT_OUT', 'MANUAL', 'COMPLAINT', 'INVALID']).default('MANUAL'),
  metadata: z.string().max(500, 'Metadata não pode exceder 500 caracteres').optional(),
});

export const anonymizeContactSchema = z.object({
  phone: z.string().min(8, 'Telefone inválido para anonimização'),
});

// 1. Listar telefones na Blacklist (do workspace e globais)
router.get('/blacklist', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = req.user!.workspaceId;
  const isAdmin = req.user!.role === 'ADMIN';

  try {
    const list = await prisma.blacklist.findMany({
      where: {
        OR: [
          { scope: 'WORKSPACE', workspaceId },
          ...(isAdmin ? [{ scope: 'GLOBAL' }] : [])
        ]
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        scope: true,
        phone: true,
        reason: true,
        source: true,
        createdAt: true,
        workspaceId: true,
      }
    });

    res.json(list);
  } catch (error) {
    console.error('Erro ao listar blacklist:', error);
    res.status(500).json({ error: 'Falha ao buscar itens da blacklist.' });
  }
});

// 2. Inserir manualmente na Blacklist
router.post('/blacklist', validateBody(addToBlacklistSchema), async (req: Request, res: Response): Promise<any> => {
  const { phone, scope, reason, metadata } = req.body;
  const workspaceId = req.user!.workspaceId;
  const cleanPhone = phone.replace(/\D/g, '');

  if (cleanPhone.length < 8) {
    return res.status(400).json({ error: 'Número de telefone inválido.' });
  }

  // Apenas administradores do sistema podem criar bloqueios de escopo GLOBAL
  if (scope === 'GLOBAL' && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas administradores podem criar bloqueios globais.' });
  }

  const effectiveWorkspaceId = scope === 'GLOBAL' ? null : workspaceId;

  try {
    const entry = await prisma.$transaction(async (tx) => {
      // 1. Cria ou atualiza entrada na Blacklist
      const created = await tx.blacklist.create({
        data: {
          scope,
          workspaceId: effectiveWorkspaceId,
          phone: cleanPhone,
          reason,
          source: 'USER_ACTION',
          metadata: metadata || null,
        }
      });

      // 2. Neutraliza leads pendentes com este número
      await tx.lead.updateMany({
        where: {
          phone: { in: [cleanPhone, `+${cleanPhone}`] },
          ...(scope === 'WORKSPACE' ? { campaign: { workspaceId } } : {}),
          status: { in: ['PENDING', 'QUEUED', 'SENDING'] }
        },
        data: {
          status: 'OPTED_OUT',
          optedOutAt: new Date(),
          errorMessage: 'Número adicionado à lista de bloqueio (Blacklist).'
        }
      });

      // 3. Auditoria
      await tx.auditLog.create({
        data: {
          workspaceId: effectiveWorkspaceId,
          userId: req.user!.userId,
          action: scope === 'GLOBAL' ? 'GLOBAL_BLOCK' : 'BLACKLIST_ADD',
          targetType: 'BLACKLIST',
          targetId: cleanPhone,
          details: `Inclusão manual na blacklist (${scope}, ${reason}).`
        }
      });

      return created;
    });

    res.status(201).json({
      message: 'Telefone adicionado à blacklist com sucesso.',
      entry
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Este telefone já está cadastrado na blacklist.' });
    }
    console.error('Erro ao adicionar à blacklist:', error);
    res.status(500).json({ error: 'Falha ao incluir telefone na blacklist.' });
  }
});

// 3. Remover telefone da Blacklist
router.delete('/blacklist/:id', async (req: Request, res: Response): Promise<any> => {
  const id = String(req.params.id);
  const workspaceId = req.user!.workspaceId;
  const isAdmin = req.user!.role === 'ADMIN';

  try {
    const existing = await prisma.blacklist.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Item não encontrado na blacklist.' });
    }

    // Validação de isolamento: usuário só pode remover da sua própria blacklist a menos que seja ADMIN
    if (existing.scope === 'WORKSPACE' && existing.workspaceId !== workspaceId && !isAdmin) {
      return res.status(403).json({ error: 'Você não tem permissão para remover este bloqueio.' });
    }

    if (existing.scope === 'GLOBAL' && !isAdmin) {
      return res.status(403).json({ error: 'Apenas administradores podem remover bloqueios globais.' });
    }

    await prisma.$transaction([
      prisma.blacklist.delete({ where: { id } }),
      prisma.auditLog.create({
        data: {
          workspaceId: existing.workspaceId,
          userId: req.user!.userId,
          action: 'BLACKLIST_REMOVE',
          targetType: 'BLACKLIST',
          targetId: existing.phone,
          details: `Remoção da blacklist (${existing.scope}).`
        }
      })
    ]);

    res.json({ message: 'Telefone removido da blacklist com sucesso.' });
  } catch (error) {
    console.error('Erro ao remover da blacklist:', error);
    res.status(500).json({ error: 'Falha ao remover item da blacklist.' });
  }
});

// 4. Anonimização LGPD a pedido do titular
router.post('/anonymize', validateBody(anonymizeContactSchema), async (req: Request, res: Response): Promise<any> => {
  const { phone } = req.body;
  const workspaceId = req.user!.workspaceId;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    const result = await AnonymizationService.anonymizeContact({
      phone,
      workspaceId,
      requestedByUserId: req.user!.userId,
      ip
    });

    res.json({
      message: 'Dados pessoais anonimizados com sucesso conforme LGPD.',
      anonymizedCount: result.anonymizedCount,
      identifier: result.anonymizedPhoneId
    });
  } catch (error) {
    console.error('Erro na anonimização LGPD:', error);
    res.status(500).json({ error: 'Falha ao executar anonimização dos dados.' });
  }
});

export default router;
