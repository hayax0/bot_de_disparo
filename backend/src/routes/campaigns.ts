import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { messageQueue } from '../services/queue';

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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `leads-${uniqueSuffix}.json`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // Limite de 20MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.toLowerCase().endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos no formato .json são aceitos.'));
    }
  }
});

const authenticate = (req: Request, res: Response, next: Function): any => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
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

// Listar todas as campanhas com contagem por status de leads
router.get('/', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = (req as any).user.workspaceId;
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { 
        _count: { 
          select: { leads: true } 
        } 
      }
    });
    res.json(campaigns);
  } catch (error) {
    console.error('Erro ao buscar campanhas:', error);
    res.status(500).json({ error: 'Erro ao buscar campanhas.' });
  }
});

// Criar nova campanha
router.post('/', async (req: Request, res: Response): Promise<any> => {
  const workspaceId = (req as any).user.workspaceId;
  const { name, messageComSite, messageSemSite, delayMin, delayMax } = req.body;
  
  if (!name || String(name).trim() === '') {
    return res.status(400).json({ error: 'O nome da campanha é obrigatório.' });
  }

  const cleanComSite = messageComSite ? String(messageComSite).trim() : null;
  const cleanSemSite = messageSemSite ? String(messageSemSite).trim() : null;

  if (!cleanComSite && !cleanSemSite) {
    return res.status(400).json({ 
      error: 'Informe ao menos uma mensagem para a campanha (sem site, com site ou ambas).' 
    });
  }

  const minD = parseInt(delayMin, 10);
  const maxD = parseInt(delayMax, 10);

  if (isNaN(minD) || isNaN(maxD) || minD < 10 || maxD < 10) {
    return res.status(400).json({ 
      error: 'Os delays mínimo e máximo devem ser números inteiros maiores ou iguais a 10 segundos.' 
    });
  }

  if (maxD < minD) {
    return res.status(400).json({ 
      error: 'O tempo máximo de delay deve ser igual ou maior que o tempo mínimo.' 
    });
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name: String(name).trim(),
        messageComSite: cleanComSite,
        messageSemSite: cleanSemSite,
        delayMin: minD,
        delayMax: maxD,
        workspaceId
      }
    });
    res.status(201).json(campaign);
  } catch (error) {
    console.error('Erro ao criar campanha:', error);
    res.status(500).json({ error: 'Erro ao criar campanha.' });
  }
});

