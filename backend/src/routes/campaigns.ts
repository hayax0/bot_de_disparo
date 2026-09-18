import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { messageQueue } from '../services/queue';
import { temWebsiteValido, gerarPreviaMensagem, validarTemplateMensagem } from '../services/ProposalEngine';
import { authenticate, requireActiveSubscription } from '../middlewares/auth';
import { WhatsappManager } from '../services/WhatsappManager';
import { CampaignStartError, startCampaign } from '../services/CampaignStarter';
import { validateBody, createCampaignSchema } from '../lib/validation';
import { ContactPolicyService } from '../services/ContactPolicyService';
import { LeadImportService } from '../services/LeadImportService';

const router = Router();

// Configuração segura de upload de leads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.json';
    const safeExt = ext === '.csv' ? '.csv' : '.json';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `leads-${uniqueSuffix}${safeExt}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.json' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo inválido. Apenas arquivos .json e .csv são aceitos.'));
    }
  }
});

router.use(authenticate);

function computeCampaignStats(
  campaign: {
    id: string;
    status: string;
    delayMin: number;
    delayMax: number;
    scheduleStartMinute?: number | null;
    scheduleEndMinute?: number | null;
    scheduleDays?: string | null;
    scheduleTimezone?: string | null;
  },
  counts: Record<string, number>
) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const sent = (counts.SENT || 0) + (counts.DELIVERED || 0) + (counts.READ || 0) + (counts.REPLIED || 0);
  const remaining = (counts.PENDING || 0) + (counts.QUEUED || 0) + (counts.SENDING || 0);
  const terminalCompleted = sent + (counts.ERROR || 0) + (counts.IGNORED || 0) + (counts.OPTED_OUT || 0);
  const progress = total > 0 ? Math.round((terminalCompleted / total) * 100) : 0;

  const windowCheck = ContactPolicyService.checkBusinessWindow({
    scheduleStartMinute: campaign.scheduleStartMinute ?? 480,
    scheduleEndMinute: campaign.scheduleEndMinute ?? 1200,
    scheduleDays: campaign.scheduleDays || '1,2,3,4,5,6',
    scheduleTimezone: campaign.scheduleTimezone || 'America/Sao_Paulo'
  });

  const avgDelayS = (campaign.delayMin + campaign.delayMax) / 2;
  const avgBatchPauseS = (600 + 900) / 2;
  const estimatedSecondsRemaining = (campaign.status === 'RUNNING' && windowCheck.isInWindow)
    ? Math.round(remaining * avgDelayS + Math.floor(remaining / 8) * avgBatchPauseS)
    : null;

  return {
    total,
    pending: counts.PENDING || 0,
    queued: counts.QUEUED || 0,
    sending: counts.SENDING || 0,
    sent: counts.SENT || 0,
    delivered: counts.DELIVERED || 0,
    read: counts.READ || 0,
    replied: counts.REPLIED || 0,
    error: counts.ERROR || 0,
    ignored: counts.IGNORED || 0,
    optedOut: counts.OPTED_OUT || 0,
    progress,
    estimatedSecondsRemaining,
    scheduleStatus: {
      isInWindow: windowCheck.isInWindow,
      nextOpenTimestamp: windowCheck.nextOpenTimestamp ?? null,
      delayMs: windowCheck.delayMs ?? null,
      reason: windowCheck.reason ?? null
    }
  };
}

// Listar todas as campanhas do workspace com métricas e horários em lote
router.get('/', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = (req as any).user.workspaceId;
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId },
      include: {
        _count: {
          select: { leads: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (campaigns.length === 0) {
      return res.json([]);
    }

    // Consulta em lote de métricas para todas as campanhas do workspace
    const grouped = await prisma.lead.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: campaigns.map(c => c.id) } },
      _count: { status: true }
    });

    const countsMap: Record<string, Record<string, number>> = {};
    for (const c of campaigns) {
      countsMap[c.id] = {
        PENDING: 0, QUEUED: 0, SENDING: 0, SENT: 0, DELIVERED: 0,
        READ: 0, REPLIED: 0, ERROR: 0, IGNORED: 0, OPTED_OUT: 0
      };
    }
    for (const g of grouped) {
      if (countsMap[g.campaignId]) {
        countsMap[g.campaignId][g.status] = g._count.status;
      }
    }

    const campaignsWithStats = campaigns.map(c => ({
      ...c,
      stats: computeCampaignStats(c, countsMap[c.id])
    }));

    res.json(campaignsWithStats);
  } catch (error) {
    console.error('Erro ao listar campanhas:', error);
    res.status(500).json({ error: 'Falha ao buscar campanhas.' });
  }
});

// Obter a última copy utilizada no workspace para preencher novas campanhas
router.get('/last-copy', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = (req as any).user.workspaceId;
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { lastMessageComSite: true, lastMessageSemSite: true }
    });
    res.json({
      messageComSite: ws?.lastMessageComSite || null,
      messageSemSite: ws?.lastMessageSemSite || null
    });
  } catch (error) {
    console.error('Erro ao buscar última copy do workspace:', error);
    res.status(500).json({ error: 'Falha ao buscar última copy.' });
  }
});

// Criar nova campanha
router.post('/', requireActiveSubscription, validateBody(createCampaignSchema), async (req: Request, res: Response): Promise<any> => {
  const {
    name,
    messageComSite,
    messageSemSite,
    delayMin,
    delayMax,
    scheduleStartMinute,
    scheduleEndMinute,
    scheduleDays,
    scheduleTimezone,
    recontactAfterDays
  } = req.body;
  const workspaceId = req.user!.workspaceId;

  const comSite = typeof messageComSite === 'string' ? messageComSite.trim() : '';
  const semSite = typeof messageSemSite === 'string' ? messageSemSite.trim() : '';

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name: name.trim(),
        messageComSite: comSite || null,
        messageSemSite: semSite || null,
        delayMin,
        delayMax,
        scheduleStartMinute: scheduleStartMinute ?? 480,
        scheduleEndMinute: scheduleEndMinute ?? 1200,
        scheduleDays: scheduleDays ?? '1,2,3,4,5,6',
        scheduleTimezone: scheduleTimezone ?? 'America/Sao_Paulo',
        recontactAfterDays: recontactAfterDays ?? 30,
        workspaceId
      }
    });

    // Salva a última abordagem efetivamente utilizada no Workspace (sem sobrescrever valores válidos com vazio)
    const updateCopy: any = {};
    if (comSite) updateCopy.lastMessageComSite = comSite;
    if (semSite) updateCopy.lastMessageSemSite = semSite;
    if (Object.keys(updateCopy).length > 0) {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: updateCopy
      }).catch(err => console.warn('[WORKSPACE COPY] Falha ao persistir última copy no workspace:', err));
    }

    res.status(201).json(campaign);
  } catch (error) {
    console.error('Erro ao criar campanha:', error);
    res.status(500).json({ error: 'Erro ao criar campanha.' });
  }
});

// Prévia da importação de leads com diagnóstico completo e categorias mutuamente exclusivas
router.post('/preview-import', requireActiveSubscription, (req: Request, res: Response, next: Function) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'O arquivo excede o limite máximo permitido de 5MB.' });
      }
      return res.status(400).json({ error: `Erro no upload: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: Request, res: Response): Promise<any> => {
  const workspaceId = req.user!.workspaceId;
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo de leads foi enviado para prévia.' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  try {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const rawLeads = LeadImportService.parseFileContent(rawContent, originalName);

    if (rawLeads.length === 0) {
      return res.status(400).json({ error: 'O arquivo enviado está vazio ou não contém nenhum registro legível.' });
    }

    if (rawLeads.length > LeadImportService.MAX_LEADS_LIMIT) {
      return res.status(400).json({
        error: `O arquivo contém mais de ${LeadImportService.MAX_LEADS_LIMIT} registros. O limite máximo permitido por importação é de ${LeadImportService.MAX_LEADS_LIMIT} leads.`
      });
    }

    const recontactAfterDaysRaw = req.body?.recontactAfterDays !== undefined
      ? parseInt(String(req.body.recontactAfterDays), 10)
      : 30;
    const recontactAfterDays = isNaN(recontactAfterDaysRaw) || recontactAfterDaysRaw < 0 ? 0 : recontactAfterDaysRaw;

    const diagnostic = await LeadImportService.classifyLeads({
      rawLeads,
      workspaceId,
      recontactAfterDays
    });

    res.json({
      totalRows: diagnostic.totalRows,
      validCount: diagnostic.validCount,
      duplicateCount: diagnostic.duplicateCount,
      invalidCount: diagnostic.invalidCount,
      recontactBlockedCount: diagnostic.recontactBlockedCount,
      alreadyContactedCount: diagnostic.alreadyContactedCount,
      sampleLeads: diagnostic.sampleLeads,
      issues: diagnostic.issues
    });
  } catch (error: any) {
    console.error('Erro ao gerar prévia de importação:', error);
    res.status(500).json({ error: error.message || 'Falha ao processar prévia do arquivo.' });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Erro ao remover arquivo temporário de prévia:', err);
      }
    }
  }
});

