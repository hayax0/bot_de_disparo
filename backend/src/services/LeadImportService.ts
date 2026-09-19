import { prisma } from '../lib/prisma';
import { WhatsappManager } from './WhatsappManager';
import { temWebsiteValido } from './ProposalEngine';

export interface RawLeadData {
  title?: string;
  phone?: string;
  website?: string | null;
  neighborhood?: string | null;
  [key: string]: any;
}

export interface ClassifiedLead {
  rowNumber: number;
  title: string;
  phone: string;
  website: string | null;
  neighborhood: string | null;
  hasValidWebsite: boolean;
  status: 'VALID' | 'DUPLICATE' | 'INVALID' | 'RECONTACT_BLOCKED';
  alreadyContacted: boolean;
  reason?: string | null | undefined;
  lastSentAt?: Date | null | undefined;
  lastCampaignName?: string | null | undefined;
  sendCount?: number | undefined;
}

export interface LeadImportDiagnostic {
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  recontactBlockedCount: number;
  alreadyContactedCount: number; // Subconjunto dos válidos que já têm histórico
  sampleLeads: ClassifiedLead[];
  issues: Array<{
    row: number;
    title?: string | undefined;
    phone?: string | undefined;
    type: 'INVALID' | 'DUPLICATE' | 'RECONTACT_BLOCKED';
    reason: string;
  }>;
  validLeadsToImport: ClassifiedLead[];
}

export class LeadImportService {
  public static readonly MAX_LEADS_LIMIT = 2000;
  public static readonly MAX_SAMPLE_LEADS = 10;
  public static readonly MAX_ISSUES_RETURNED = 25;

  /**
   * Lê o arquivo (CSV ou JSON) do disco ou string e extrai os objetos brutos
   */
  public static parseFileContent(fileContentRaw: string, originalName = ''): RawLeadData[] {
    const fileContent = fileContentRaw.replace(/^\uFEFF/, '').trim();
    if (!fileContent) return [];

    // 1. Tentar parse como JSON
    const isJsonAttempt = fileContent.startsWith('[') || fileContent.startsWith('{') || originalName.toLowerCase().endsWith('.json');
    if (isJsonAttempt) {
      try {
        const parsed = JSON.parse(fileContent);
        const extracted = this.extractLeadsFromJson(parsed);
        if (extracted.length > 0) return extracted;
      } catch (jsonErr) {
        if (originalName.toLowerCase().endsWith('.json')) {
          throw new Error('Arquivo JSON corrompido ou mal formatado.');
        }
      }
    }

    // 2. Parser CSV / TSV / Delimitado robusto
    return this.parseCsv(fileContent);
  }

