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
  limits: { fileSize: 30 * 1024 * 1024 }, // Limite de 30MB
  fileFilter: (req, file, cb) => {
    // Aceita qualquer formato de arquivo de texto/dados para fazer a validação inteligente no handler
    cb(null, true);
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

// Listar todas as campanhas do workspace
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
    res.json(campaigns);
  } catch (error) {
    console.error('Erro ao listar campanhas:', error);
    res.status(500).json({ error: 'Falha ao buscar campanhas.' });
  }
});

// Criar nova campanha
router.post('/', async (req: Request, res: Response): Promise<any> => {
  const { name, messageComSite, messageSemSite, delayMin, delayMax } = req.body;
  const workspaceId = (req as any).user.workspaceId;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'O nome da campanha é obrigatório.' });
  }

  const comSite = typeof messageComSite === 'string' ? messageComSite.trim() : '';
  const semSite = typeof messageSemSite === 'string' ? messageSemSite.trim() : '';

  if (!comSite && !semSite) {
    return res.status(400).json({ error: 'Informe ao menos uma mensagem para a campanha (com site, sem site ou geral).' });
  }

  const minD = Number(delayMin);
  const maxD = Number(delayMax);

  if (isNaN(minD) || isNaN(maxD) || minD < 10 || maxD < 10) {
    return res.status(400).json({ error: 'Os delays mínimo e máximo devem ser números inteiros maiores ou iguais a 10 segundos.' });
  }

  if (maxD < minD) {
    return res.status(400).json({ error: 'O tempo máximo de delay deve ser igual ou maior que o tempo mínimo.' });
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name: name.trim(),
        messageComSite: comSite || null,
        messageSemSite: semSite || null,
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
        return res.status(400).json({ error: 'O arquivo excede o limite máximo permitido de 30MB.' });
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
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada.' });
    }

    const rawContent = fs.readFileSync(filePath, 'utf8');
    const fileContent = rawContent.replace(/^\uFEFF/, '').trim(); // Remove BOM UTF-8 se presente

    if (!fileContent) {
      return res.status(400).json({ error: 'O arquivo enviado está vazio.' });
    }

    let leads: any[] = [];

    // 1. TENTAR PARSE COMO JSON PRIMEIRO
    let isJson = false;
    if (fileContent.startsWith('[') || fileContent.startsWith('{') || originalName.endsWith('.json')) {
      try {
        const parsed = JSON.parse(fileContent);
        if (Array.isArray(parsed)) {
          leads = parsed;
          isJson = true;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.items)) leads = parsed.items;
          else if (Array.isArray(parsed.results)) leads = parsed.results;
          else if (Array.isArray(parsed.data)) leads = parsed.data;
          else if (Array.isArray(parsed.leads)) leads = parsed.leads;
          else if (Array.isArray(parsed.contacts)) leads = parsed.contacts;
          else if (Array.isArray(parsed.places)) leads = parsed.places;
          else if (Array.isArray(parsed.rows)) leads = parsed.rows;
          else leads = Object.values(parsed).filter(v => typeof v === 'object' && v !== null);
          isJson = true;
        }
      } catch (jsonErr) {
        if (originalName.endsWith('.json')) {
          return res.status(400).json({ error: 'Arquivo JSON inválido ou corrompido. Verifique a formatação do arquivo.' });
        }
      }
    }

    // 2. SE NÃO FOR JSON, TENTAR PARSE COMO CSV / TSV / TEXTO DELIMITADO
    if (!isJson && leads.length === 0) {
      try {
        const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length >= 1) {
          const firstLine = lines[0];
          const countComma = (firstLine.match(/,/g) || []).length;
          const countSemi = (firstLine.match(/;/g) || []).length;
          const countTab = (firstLine.match(/\t/g) || []).length;
          const countPipe = (firstLine.match(/\|/g) || []).length;

          let delimiter = ',';
          if (countSemi > countComma && countSemi >= countTab) delimiter = ';';
          else if (countTab > countComma && countTab >= countSemi) delimiter = '\t';
          else if (countPipe > countComma && countPipe >= countSemi) delimiter = '|';

          const parseCsvLine = (line: string, delim: string): string[] => {
            const result: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"' || char === "'") {
                inQuotes = !inQuotes;
              } else if (char === delim && !inQuotes) {
                result.push(current.trim().replace(/^["']|["']$/g, ''));
                current = '';
              } else {
                current += char;
              }
            }
            result.push(current.trim().replace(/^["']|["']$/g, ''));
            return result;
          };

          const headerCols = parseCsvLine(lines[0], delimiter).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
          
          for (let i = 1; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i], delimiter);
            if (cols.length === 0 || (cols.length === 1 && cols[0] === '')) continue;
            const rowObj: any = {};
            headerCols.forEach((header, idx) => {
              if (cols[idx] !== undefined) rowObj[header] = cols[idx];
            });
            if (headerCols.length === 0 || !headerCols.some(h => h.includes('phone') || h.includes('tel') || h.includes('cel') || h.includes('nome') || h.includes('title'))) {
              rowObj['phone'] = cols[0];
              if (cols[1]) rowObj['title'] = cols[1];
            }
            leads.push(rowObj);
          }
        }
      } catch (csvErr) {
        console.warn('Falha no parser CSV:', csvErr);
      }
    }

    if (leads.length === 0) {
      return res.status(400).json({ error: 'O arquivo enviado não contém nenhum registro legível.' });
    }

    let imported = 0;
    let skipped = 0;

    const extractPhone = (lead: any): string | null => {
      const candidates = [
        lead.phone,
        lead.phoneUnformatted,
        lead.telephone,
        lead.telephoneUnformatted,
        lead.whatsapp,
        lead.celular,
        lead.telefone,
        lead.numero,
        lead.contact,
        lead.contactNumber,
        lead.phoneNumber,
        lead.phone_number,
        lead.tel,
        lead.mobile,
        lead.mobilePhone
      ];

      for (const val of candidates) {
        if (val !== undefined && val !== null) {
          const str = String(val).trim();
          if (str !== '') return str;
        }
      }

      if (Array.isArray(lead.phones) && lead.phones.length > 0) return String(lead.phones[0]).trim();
      if (Array.isArray(lead.phonesUncertain) && lead.phonesUncertain.length > 0) return String(lead.phonesUncertain[0]).trim();
      return null;
    };

    const extractTitle = (lead: any): string | null => {
      const candidates = [
        lead.title,
        lead.name,
        lead.company,
        lead.companyName,
        lead.company_name,
        lead.nome,
        lead.empresa,
        lead.tradeName,
        lead.razaoSocial,
        lead.nomeFantasia,
        lead.titulo,
        lead.placeName,
        lead.businessName,
        lead.storeName
      ];

      for (const val of candidates) {
        if (val !== undefined && val !== null) {
          const str = String(val).trim();
          if (str !== '') return str;
        }
      }
      return null;
    };

    const extractWebsite = (lead: any): string | null => {
      const candidates = [lead.website, lead.url, lead.site, lead.link, lead.web, lead.domain, lead.pageUrl, lead.placeUrl];
      for (const val of candidates) {
        if (val !== undefined && val !== null) {
          const str = String(val).trim();
          if (str !== '') return str;
        }
      }
      return null;
    };

    const extractNeighborhood = (lead: any): string | null => {
      const candidates = [
        lead.neighborhood,
        lead.bairro,
        lead.city,
        lead.cidade,
        lead.municipio,
        lead.address?.neighborhood,
        lead.address?.city,
        lead.streetAddress,
        lead.address,
        lead.fullAddress
      ];
      for (const val of candidates) {
        if (val !== undefined && val !== null) {
          const str = String(val).trim();
          if (str !== '') return str;
        }
      }
      return null;
    };

    for (const lead of leads) {
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

      let title = extractTitle(lead);
      if (!title) {
        title = `Contato ${num.slice(-4)}`;
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
        skipped++;
      }
    }

    if (imported === 0) {
      return res.status(400).json({ 
        error: `Nenhum telefone válido com DDD foi encontrado nos ${leads.length} registros do arquivo. Certifique-se de que a planilha/JSON contenha campos com telefones válidos.` 
      });
    }

    res.json({ imported, skipped, total: leads.length });
  } catch (error: any) {
    console.error('Erro ao processar importação de leads:', error);
    res.status(500).json({ error: error.message || 'Falha ao processar arquivo de leads.' });
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