// Importar leads de arquivo JSON ou CSV com limpeza e alta compatibilidade
router.post('/:id/leads/import', (req: Request, res: Response, next: Function) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'O arquivo excede o limite máximo permitido de 20MB.' });
      }
      return res.status(400).json({ error: `Erro no upload: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = (req as any).user.workspaceId;

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo de leads foi enviado.' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname.toLowerCase();

  try {
    // Validar se a campanha pertence ao workspace
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada.' });
    }

    const rawContent = fs.readFileSync(filePath, 'utf8');
    const fileContent = rawContent.replace(/^\uFEFF/, '').trim(); // Remove BOM UTF-8 se presente

    let leads: any[] = [];

    if (originalName.endsWith('.csv') || fileContent.startsWith('"') || fileContent.includes(',')) {
      // Parser básico e robusto de CSV se for enviado CSV
      try {
        const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length > 1) {
          const headerCols = lines[0].split(/[,;]/).map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(/[,;]/).map(c => c.replace(/^["']|["']$/g, '').trim());
            const rowObj: any = {};
            headerCols.forEach((header, idx) => {
              if (cols[idx] !== undefined) rowObj[header] = cols[idx];
            });
            leads.push(rowObj);
          }
        }
      } catch (csvErr) {
        console.warn('Falha no parse CSV, tentando JSON fallback:', csvErr);
      }
    }

    // Se não foi parseado como CSV, tenta JSON
    if (leads.length === 0) {
      try {
        const leadsData = JSON.parse(fileContent);
        if (Array.isArray(leadsData)) {
          leads = leadsData;
        } else if (leadsData && typeof leadsData === 'object') {
          if (Array.isArray(leadsData.items)) leads = leadsData.items;
          else if (Array.isArray(leadsData.results)) leads = leadsData.results;
          else if (Array.isArray(leadsData.data)) leads = leadsData.data;
          else if (Array.isArray(leadsData.leads)) leads = leadsData.leads;
          else leads = Object.values(leadsData).filter(v => typeof v === 'object' && v !== null);
        }
      } catch (jsonErr) {
        return res.status(400).json({ error: 'Arquivo inválido ou mal formatado. Envie um arquivo .json ou .csv válido.' });
      }
    }

    if (leads.length === 0) {
      return res.status(400).json({ error: 'O arquivo enviado não contém nenhum contato legível.' });
    }

    let imported = 0;
    let skipped = 0;

    const extractPhone = (lead: any): string | null => {
      if (lead.phone && String(lead.phone).trim() !== '') return String(lead.phone);
      if (lead.phoneUnformatted && String(lead.phoneUnformatted).trim() !== '') return String(lead.phoneUnformatted);
      if (lead.telephone && String(lead.telephone).trim() !== '') return String(lead.telephone);
      if (lead.whatsapp && String(lead.whatsapp).trim() !== '') return String(lead.whatsapp);
      if (lead.celular && String(lead.celular).trim() !== '') return String(lead.celular);
      if (lead.telefone && String(lead.telefone).trim() !== '') return String(lead.telefone);
      if (lead.numero && String(lead.numero).trim() !== '') return String(lead.numero);
      if (lead.contact && String(lead.contact).trim() !== '') return String(lead.contact);
      if (Array.isArray(lead.phones) && lead.phones.length > 0) return String(lead.phones[0]);
      if (Array.isArray(lead.phonesUncertain) && lead.phonesUncertain.length > 0) return String(lead.phonesUncertain[0]);
      return null;
    };

    const extractTitle = (lead: any): string | null => {
      const val = lead.title || lead.name || lead.company || lead.companyName || lead.nome || lead.empresa || lead.tradeName || lead.titulo;
      return val ? String(val).trim() : null;
    };

    const extractWebsite = (lead: any): string | null => {
      const val = lead.website || lead.url || lead.site || lead.link || lead.web;
      return val ? String(val).trim() : null;
    };

    const extractNeighborhood = (lead: any): string | null => {
      const val = lead.neighborhood || lead.city || lead.bairro || lead.cidade || lead.municipio || lead.address?.neighborhood || lead.address?.city || lead.streetAddress || lead.address;
      return val ? String(val).trim() : null;
    };

    for (const lead of leads) {
      const title = extractTitle(lead);
      if (!title) {
        skipped++;
        continue;
      }

      const rawPhone = extractPhone(lead);
      if (!rawPhone) {
        skipped++;
        continue;
      }

      let num = rawPhone.replace(/\D/g, '').replace(/^0+/, '');
      if (num.length >= 10 && num.length <= 11) {
        num = '55' + num;
      } else if (num.length === 12 || num.length === 13) {
        if (!num.startsWith('55')) num = '55' + num;
      } else if (num.length < 10) {
        skipped++;
        continue;
      }

      try {
        await prisma.lead.create({
          data: {
            campaignId: id,
            title,
            phone: num,
            website: extractWebsite(lead),
            neighborhood: extractNeighborhood(lead)
          }
        });
        imported++;
      } catch {
        // Ignora duplicados na mesma campanha
        skipped++;
      }
    }

    res.json({ imported, skipped, total: leads.length });
  } catch (error) {
    console.error('Erro ao processar importação de leads:', error);
    res.status(500).json({ error: 'Falha ao processar arquivo de leads.' });
  } finally {
    // Garante remoção do arquivo temporário do disco
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Erro ao remover arquivo temporário:', err);
      }
    }
  }
});

// Listar leads detalhados da campanha
router.get('/:id/leads', async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = (req as any).user.workspaceId;

  try {
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada.' });

    const leads = await prisma.lead.findMany({ 
      where: { campaignId: id },
      orderBy: { createdAt: 'asc' }
    });

    const counts = {
      total: leads.length,
      pending: leads.filter(l => l.status === 'PENDING' || l.status === 'QUEUED').length,
      sent: leads.filter(l => l.status === 'SENT').length,
      replied: leads.filter(l => l.status === 'REPLIED').length,
      error: leads.filter(l => l.status === 'ERROR').length,
    };

    res.json({ campaign, leads, counts });
  } catch (error) {
    console.error('Erro ao buscar leads:', error);
    res.status(500).json({ error: 'Erro ao buscar leads da campanha.' });
  }
});

// Iniciar disparos da campanha com idempotência, jobId único e prevenção de duplicidade
router.post('/:id/start', async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = (req as any).user.workspaceId;

  try {
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada.' });

    // 1. Bloqueio se a campanha já estiver em execução (409 Conflict)
    if (campaign.status === 'RUNNING') {
      return res.status(409).json({ error: 'Esta campanha já está em execução.' });
    }

    // 2. Validar se o WhatsApp do workspace está realmente CONECTADO
    const waSession = await prisma.whatsappSession.findUnique({ where: { workspaceId } });
    if (!waSession || waSession.status !== 'CONNECTED') {
      return res.status(400).json({ 
        error: 'O WhatsApp não está conectado. Conecte seu aparelho através do QR Code antes de iniciar os envios.' 
      });
    }

    // 3. Buscar leads pendentes (ou que ficaram como QUEUED)
    const pendingLeads = await prisma.lead.findMany({
      where: { 
        campaignId: id, 
        status: { in: ['PENDING', 'QUEUED'] }
      }
    });

    if (pendingLeads.length === 0) {
      return res.json({ message: 'Nenhum lead pendente nesta campanha.', jobsQueued: 0 });
    }

    // 4. Atualizar status da campanha para RUNNING e leads para QUEUED
    await prisma.$transaction([
      prisma.campaign.update({ where: { id }, data: { status: 'RUNNING' } }),
      prisma.lead.updateMany({
        where: { 
          campaignId: id, 
          status: { in: ['PENDING', 'QUEUED'] } 
        },
        data: { status: 'QUEUED' }
      })
    ]);

    let currentDelay = 1000; // Primeiro envio inicia em 1 segundo
    const minW = campaign.delayMin * 1000;
    const maxW = campaign.delayMax * 1000;

    const LOTE_MAXIMO = 8;
    const PAUSA_LOTE_MIN = 600000; // 10 min
    const PAUSA_LOTE_MAX = 900000; // 15 min

    let countInBatch = 0;
    let jobsQueued = 0;

    for (let i = 0; i < pendingLeads.length; i++) {
      const lead = pendingLeads[i];
      if (i > 0) {
        const delay = Math.floor(Math.random() * (maxW - minW + 1)) + minW;
        currentDelay += delay;
      }
      countInBatch++;

      // Job determinístico por campaignId e leadId garante idempotência no Redis
      await messageQueue.add('send-message', {
        leadId: lead.id,
        campaignId: id,
        workspaceId
      }, { 
        jobId: `${id}_${lead.id}_${Date.now()}`,
        delay: currentDelay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false
      });
      jobsQueued++;

      // Pausa longa de segurança anti-ban a cada LOTE_MAXIMO envios
      if (countInBatch >= LOTE_MAXIMO) {
        const pausaLote = Math.floor(Math.random() * (PAUSA_LOTE_MAX - PAUSA_LOTE_MIN + 1)) + PAUSA_LOTE_MIN;
        currentDelay += pausaLote;
        countInBatch = 0;
      }
    }

    res.json({ message: 'Campanha iniciada com sucesso!', jobsQueued });
  } catch (error) {
    console.error('Erro ao iniciar campanha:', error);
    res.status(500).json({ error: 'Erro ao iniciar campanha.' });
  }
});

// Pausar campanha
router.post('/:id/pause', async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = (req as any).user.workspaceId;

  try {
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada.' });

    await prisma.campaign.update({ where: { id }, data: { status: 'PAUSED' } });
    res.json({ message: 'Campanha pausada.' });
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

    await prisma.campaign.delete({ where: { id } });
    res.json({ success: true, message: 'Campanha excluída com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir campanha:', error);
    res.status(500).json({ error: 'Erro ao excluir campanha.' });
  }
});

export default router;
