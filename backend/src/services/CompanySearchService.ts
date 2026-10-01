import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { CreditWalletService } from './CreditWalletService';
import { WhatsappManager } from './WhatsappManager';
import { ContactPolicyService } from './ContactPolicyService';
import { companySearchQueue } from './queue';

export interface RawPlaceItem {
  title?: string;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  category?: string | null;
  totalScore?: number | null;
  reviewsCount?: number | null;
}

/**
 * Validador estrito de número celular brasileiro.
 * Exige DDI 55 + DDD válido (11 a 99) + nono dígito 9 + primeiro dígito de celular (6, 7, 8 ou 9) + 7 dígitos.
 * Números fixos (8 dígitos ou iniciando com 2, 3, 4 ou 5) retornam false.
 */
export function isValidBrazilianMobilePhone(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return /^55[1-9]{2}9[6-9][0-9]{7}$/.test(digits);
}

/**
 * Sanitiza URL de website de empresa.
 * Remove URLs do Google Maps (para não classificar empresas sem site como "com site").
 */
export function sanitizeCompanyWebsite(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower.includes('google.com/maps') ||
    lower.includes('maps.google.') ||
    lower.includes('goo.gl/maps') ||
    lower.includes('google.com.br/maps') ||
    lower.includes('maps.app.goo.gl')
  ) {
    return null;
  }

  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

// Provedor injetável exclusivamente para testes automatizados unitários
let testPlacesProvider: ((segment: string, location: string, count: number) => Promise<RawPlaceItem[]>) | null = null;

export function setTestPlacesProvider(fn: ((segment: string, location: string, count: number) => Promise<RawPlaceItem[]>) | null) {
  testPlacesProvider = fn;
}