  private static extractLeadsFromJson(parsed: any, maxDepth = 4): RawLeadData[] {
    if (maxDepth < 0 || !parsed) return [];
    if (Array.isArray(parsed)) {
      if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
        return parsed;
      }
      return [];
    }
    if (typeof parsed === 'object') {
      for (const key of ['items', 'results', 'data', 'leads', 'contacts', 'places', 'rows', 'dataset']) {
        if (Array.isArray(parsed[key]) && parsed[key].length > 0 && typeof parsed[key][0] === 'object') {
          return parsed[key];
        }
      }
      for (const val of Object.values(parsed)) {
        const res = this.extractLeadsFromJson(val, maxDepth - 1);
        if (res.length > 0) return res;
      }
    }
    return [];
  }

  private static parseCsv(content: string): RawLeadData[] {
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 1) return [];

    // Detectar delimitador baseado no cabeçalho
    const firstLine = lines[0];
    const countComma = (firstLine.match(/,/g) || []).length;
    const countSemi = (firstLine.match(/;/g) || []).length;
    const countTab = (firstLine.match(/\t/g) || []).length;
    const countPipe = (firstLine.match(/\|/g) || []).length;

    let delimiter = ',';
    if (countSemi > countComma && countSemi >= countTab) delimiter = ';';
    else if (countTab > countComma && countTab >= countSemi) delimiter = '\t';
    else if (countPipe > countComma && countPipe >= countSemi) delimiter = '|';

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^"|"$/g, ''));
      return result;
    };

    const normalizeHeaderKey = (h: string): string => {
      return h
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/[^a-z0-9_]/g, '');
    };

    const headerCols = parseLine(lines[0]).map(normalizeHeaderKey);
    const leads: RawLeadData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i]);
      if (cols.length === 0 || (cols.length === 1 && cols[0] === '')) continue;

      const rowObj: RawLeadData = {};
      let hasPhoneCol = false;

      headerCols.forEach((header, idx) => {
        if (cols[idx] !== undefined) {
          rowObj[header] = cols[idx];
          if (
            header.includes('phone') ||
            header.includes('tel') ||
            header.includes('cel') ||
            header.includes('whatsapp') ||
            header.includes('wpp') ||
            header.includes('numero') ||
            header.includes('contato')
          ) {
            hasPhoneCol = true;
          }
        }
      });

      // Heurística de busca de coluna de telefone caso o header não seja explícito
      if (!hasPhoneCol) {
        let foundIdx = -1;
        for (let k = 0; k < cols.length; k++) {
          const digits = cols[k].replace(/[^0-9]/g, '');
          if (digits.length >= 10 && digits.length <= 14) {
            foundIdx = k;
            break;
          }
        }
        if (foundIdx !== -1) {
          rowObj['phone'] = cols[foundIdx];
          if (foundIdx === 0 && cols.length > 1) rowObj['title'] = cols[1];
          else if (foundIdx !== 0) rowObj['title'] = cols[0];
        } else {
          rowObj['phone'] = cols[0];
          if (cols[1]) rowObj['title'] = cols[1];
        }
      }

      leads.push(rowObj);
    }

    return leads;
  }

  public static extractPhone(lead: any): string | null {
    if (!lead || typeof lead !== 'object') return null;

    const candidates = [
      lead.whatsapp,
      lead.celular,
      lead.mobile,
      lead.mobilePhone,
      lead.mobile_phone,
      lead.cellphone,
      lead.cell_phone,
      lead.phone,
      lead.phoneUnformatted,
      lead.phoneNumber,
      lead.phone_number,
      lead.telephone,
      lead.telephoneUnformatted,
      lead.telefone,
      lead.telefone1,
      lead.telefone2,
      lead.telefone_1,
      lead.numero,
      lead.numero_telefone,
      lead.contact,
      lead.contactNumber,
      lead.tel
    ];

    const allPhones: string[] = [];
    for (const val of candidates) {
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

    // Priorizar celular brasileiro com 9 no nono dígito (11 dígitos ou 13 com 55)
    for (const raw of allPhones) {
      const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
      if (digits.length === 11 && digits[2] === '9') return raw;
      if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') return raw;
    }

    return allPhones[0];
  }

  public static extractTitle(lead: any): string | null {
    if (!lead || typeof lead !== 'object') return null;

    const candidates = [
      lead.title,
      lead.name,
      lead.company,
      lead.companyName,
      lead.company_name,
      lead.nome,
      lead.nomefantasia,
      lead.nome_fantasia,
      lead.razaosocial,
      lead.razao_social,
      lead.empresa,
      lead.tradeName,
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
  }

  public static extractWebsite(lead: any): string | null {
    if (!lead || typeof lead !== 'object') return null;

    const candidates = [lead.website, lead.site, lead.web, lead.domain, lead.url_site];
    for (const val of candidates) {
      if (val !== undefined && val !== null) {
        const str = String(val).trim();
        if (str !== '' && temWebsiteValido(str)) return str;
      }
    }
    return null;
  }

  public static extractNeighborhood(lead: any): string | null {
    if (!lead || typeof lead !== 'object') return null;

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
  }

  /**
   * Classifica rigorosamente todos os leads em categorias mutuamente exclusivas
   */
  public static async classifyLeads(params: {
    rawLeads: RawLeadData[];
    workspaceId: string;
    /** @deprecated Ignorado; histórico não impede novas importações. */
    recontactAfterDays?: number;
  }): Promise<LeadImportDiagnostic> {
    const { rawLeads, workspaceId } = params;

    if (rawLeads.length > this.MAX_LEADS_LIMIT) {
      throw new Error(`O arquivo contém ${rawLeads.length} registros. O limite máximo permitido por importação é de ${this.MAX_LEADS_LIMIT} leads.`);
    }

    // 1. Extração preliminar de telefones para consulta em lote no banco
    const normalizedPhones: string[] = [];
    for (const r of rawLeads) {
      const rawP = this.extractPhone(r);
      if (rawP) {
        const norm = WhatsappManager.normalizeBrPhone(rawP);
        if (norm.length >= 10) {
          normalizedPhones.push(norm);
        }
      }
    }

    const uniquePhones = Array.from(new Set(normalizedPhones));

    // 2. Consulta em lote única ao DispatchHistory do Workspace (Zero N+1)
    const historyMap = new Map<string, { lastSentAt: Date; sendCount: number; lastCampaignName: string | null }>();
    if (uniquePhones.length > 0) {
      const historyRecords = await prisma.dispatchHistory.findMany({
        where: {
          workspaceId,
          phone: { in: uniquePhones }
        },
        select: {
          phone: true,
          lastSentAt: true,
          sendCount: true,
          lastCampaignName: true
        }
      });
      for (const h of historyRecords) {
        historyMap.set(h.phone, {
          lastSentAt: h.lastSentAt,
          sendCount: h.sendCount,
          lastCampaignName: h.lastCampaignName
        });
      }
    }

    // 3. Classificação linha por linha
    const seenPhonesInFile = new Set<string>();
    const classifiedList: ClassifiedLead[] = [];
    const issues: LeadImportDiagnostic['issues'] = [];

    let validCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;
    const recontactBlockedCount = 0; // Compatibilidade com clientes antigos; histórico não bloqueia.
    let alreadyContactedCount = 0;

    for (let i = 0; i < rawLeads.length; i++) {
      const raw = rawLeads[i];
      const rowNumber = i + 1;
      const rawPhone = this.extractPhone(raw);

      // Categoria A: INVALID (sem telefone ou incompleto)
      if (!rawPhone) {
        invalidCount++;
        const issue = {
          row: rowNumber,
          title: this.extractTitle(raw) || `Linha ${rowNumber}`,
          type: 'INVALID' as const,
          reason: 'Nenhum telefone encontrado na linha'
        };
        if (issues.length < this.MAX_ISSUES_RETURNED) issues.push(issue);
        continue;
      }

      const normPhone = WhatsappManager.normalizeBrPhone(rawPhone);
      if (normPhone.length < 10) {
        invalidCount++;
        const issue = {
          row: rowNumber,
          title: this.extractTitle(raw) || `Linha ${rowNumber}`,
          phone: rawPhone,
          type: 'INVALID' as const,
          reason: `Telefone inválido (${rawPhone}): requer DDD + número com no mínimo 10 dígitos`
        };
        if (issues.length < this.MAX_ISSUES_RETURNED) issues.push(issue);
        continue;
      }

      // Categoria B: DUPLICATE (repetido no próprio arquivo)
      if (seenPhonesInFile.has(normPhone)) {
        duplicateCount++;
        const issue = {
          row: rowNumber,
          title: this.extractTitle(raw) || `Linha ${rowNumber}`,
          phone: normPhone,
          type: 'DUPLICATE' as const,
          reason: 'Telefone duplicado já processado em linha anterior deste arquivo'
        };
        if (issues.length < this.MAX_ISSUES_RETURNED) issues.push(issue);
        continue;
      }

      seenPhonesInFile.add(normPhone);

      let title = this.extractTitle(raw);
      if (!title) {
        title = `Contato ${normPhone.slice(-4)}`;
      }
      title = String(title).substring(0, 255);

      const rawWebsite = this.extractWebsite(raw);
      const website = rawWebsite ? String(rawWebsite).substring(0, 500) : null;

      const rawNeighborhood = this.extractNeighborhood(raw);
      const neighborhood = rawNeighborhood ? String(rawNeighborhood).substring(0, 255) : null;

      const hist = historyMap.get(normPhone);
      const hasHistory = !!hist;

      // Categoria C: VALID (apto para importação e disparo)
      validCount++;
      if (hasHistory) {
        alreadyContactedCount++;
      }

      const classified: ClassifiedLead = {
        rowNumber,
        title,
        phone: normPhone,
        website,
        neighborhood,
        hasValidWebsite: !!website,
        status: 'VALID',
        alreadyContacted: hasHistory,
        reason: hasHistory ? `Já contatado anteriormente (${hist?.sendCount}x)` : undefined,
        lastSentAt: hist?.lastSentAt || null,
        lastCampaignName: hist?.lastCampaignName || null,
        sendCount: hist?.sendCount || 0
      };

      classifiedList.push(classified);
    }

    return {
      totalRows: rawLeads.length,
      validCount,
      duplicateCount,
      invalidCount,
      recontactBlockedCount,
      alreadyContactedCount,
      sampleLeads: classifiedList.slice(0, this.MAX_SAMPLE_LEADS),
      issues,
      validLeadsToImport: classifiedList
    };
  }

  /**
   * Importação efetiva na campanha com revalidação garantida
   */
  public static async importToCampaign(params: {
    campaignId: string;
    workspaceId: string;
    fileContent: string;
    originalName?: string;
  }): Promise<{
    imported: number;
    skipped: number;
    total: number;
    duplicateCount: number;
    invalidCount: number;
    recontactBlockedCount: number;
    alreadySentCount: number;
    diagnostic: LeadImportDiagnostic;
  }> {
    const { campaignId, workspaceId, fileContent, originalName = '' } = params;

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId }
    });
    if (!campaign) {
      throw new Error('Campanha não encontrada.');
    }

    const rawLeads = this.parseFileContent(fileContent, originalName);
    if (rawLeads.length === 0) {
      throw new Error('O arquivo enviado está vazio ou não contém nenhum registro legível.');
    }

    if (rawLeads.length > this.MAX_LEADS_LIMIT) {
      throw new Error(
        `O arquivo contém mais de 2.000 registros. O limite máximo permitido por importação é de ${this.MAX_LEADS_LIMIT} leads.`
      );
    }

    // Revalida telefones e duplicados antes de importar.
    const diagnostic = await this.classifyLeads({
      rawLeads,
      workspaceId
    });

    if (diagnostic.validCount === 0) {
      throw new Error(
        `Nenhum lead válido para importação. Total de registros: ${diagnostic.totalRows} (${diagnostic.invalidCount} inválidos, ${diagnostic.duplicateCount} duplicados).`
      );
    }

    let imported = 0;
    let skipped = 0;

    for (const lead of diagnostic.validLeadsToImport) {
      try {
        await prisma.lead.create({
          data: {
            campaignId,
            title: lead.title,
            phone: lead.phone,
            website: lead.website,
            neighborhood: lead.neighborhood
          }
        });
        imported++;
      } catch (err: any) {
        // Unicidade campaignId + phone
        if (err.code === 'P2002') {
          skipped++;
        } else {
          console.error(`Erro ao inserir lead na campanha (${lead.phone}):`, err);
          skipped++;
        }
      }
    }

    return {
      imported,
      skipped,
      total: diagnostic.totalRows,
      duplicateCount: diagnostic.duplicateCount,
      invalidCount: diagnostic.invalidCount,
      recontactBlockedCount: diagnostic.recontactBlockedCount,
      alreadySentCount: diagnostic.alreadyContactedCount,
      diagnostic
    };
  }
}