// Prévia da mensagem renderizada com dados do workspace e amostra de lead
router.post('/preview-message', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = req.user!.workspaceId;
  const { messageComSite, messageSemSite, sampleLead } = req.body || {};

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { user: true }
    });

    const senderInfo = {
      meuNome: workspace?.user?.name || workspace?.name || 'Equipe de Atendimento',
      minhaEmpresa: workspace?.name || 'Minha Empresa'
    };

    const preview = gerarPreviaMensagem({
      messageComSite,
      messageSemSite,
      senderInfo,
      sampleLead
    });

    res.json(preview);
  } catch (error: any) {
    console.error('Erro ao gerar prévia de mensagem:', error);
    res.status(500).json({ error: error.message || 'Falha ao gerar prévia da mensagem.' });
  }
});

// Importar leads de arquivo JSON ou CSV com limpeza e alta compatibilidade usando LeadImportService
router.post('/:id/leads/import', requireActiveSubscription, (req: Request, res: Response, next: Function) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'O arquivo excede o limite máximo permitido de 5MB.' });
      }
      return res.status(400).json({ error: `Erro no upload: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = req.user!.workspaceId;

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo de leads foi enviado.' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  try {
    const rawContent = fs.readFileSync(filePath, 'utf8');

    const result = await LeadImportService.importToCampaign({
      campaignId: id,
      workspaceId,
      fileContent: rawContent,
      originalName
    });

    res.json({
      imported: result.imported,
      skipped: result.skipped,
      total: result.total,
      duplicateCount: result.duplicateCount,
      invalidCount: result.invalidCount,
      recontactBlockedCount: result.recontactBlockedCount,
      alreadySentCount: result.alreadySentCount,
      diagnostic: {
        totalRows: result.diagnostic.totalRows,
        validCount: result.diagnostic.validCount,
        duplicateCount: result.diagnostic.duplicateCount,
        invalidCount: result.diagnostic.invalidCount,
        recontactBlockedCount: result.diagnostic.recontactBlockedCount,
        alreadyContactedCount: result.diagnostic.alreadyContactedCount,
        sampleLeads: result.diagnostic.sampleLeads,
        issues: result.diagnostic.issues
      }
    });
  } catch (error: any) {
    console.error('Erro ao processar importação de leads:', error);
    const msg = error.message || 'Falha ao processar arquivo de leads.';
    if (
      msg.includes('Nenhum lead') ||
      msg.includes('vazio') ||
      msg.includes('inválido') ||
      msg.includes('limite')
    ) {
      return res.status(400).json({ error: msg });
    }
    if (msg.includes('Campanha não encontrada')) {
      return res.status(404).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Erro ao remover arquivo temporário:', err);
      }
    }
  }
});

// Listar leads detalhados da campanha com paginação server-side, busca e KPIs consolidados
router.get('/:id/leads', async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = (req as any).user.workspaceId;

  try {
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada.' });

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const whereClause: any = { campaignId: id };
    if (status && status !== 'ALL') {
      whereClause.status = status;
    }
    if (search && search.trim() !== '') {
      const term = search.trim();
      whereClause.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } }
      ];
    }

    // Executa consultas concorrentes: contagem filtrada, página de leads e KPIs globais agrupados
    const [totalFiltered, leads, kpiGrouped] = await Promise.all([
      prisma.lead.count({ where: whereClause }),
      prisma.lead.findMany({
        where: whereClause,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.lead.groupBy({
        by: ['status'],
        where: { campaignId: id },
        _count: { status: true }
      })
    ]);

    // Otimização: Consulta ao DispatchHistory APENAS para os telefones da página atual (Zero N+1)
    const pagePhones = Array.from(new Set(leads.map(l => WhatsappManager.normalizeBrPhone(l.phone))));
    const historyRecords = pagePhones.length > 0
      ? await prisma.dispatchHistory.findMany({
          where: {
            workspaceId,
            phone: { in: pagePhones }
          },
          select: {
            phone: true,
            lastSentAt: true,
            sendCount: true,
            lastCampaignName: true
          }
        })
      : [];

    const historyMap = new Map<string, typeof historyRecords[0]>();
    for (const h of historyRecords) {
      historyMap.set(h.phone, h);
    }

    const leadsWithHistory = leads.map(lead => {
      const normalized = WhatsappManager.normalizeBrPhone(lead.phone);
      const hist = historyMap.get(normalized);
      return {
        ...lead,
        historyInfo: hist ? {
          alreadySent: true,
          lastSentAt: hist.lastSentAt,
          sendCount: hist.sendCount,
          lastCampaignName: hist.lastCampaignName
        } : {
          alreadySent: false,
          lastSentAt: null,
          sendCount: 0,
          lastCampaignName: null
        }
      };
    });

    // Consolidação de KPIs com QUEUED explícito
    const countsMap: Record<string, number> = {};
    let totalAll = 0;
    for (const g of kpiGrouped) {
      countsMap[g.status] = g._count.status;
      totalAll += g._count.status;
    }

    const counts = {
      total: totalAll,
      pending: countsMap['PENDING'] || 0,
      queued: countsMap['QUEUED'] || 0,
      sending: countsMap['SENDING'] || 0,
      sent: countsMap['SENT'] || 0,
      delivered: countsMap['DELIVERED'] || 0,
      read: countsMap['READ'] || 0,
      replied: countsMap['REPLIED'] || 0,
      error: countsMap['ERROR'] || 0,
      ignored: countsMap['IGNORED'] || 0,
      optedOut: countsMap['OPTED_OUT'] || 0
    };

    res.json({
      campaign,
      leads: leadsWithHistory,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit) || 1
      },
      counts
    });
  } catch (error) {
    console.error('Erro ao buscar leads da campanha:', error);
    res.status(500).json({ error: 'Erro ao buscar leads da campanha.' });
  }
});

// Métricas reais da campanha (derivadas do banco + estimativa de conclusão)
router.get('/:id/stats', async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = (req as any).user.workspaceId;

  try {
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada.' });

    const grouped = await prisma.lead.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { status: true }
    });

    const counts: Record<string, number> = {
      PENDING: 0,
      QUEUED: 0,
      SENDING: 0,
      SENT: 0,
      DELIVERED: 0,
      READ: 0,
      REPLIED: 0,
      ERROR: 0,
      IGNORED: 0,
      OPTED_OUT: 0,
    };
    for (const g of grouped) counts[g.status] = g._count.status;

    const stats = computeCampaignStats(campaign, counts);
    res.json(stats);
  } catch (error) {
    console.error('Erro ao buscar estatísticas da campanha:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' });
  }
});

// Saúde da fila para a campanha: estado dos jobs no Redis x leads no banco
router.get('/:id/queue-health', async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = (req as any).user.workspaceId;

  try {
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada.' });

    // Contagem global da fila
    const globalCounts = await messageQueue.getJobCounts('waiting', 'delayed', 'active', 'failed');

    // Contagem específica desta campanha nos jobs pendentes
    const pendingJobs = await messageQueue.getJobs(['waiting', 'delayed', 'active']);
    const campaignJobs = pendingJobs.filter((j: any) => j.data?.campaignId === id);

    // Leads QUEUED no banco que NÃO têm job correspondente na fila = órfãos
    const queuedLeads = await prisma.lead.count({
      where: { campaignId: id, status: 'QUEUED' }
    });
    const orphaned = Math.max(0, queuedLeads - campaignJobs.length);

    res.json({
      campaignId: id,
      queue: {
        campaignPendingJobs: campaignJobs.length,
        orphanedLeads: orphaned
      },
      globalQueue: {
        waiting: globalCounts.waiting || 0,
        delayed: globalCounts.delayed || 0,
        active: globalCounts.active || 0,
        failed: globalCounts.failed || 0
      }
    });
  } catch (error) {
    console.error('Erro ao buscar saúde da fila:', error);
    res.status(500).json({ error: 'Erro ao buscar saúde da fila.' });
  }
});


router.post('/:id/start', requireActiveSubscription, async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = (req as any).user.workspaceId;

  try {
    res.json(await startCampaign(prisma, messageQueue, id, workspaceId));
  } catch (error) {
    if (error instanceof CampaignStartError) return res.status(error.status).json({ error: error.message });
    console.error('Erro ao iniciar campanha:', error);
    res.status(500).json({ error: 'Erro ao iniciar campanha.' });
  }
});

// Pausar campanha: remove TODOS os jobs pendentes da fila e devolve leads a PENDING
router.post('/:id/pause', async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = (req as any).user.workspaceId;

  try {
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada.' });

    const paused = await prisma.campaign.updateMany({ where: { id, status: { not: 'STARTING' } }, data: { status: 'PAUSED' } });
    if (!paused.count) return res.status(409).json({ error: 'Aguarde a preparação da campanha antes de pausar.' });

    // Drena os jobs delayed/waiting desta campanha (pause real, instantâneo)
    let removedJobs = 0;
    try {
      const jobs = await messageQueue.getJobs(['delayed', 'waiting']);
      for (const job of jobs) {
        if (job.data?.campaignId === id) {
          await job.remove();
          removedJobs++;
        }
      }
    } catch (queueErr) {
      console.error('[PAUSE] Erro ao drenar jobs da fila:', queueErr);
    }

    // Leads QUEUED voltam a PENDING para serem retomados no próximo start
    const reverted = await prisma.lead.updateMany({
      where: { campaignId: id, status: 'QUEUED' },
      data: { status: 'PENDING' }
    });

    console.log(`[PAUSE] Campanha ${id}: ${removedJobs} jobs removidos da fila, ${reverted.count} leads voltaram a PENDING.`);
    res.json({ message: 'Campanha pausada.', removedJobs, leadsReverted: reverted.count });
  } catch (error) {
    console.error('Erro ao pausar campanha:', error);
    res.status(500).json({ error: 'Erro ao pausar campanha.' });
  }
});

// Excluir campanha
router.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = (req as any).user.workspaceId;

  try {
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada.' });
    if (campaign.status === 'STARTING') return res.status(409).json({ error: 'Aguarde a preparação da campanha antes de excluir.' });

    // Remove jobs pendentes desta campanha antes de excluir (evita jobs órfãos)
    try {
      const jobs = await messageQueue.getJobs(['delayed', 'waiting']);
      for (const job of jobs) {
        if (job.data?.campaignId === id) await job.remove();
      }
    } catch (queueErr) {
      console.error('[DELETE] Erro ao drenar jobs da fila:', queueErr);
    }

    await prisma.campaign.delete({ where: { id } });
    res.json({ success: true, message: 'Campanha excluída com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir campanha:', error);
    res.status(500).json({ error: 'Erro ao excluir campanha.' });
  }
});

export default router;