export class CompanySearchService {
  /**
   * Inicia uma busca de empresas com validação prévia de campanha,
   * reserva atômica de créditos e agendamento durável.
   */
  static async initiateSearch(params: {
    userId: string;
    workspaceId: string;
    segment: string;
    location: string;
    requestedCount: number;
    targetCampaignId?: string | undefined;
    idempotencyKey?: string | undefined;
  }) {
    const { userId, workspaceId, segment, location, requestedCount, targetCampaignId, idempotencyKey } = params;

    const cleanSegment = (segment || '').trim();
    const cleanLocation = (location || '').trim();

    if (cleanSegment.length < 2) {
      throw new Error('O segmento ou nicho da busca deve ter ao menos 2 caracteres.');
    }
    if (cleanLocation.length < 2) {
      throw new Error('A localização (cidade/bairro) deve ter ao menos 2 caracteres.');
    }

    const count = Math.min(200, Math.max(5, Math.floor(requestedCount || 20)));

    // 1. Validação de isolamento: se houver campanha alvo, valida ownership ANTES de qualquer cobrança
    if (targetCampaignId) {
      const campaign = await prisma.campaign.findFirst({
        where: { id: targetCampaignId, workspaceId }
      });
      if (!campaign) {
        throw new Error('A campanha de destino informada não existe ou não pertence a este workspace.');
      }
    }

    // 2. Idempotência estrita: se a chave já existe, retorna a busca existente sem criar duplicatas
    const finalIdempotencyKey = idempotencyKey || `search_${workspaceId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (idempotencyKey) {
      const existingSearch = await prisma.companySearch.findUnique({
        where: { idempotencyKey: finalIdempotencyKey },
        include: { results: true }
      });

      if (existingSearch) {
        if (
          existingSearch.workspaceId !== workspaceId ||
          existingSearch.segment !== cleanSegment ||
          existingSearch.location !== cleanLocation ||
          existingSearch.requestedCount !== count
        ) {
          throw new Error('Chave de idempotência já utilizada com parâmetros de busca diferentes.');
        }

        return existingSearch;
      }
    }

    // 3. Reserva atômica dos créditos correspondentes
    let reservation: any;
    try {
      reservation = await CreditWalletService.reserveCredits({
        userId,
        amount: count,
        idempotencyKey: finalIdempotencyKey,
        sourceType: 'COMPANY_SEARCH',
        description: `Busca de empresas: ${cleanSegment} em ${cleanLocation} (até ${count} contatos)`
      });
    } catch (err) {
      throw err;
    }

    // 4. Persistência do registro de busca e enfileiramento com tratamento contra falhas intermediárias
    try {
      const searchRecord = await prisma.companySearch.create({
        data: {
          workspaceId,
          userId,
          idempotencyKey: finalIdempotencyKey,
          targetCampaignId: targetCampaignId || null,
          reservationId: reservation.reservationId,
          query: `${cleanSegment} em ${cleanLocation}`,
          segment: cleanSegment,
          location: cleanLocation,
          requestedCount: count,
          creditsReserved: reservation.reservedAmount,
          status: 'PENDING'
        }
      });

      const isTest = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));
      if (!isTest) {
        await companySearchQueue.add(
          'execute-company-search',
          { searchId: searchRecord.id },
          {
            jobId: `search_${searchRecord.id}`,
            attempts: 2,
            backoff: { type: 'exponential', delay: 10000 },
            removeOnComplete: true,
            removeOnFail: false
          }
        );
      } else {
        // Em testes automatizados, processa imediatamente de forma síncrona
        await this.processSearchJob(searchRecord.id, { isLastAttempt: true });
        return await prisma.companySearch.findUnique({
          where: { id: searchRecord.id },
          include: { results: true }
        });
      }

      return searchRecord;
    } catch (error) {
      // Se falhar a gravação da busca ou o enfileiramento, libera a reserva imediatamente para não abandonar saldo
      if (reservation?.reservationId) {
        await CreditWalletService.releaseReservation({
          reservationId: reservation.reservationId,
          reason: 'Falha no registro ou enfileiramento da busca de empresas'
        }).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Processador de execução da busca (executado pelo Worker da fila ou pelo teste síncrono).
   * Garante consistência transacional: resultados só são persistidos junto com a liquidação contábil NA MESMA TRANSAÇÃO.
   * Tolerante a retries do BullMQ: reconcilia o apifyRunId e só libera reserva na tentativa final.
   */
  static async processSearchJob(searchId: string, options?: { isLastAttempt?: boolean }) {
    const searchRecord = await prisma.companySearch.findUnique({
      where: { id: searchId }
    });

    if (!searchRecord) {
      throw new Error(`Busca não encontrada para processamento: ${searchId}`);
    }

    if (searchRecord.status === 'COMPLETED' || searchRecord.status === 'CANCELED') {
      return searchRecord;
    }

    // Marca como em processamento
    await prisma.companySearch.update({
      where: { id: searchId },
      data: { status: 'PROCESSING' }
    });

    const { segment, location, requestedCount, workspaceId, targetCampaignId, userId, reservationId, apifyRunId } = searchRecord;
    let rawPlaces: RawPlaceItem[] = [];

    try {
      // 1. Extração no provedor oficial Apify com recuperação e persistência de runId
      rawPlaces = await this.fetchPlacesFromProvider({
        searchId,
        segment: segment || '',
        location: location || '',
        requestedCount,
        existingRunId: apifyRunId
      });

      // 2. Classificação rigorosa, sanitização e deduplicação no workspace (inclui resultados já entregues)
      const classifiedResults = await this.classifyAndDeduplicate(rawPlaces, workspaceId, targetCampaignId || undefined);

      const usableCount = classifiedResults.filter(r => r.isUsable).length;
      const discardedCount = classifiedResults.length - usableCount;

      // O consumo de créditos nunca pode exceder o valor reservado
      const creditsToConsume = Math.min(usableCount, searchRecord.creditsReserved);

      // 3. Transação atômica ÚNICA: salva resultados, vincula leads na campanha, liquida a carteira E conclui a busca
      await prisma.$transaction(async (tx) => {
        // Persiste os resultados encontrados
        const createdResults = await Promise.all(
          classifiedResults.map(item =>
            tx.companySearchResult.create({
              data: {
                searchId: searchRecord.id,
                workspaceId,
                name: item.name,
                phone: item.phone,
                website: item.website || null,
                address: item.address || null,
                neighborhood: item.neighborhood || null,
                city: item.city || null,
                category: item.category || segment,
                rating: item.rating || null,
                reviewsCount: item.reviewsCount || null,
                isUsable: item.isUsable,
                discardReason: item.discardReason || null
              }
            })
          )
        );

        // Se houver campanha alvo, injeta diretamente os leads aproveitáveis
        if (targetCampaignId) {
          const usableItems = createdResults.filter(i => i.isUsable && i.phone);
          for (const item of usableItems) {
            const lead = await tx.lead.upsert({
              where: {
                campaignId_phone: {
                  campaignId: targetCampaignId,
                  phone: item.phone!
                }
              },
              create: {
                campaignId: targetCampaignId,
                title: item.name,
                phone: item.phone!,
                website: item.website || null,
                neighborhood: item.neighborhood || null,
                status: 'PENDING'
              },
              update: {}
            });

            if (lead) {
              await tx.companySearchResult.update({
                where: { id: item.id },
                data: { importedLeadId: lead.id }
              });
            }
          }
        }

        // 4. Liquidação da reserva de créditos NA MESMA TRANSAÇÃO (tx)
        if (reservationId) {
          await CreditWalletService.settleReservation({
            reservationId,
            actualConsumedAmount: creditsToConsume,
            description: `Busca finalizada: ${usableCount} empresas aproveitáveis (${creditsToConsume} créditos debitados)`
          }, tx);
        }

        // 5. Atualização final do registro de busca
        await tx.companySearch.update({
          where: { id: searchRecord.id },
          data: {
            status: 'COMPLETED',
            foundCount: rawPlaces.length,
            usableCount,
            discardedCount,
            creditsConsumed: creditsToConsume
          }
        });
      }, { timeout: 30000 });

      return await prisma.companySearch.findUnique({
        where: { id: searchRecord.id },
        include: { results: true }
      });
    } catch (error: any) {
      console.error('[COMPANY SEARCH EXECUTION ERROR]', error);

      const isLastAttempt = options?.isLastAttempt ?? true;

      // Apenas na última tentativa do BullMQ libera a reserva e marca como FAILED
      if (isLastAttempt) {
        if (reservationId) {
          await CreditWalletService.releaseReservation({
            reservationId,
            reason: `Falha na extração de empresas: ${error?.message || 'Erro no provedor'}`
          }).catch(err => console.error('[RELEASE RESERVATION ERROR]', err));
        }

        await prisma.companySearch.update({
          where: { id: searchRecord.id },
          data: {
            status: 'FAILED',
            errorMessage: error?.message || 'Falha ao processar busca de empresas.'
          }
        }).catch(() => {});
      } else {
        console.warn(`[COMPANY SEARCH RETRY] Falha transitória na tentativa do job. Mantendo reserva PENDING e apifyRunId salvo para o próximo retry do BullMQ.`);
      }

      throw error;
    }
  }

  /**
   * Adiciona empresas selecionadas de uma busca a uma campanha existente.
   * Revalida elegibilidade, opt-out, histórico de disparos e deduplicação no workspace.
   */
  static async addSelectedToCampaign(params: {
    searchId: string;
    companyResultIds: string[];
    campaignId: string;
    workspaceId: string;
  }) {
    const { searchId, companyResultIds, campaignId, workspaceId } = params;

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId }
    });
    if (!campaign) {
      throw new Error('Campanha de destino não encontrada ou não pertence ao seu workspace.');
    }

    const items = await prisma.companySearchResult.findMany({
      where: {
        id: { in: companyResultIds },
        searchId,
        workspaceId,
        isUsable: true
      }
    });

    let addedCount = 0;
    let duplicateCount = 0;

    for (const item of items) {
      if (!item.phone || !isValidBrazilianMobilePhone(item.phone)) continue;

      // Revalida blacklist LGPD
      const isBlacklisted = await ContactPolicyService.isBlacklisted(item.phone, workspaceId);
      if (isBlacklisted) continue;

      // Revalida histórico de disparos do workspace (Item 9)
      const alreadyDispatched = await prisma.dispatchHistory.findUnique({
        where: {
          workspaceId_phone: {
            workspaceId,
            phone: item.phone
          }
        }
      });
      if (alreadyDispatched) continue;

      try {
        const lead = await prisma.lead.create({
          data: {
            campaignId,
            title: item.name,
            phone: item.phone,
            website: item.website || null,
            neighborhood: item.neighborhood || null,
            status: 'PENDING'
          }
        });

        await prisma.companySearchResult.update({
          where: { id: item.id },
          data: { importedLeadId: lead.id }
        }).catch(() => {});

        addedCount++;
      } catch (err: any) {
        if (err.code === 'P2002') {
          duplicateCount++;
        } else {
          console.warn('[ADD LEAD WARNING]', err.message);
        }
      }
    }

    return {
      addedCount,
      duplicateCount,
      totalRequested: companyResultIds.length
    };
  }

  /**
   * Classifica e valida contatos com rigor:
   * 1. Exige celular brasileiro válido (DDD + 9 dígitos com nono dígito 9 e inicial [6-9]).
   * 2. Remove URLs do Google Maps como website.
   * 3. Deduplica contra o lote da busca.
   * 4. Deduplica contra a Blacklist (LGPD).
   * 5. Deduplica contra o histórico completo de envios do workspace (DispatchHistory).
   * 6. Deduplica contra leads existentes em qualquer campanha do workspace.
   * 7. Deduplica contra resultados já entregues em buscas concluídas deste workspace (Item 9).
   */
  private static async classifyAndDeduplicate(
    rawPlaces: RawPlaceItem[],
    workspaceId: string,
    targetCampaignId?: string
  ) {
    const seenPhonesInBatch = new Set<string>();
    const classified: Array<{
      name: string;
      phone: string | null;
      website?: string | null;
      address?: string | null;
      neighborhood?: string | null;
      city?: string | null;
      category?: string | null;
      rating?: number | null;
      reviewsCount?: number | null;
      isUsable: boolean;
      discardReason?: string | null;
    }> = [];

    for (const place of rawPlaces) {
      const name = (place.title || '').trim() || 'Empresa sem nome';
      const rawPhone = (place.phone || '').trim();
      const sanitizedWebsite = sanitizeCompanyWebsite(place.website);

      if (!rawPhone) {
        classified.push({
          name,
          phone: null,
          website: sanitizedWebsite,
          address: place.address || null,
          neighborhood: place.neighborhood || null,
          city: place.city || null,
          category: place.category || null,
          rating: place.totalScore || null,
          reviewsCount: place.reviewsCount || null,
          isUsable: false,
          discardReason: 'NO_PHONE'
        });
        continue;
      }

      const normalizedPhone = WhatsappManager.normalizeBrPhone(rawPhone);

      // Validação estrita de celular: descarta fixos e números mal formatados
      if (!isValidBrazilianMobilePhone(normalizedPhone)) {
        classified.push({
          name,
          phone: rawPhone,
          website: sanitizedWebsite,
          address: place.address || null,
          neighborhood: place.neighborhood || null,
          city: place.city || null,
          category: place.category || null,
          rating: place.totalScore || null,
          reviewsCount: place.reviewsCount || null,
          isUsable: false,
          discardReason: 'INVALID_PHONE'
        });
        continue;
      }

      // 1. Deduplicação no lote atual
      if (seenPhonesInBatch.has(normalizedPhone)) {
        classified.push({
          name,
          phone: normalizedPhone,
          website: sanitizedWebsite,
          address: place.address || null,
          neighborhood: place.neighborhood || null,
          city: place.city || null,
          category: place.category || null,
          rating: place.totalScore || null,
          reviewsCount: place.reviewsCount || null,
          isUsable: false,
          discardReason: 'DUPLICATE'
        });
        continue;
      }
      seenPhonesInBatch.add(normalizedPhone);

      // 2. Consulta à Blacklist (Opt-out e bloqueios LGPD)
      const isBlacklisted = await ContactPolicyService.isBlacklisted(normalizedPhone, workspaceId);
      if (isBlacklisted) {
        classified.push({
          name,
          phone: normalizedPhone,
          website: sanitizedWebsite,
          address: place.address || null,
          neighborhood: place.neighborhood || null,
          city: place.city || null,
          category: place.category || null,
          rating: place.totalScore || null,
          reviewsCount: place.reviewsCount || null,
          isUsable: false,
          discardReason: 'BLACKLISTED'
        });
        continue;
      }

      // 3. Deduplicação contra contatos já enviados no histórico permanente do workspace
      const alreadyInHistory = await prisma.dispatchHistory.findUnique({
        where: {
          workspaceId_phone: {
            workspaceId,
            phone: normalizedPhone
          }
        }
      });
      if (alreadyInHistory) {
        classified.push({
          name,
          phone: normalizedPhone,
          website: sanitizedWebsite,
          address: place.address || null,
          neighborhood: place.neighborhood || null,
          city: place.city || null,
          category: place.category || null,
          rating: place.totalScore || null,
          reviewsCount: place.reviewsCount || null,
          isUsable: false,
          discardReason: 'ALREADY_IN_WORKSPACE'
        });
        continue;
      }

      // 4. Deduplicação contra leads existentes em qualquer campanha do workspace
      const alreadyInWorkspace = await prisma.lead.findFirst({
        where: {
          campaign: { workspaceId },
          phone: normalizedPhone
        }
      });
      if (alreadyInWorkspace) {
        classified.push({
          name,
          phone: normalizedPhone,
          website: sanitizedWebsite,
          address: place.address || null,
          neighborhood: place.neighborhood || null,
          city: place.city || null,
          category: place.category || null,
          rating: place.totalScore || null,
          reviewsCount: place.reviewsCount || null,
          isUsable: false,
          discardReason: 'ALREADY_IN_WORKSPACE'
        });
        continue;
      }

      // 5. Deduplicação contra resultados já entregues em buscas concluídas do workspace (Item 9)
      const alreadyDelivered = await prisma.companySearchResult.findFirst({
        where: {
          workspaceId,
          phone: normalizedPhone,
          isUsable: true,
          search: {
            status: 'COMPLETED'
          }
        }
      });
      if (alreadyDelivered) {
        classified.push({
          name,
          phone: normalizedPhone,
          website: sanitizedWebsite,
          address: place.address || null,
          neighborhood: place.neighborhood || null,
          city: place.city || null,
          category: place.category || null,
          rating: place.totalScore || null,
          reviewsCount: place.reviewsCount || null,
          isUsable: false,
          discardReason: 'ALREADY_DELIVERED'
        });
        continue;
      }

      // 6. Empresa qualificada e aproveitável!
      classified.push({
        name,
        phone: normalizedPhone,
        website: sanitizedWebsite,
        address: place.address || null,
        neighborhood: place.neighborhood || null,
        city: place.city || null,
        category: place.category || null,
        rating: place.totalScore || null,
        reviewsCount: place.reviewsCount || null,
        isUsable: true,
        discardReason: null
      });
    }

    return classified;
  }

  /**
   * Consulta a API oficial da Apify com persistência do runId, timeouts explícitos de 45s
   * e capacidade de reconectar ao run existente em caso de retry do BullMQ.
   * NUNCA substitui falhas por contatos inventados ou fictícios.
   */
  private static async fetchPlacesFromProvider(params: {
    searchId: string;
    segment: string;
    location: string;
    requestedCount: number;
    existingRunId?: string | null;
  }): Promise<RawPlaceItem[]> {
    const { searchId, segment, location, requestedCount, existingRunId } = params;

    // Se houver um provider mock configurado para testes unitários isolados
    if (testPlacesProvider) {
      return await testPlacesProvider(segment, location, requestedCount);
    }

    const apifyToken = ENV.APIFY_API_TOKEN;

    if (!apifyToken || apifyToken.trim() === '') {
      throw new Error('Integração com Apify não configurada no servidor (APIFY_API_TOKEN ausente).');
    }

    let runId = existingRunId;
    let defaultDatasetId: string | null = null;

    // 1. Se já existe runId gravado (retry do BullMQ), reconecta ao run existente em vez de disparar outro pago
    if (runId) {
      console.log(`[APIFY RECONNECT] Reconectando ao run existente ${runId} para a busca ${searchId}...`);
      try {
        const runRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`, {
          signal: AbortSignal.timeout(45000)
        });
        if (runRes.ok) {
          const runJson: any = await runRes.json();
          defaultDatasetId = runJson.data?.defaultDatasetId || null;
        }
      } catch (err: any) {
        console.warn(`[APIFY RECONNECT WARNING] Falha ao checar run existente ${runId}:`, err?.message);
      }
    }

    // 2. Se não existe runId ou se não conseguiu reconectar, inicia nova execução externa
    if (!runId) {
      console.log(`[APIFY SEARCH] Iniciando consulta para "${segment}" em "${location}" (máx ${requestedCount})...`);

      const startRes = await fetch(
        `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${apifyToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchStringsArray: [`${segment} em ${location}`],
            maxCrawledPlacesPerSearch: requestedCount,
            language: 'pt-BR',
            countryCode: 'BR',
            skipClosedPlaces: true
          }),
          signal: AbortSignal.timeout(45000)
        }
      );

      if (!startRes.ok) {
        const errText = await startRes.text().catch(() => '');
        throw new Error(`Falha na API da Apify ao iniciar run (HTTP ${startRes.status}): ${errText.slice(0, 200)}`);
      }

      const startJson: any = await startRes.json();
      runId = startJson.data?.id;
      defaultDatasetId = startJson.data?.defaultDatasetId;

      if (!runId) {
        throw new Error('Identificador da execução externa não foi retornado pela Apify.');
      }

      // Persiste imediatamente o apifyRunId no banco para garantir rastreabilidade e idempotência
      await prisma.companySearch.update({
        where: { id: searchId },
        data: {
          apifyRunId: runId,
          apifyActorId: 'compass~crawler-google-places'
        }
      }).catch(err => console.warn('[PERSIST APIFY RUN ID WARNING]', err?.message));
    }

    // 3. Aguarda a conclusão da execução com polling seguro e timeout explícito
    const startTime = Date.now();
    const maxWaitMs = 120000; // Máximo 2 minutos
    let status = 'RUNNING';

    while (Date.now() - startTime < maxWaitMs) {
      const pollRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`, {
        signal: AbortSignal.timeout(45000)
      });

      if (!pollRes.ok) {
        const errText = await pollRes.text().catch(() => '');
        throw new Error(`Falha ao verificar status do run na Apify (HTTP ${pollRes.status}): ${errText.slice(0, 200)}`);
      }

      const pollJson: any = await pollRes.json();
      status = pollJson.data?.status || 'UNKNOWN';
      defaultDatasetId = pollJson.data?.defaultDatasetId || defaultDatasetId;

      if (status === 'SUCCEEDED') {
        break;
      }

      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
        throw new Error(`Execução externa na Apify terminou sem sucesso (status: ${status}).`);
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    if (status !== 'SUCCEEDED') {
      throw new Error(`Tempo limite excedido aguardando conclusão da extração na Apify (status: ${status}).`);
    }

    if (!defaultDatasetId) {
      throw new Error('Dataset ID não encontrado na execução da Apify.');
    }

    // 4. Obtém os dados extraídos do dataset
    const datasetRes = await fetch(
      `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${apifyToken}&clean=true`,
      { signal: AbortSignal.timeout(45000) }
    );

    if (!datasetRes.ok) {
      const errText = await datasetRes.text().catch(() => '');
      throw new Error(`Falha ao obter itens do dataset Apify (HTTP ${datasetRes.status}): ${errText.slice(0, 200)}`);
    }

    const items: any = await datasetRes.json();

    if (!Array.isArray(items)) {
      throw new Error('Resposta inválida do provedor Apify: esperado um array de resultados.');
    }

    // Uma resposta vazia é legítima: zero empresas encontradas, zero consumo
    if (items.length === 0) {
      return [];
    }

    return items.map(item => ({
      title: item.title || item.name || '',
      phone: item.phoneUnformatted || item.phone || null,
      website: item.website || null, // Nunca usar item.url do Google Maps
      address: item.address || item.street || null,
      neighborhood: item.neighborhood || null,
      city: item.city || location,
      category: item.categoryName || segment,
      totalScore: item.totalScore || item.rating || null,
      reviewsCount: item.reviewsCount || null
    }));
  }
}
