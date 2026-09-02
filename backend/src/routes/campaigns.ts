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
        
        const extractLeadsRecursive = (obj: any, maxDepth = 4): any[] => {
          if (maxDepth < 0 || !obj) return [];
          if (Array.isArray(obj)) {
            if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
              return obj;
            }
            return [];
          }
          if (typeof obj === 'object') {
            for (const key of ['items', 'results', 'data', 'leads', 'contacts', 'places', 'rows', 'dataset']) {
              if (Array.isArray(obj[key]) && obj[key].length > 0 && typeof obj[key][0] === 'object') {
                return obj[key];
              }
            }
            for (const val of Object.values(obj)) {
               const res = extractLeadsRecursive(val, maxDepth - 1);
               if (res.length > 0) return res;
            }
          }
          return [];
        };

        if (Array.isArray(parsed)) {
          leads = parsed;
          isJson = true;
        } else if (parsed && typeof parsed === 'object') {
          leads = extractLeadsRecursive(parsed);
          if (!leads || leads.length === 0) {
            leads = Object.values(parsed).filter(v => typeof v === 'object' && v !== null);
          }
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
            let hasPhoneColumn = false;
            
            headerCols.forEach((header, idx) => {
              if (cols[idx] !== undefined) {
                rowObj[header] = cols[idx];
                if (header.includes('phone') || header.includes('tel') || header.includes('cel') || header.includes('whatsapp') || header.includes('wpp')) {
                  hasPhoneColumn = true;
                }
              }
            });
            
            if (!hasPhoneColumn) {
              // Identificação heurística de telefone se o header não ajudar
              let phoneColIdx = -1;
              for(let k=0; k<cols.length; k++) {
                const cleaned = cols[k].replace(/[^0-9]/g, '');
                if (cleaned.length >= 10 && cleaned.length <= 14) {
                  phoneColIdx = k;
                  break;
                }
              }
              if (phoneColIdx !== -1) {
                rowObj['phone'] = cols[phoneColIdx];
                if (phoneColIdx === 0 && cols.length > 1) rowObj['title'] = cols[1];
                else if (phoneColIdx !== 0) rowObj['title'] = cols[0];
              } else {
                // Fallback legado
                rowObj['phone'] = cols[0];
                if (cols[1]) rowObj['title'] = cols[1];
              }
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
      const priorityCandidates = [
        lead.whatsapp,
        lead.celular,
        lead.mobile,
        lead.mobilePhone,
        lead.cellphone,
        lead.phone,
        lead.phoneUnformatted,
        lead.phoneNumber,
        lead.phone_number,
        lead.telephone,
        lead.telephoneUnformatted,
        lead.telefone,
        lead.numero,
        lead.contact,
        lead.contactNumber,
        lead.tel
      ];

      const allPhones: string[] = [];
      for (const val of priorityCandidates) {
        if (val !== undefined && val !== null) {
          const str = String(val).trim();
          if (str !== '') allPhones.push(str);
        }
      }

      if (Array.isArray(lead.phones)) {
        for (const p of lead.phones) {
          if (p) allPhones.push(String(p).trim());
        }
      }
      if (Array.isArray(lead.phonesUncertain)) {
        for (const p of lead.phonesUncertain) {
          if (p) allPhones.push(String(p).trim());
        }
      }

      if (allPhones.length === 0) return null;

      // Dentre os telefones encontrados, prioriza aquele que for celular (11 dígitos com 9 no 3º dígito ou 13 dígitos 55+DDD+9)
      for (const raw of allPhones) {
        const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
        if (digits.length === 11 && digits[2] === '9') return raw;
        if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') return raw;
      }

      // Se nenhum for celular explícito, retorna o primeiro encontrado
      return allPhones[0];
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
      // No Apify Google Maps, 'url' e 'placeUrl' são o link do próprio Google Maps.
      // Apenas consideramos campos dedicados ao website da empresa:
      const candidates = [lead.website, lead.site, lead.web, lead.domain];
      for (const val of candidates) {
        if (val !== undefined && val !== null) {
          const str = String(val).trim();
          if (str !== '' && temWebsiteValido(str)) return str;
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
      } catch (err: any) {
        // If it's a unique constraint violation on campaignId + phone, we can just skip it (it's a duplicate)
        if (err.code === 'P2002') {
          skipped++;
        } else {
          console.error(`Erro inesperado ao inserir lead (${num}):`, err);
          skipped++;
        }
      }
    }

    if (imported === 0) {
      const sample = leads.length > 0 ? JSON.stringify(leads[0]).substring(0, 200) : 'vazio';
      return res.status(400).json({ 
        error: `Nenhum lead importado. ${skipped} foram ignorados. Os campos do arquivo podem estar incorretos ou os contatos já existem nesta campanha. Exemplo lido: ${sample}...` 
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

    const counts: Record<string, number> = { PENDING: 0, QUEUED: 0, SENT: 0, REPLIED: 0, ERROR: 0 };
    for (const g of grouped) counts[g.status] = g._count.status;

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const sent = counts.SENT + counts.REPLIED;
    const remaining = counts.PENDING + counts.QUEUED;
    const progress = total > 0 ? Math.round(((sent + counts.ERROR) / total) * 100) : 0;

    // Estimativa de tempo restante: delays médios + pausas de lote (8 envios → pausa de ~10-15min)
    const avgDelayS = (campaign.delayMin + campaign.delayMax) / 2;
    const avgBatchPauseS = (600 + 900) / 2; // média entre 10min e 15min
    const estimatedSecondsRemaining = campaign.status === 'RUNNING'
      ? Math.round(remaining * avgDelayS + Math.floor(remaining / 8) * avgBatchPauseS)
      : null;

    res.json({
      total,
      pending: counts.PENDING,
      queued: counts.QUEUED,
      sent: counts.SENT,
      replied: counts.REPLIED,
      error: counts.ERROR,
      progress,
      estimatedSecondsRemaining
    });
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
    const campaignJobs = pendingJobs.filter(j => j.data?.campaignId === id);

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


router.post('/:id/start', async (req: Request, res: Response): Promise<any> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const workspaceId = (req as any).user.workspaceId;

  try {
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada.' });

    // 1. Bloqueio ATÔMICO contra execução dupla: só 1 request consegue transicionar para RUNNING
    //    (evita race condition quando dois cliques de "iniciar" chegam simultaneamente)
    const transitioned = await prisma.campaign.updateMany({
      where: { id, status: { not: 'RUNNING' } },
      data: { status: 'RUNNING' }
    });
    if (transitioned.count === 0) {
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

    // 4. Marcar leads como QUEUED (campanha já marcada RUNNING atomicamente no passo 1)
    await prisma.lead.updateMany({
      where: {
        campaignId: id,
        status: { in: ['PENDING', 'QUEUED'] }
      },
      data: { status: 'QUEUED' }
    });

    let currentDelay = 1000; // Primeiro envio inicia em 1 segundo
    const minW = campaign.delayMin * 1000;
    const maxW = campaign.delayMax * 1000;

    const LOTE_MAXIMO = 8;
    const PAUSA_LOTE_MIN = 600000; // 10 min
    const PAUSA_LOTE_MAX = 900000; // 15 min

    let countInBatch = 0;
    let jobsQueued = 0;

    // Pré-calcula todos os jobs (delays + IDs determinísticos) antes de enfileirar em lotes paralelos.
    // Isso evita que o endpoint fique minutos em loop sequencial com listas grandes (timeout no frontend).
    const jobsToQueue: Array<{ name: string; data: object; opts: object }> = [];

    for (let i = 0; i < pendingLeads.length; i++) {
      const lead = pendingLeads[i];
      if (i > 0) {
        const delay = Math.floor(Math.random() * (maxW - minW + 1)) + minW;
        currentDelay += delay;
      }
      countInBatch++;

      // jobId DETERMINÍSTICO (sem Date.now): cliques duplicados/retries nunca criam job duplicado —
      // o BullMQ ignora add() com jobId que já existe na fila.
      jobsToQueue.push({
        name: 'send-message',
        data: { leadId: lead.id, campaignId: id, workspaceId },
        opts: {
          jobId: `${id}_${lead.id}`,
          delay: currentDelay,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: false
        }
      });

      // Pausa longa de segurança anti-ban a cada LOTE_MAXIMO envios
      if (countInBatch >= LOTE_MAXIMO) {
        const pausaLote = Math.floor(Math.random() * (PAUSA_LOTE_MAX - PAUSA_LOTE_MIN + 1)) + PAUSA_LOTE_MIN;
        currentDelay += pausaLote;
        countInBatch = 0;
      }
    }

    // Enfileira em lotes paralelos de 200 para não bloquear o event loop por muito tempo
    const CHUNK = 200;
    for (let start = 0; start < jobsToQueue.length; start += CHUNK) {
      const chunk = jobsToQueue.slice(start, start + CHUNK);
      const results = await Promise.allSettled(
        chunk.map(j => messageQueue.add(j.name, j.data, j.opts as any))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') jobsQueued++;
        else console.error('[QUEUE ERROR] Falha ao enfileirar job de campanha:', r.reason?.message || r.reason);
      }
    }

    res.json({ message: 'Campanha iniciada com sucesso!', jobsQueued });
  } catch (error) {
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

    await prisma.campaign.update({ where: { id }, data: { status: 'PAUSED' } });

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
