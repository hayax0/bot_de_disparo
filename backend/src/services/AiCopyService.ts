import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { getUserCapabilities } from '../config/plans';
import { CreditWalletService } from './CreditWalletService';
import { formatarNomeEmpresa, temWebsiteValido } from './ProposalEngine';
import crypto, { randomUUID } from 'node:crypto';
import { aiGenerationQueue } from './queue';

export type AiToneStyle = 'CONSULTATIVE' | 'FRIENDLY' | 'DIRECT' | 'SPECIAL_OFFER' | 'URGENT_OFFER';

export interface GenerateCopyInput {
  leadTitle: string;
  phone: string;
  website?: string | null;
  neighborhood?: string | null;
  senderName: string;
  senderCompany: string;
  offerDescription: string;
  toneStyle: AiToneStyle;
}

export interface BatchGenerationParams {
  userId: string;
  workspaceId: string;
  campaignId: string;
  offerDescription: string;
  toneStyle?: AiToneStyle | undefined;
  leadIds?: string[] | undefined;
  idempotencyKey?: string | undefined;
  processSyncForTest?: boolean | undefined;
  customQueue?: any | undefined;
}

export interface SingleLeadRegenParams {
  userId: string;
  workspaceId: string;
  campaignId: string;
  leadId: string;
  offerDescription?: string | undefined;
  toneStyle?: AiToneStyle | undefined;
  idempotencyKey?: string | undefined;
}

// Provedor injetável exclusivamente para testes unitários automatizados
let testAiProvider: ((input: GenerateCopyInput) => Promise<string>) | null = null;

export function setTestAiProvider(fn: ((input: GenerateCopyInput) => Promise<string>) | null) {
  testAiProvider = fn;
}

// Hook de teste injetável para sincronização determinística de concorrência com barreiras
let testBeforeReserveHook: ((params: SingleLeadRegenParams) => Promise<void>) | null = null;

export function setTestBeforeReserveHook(fn: ((params: SingleLeadRegenParams) => Promise<void>) | null) {
  testBeforeReserveHook = fn;
}

export function computePayloadHash(payload: {
  offerDescription: string;
  toneStyle: string;
  leadIds?: string[] | undefined;
}): string {
  const sortedLeads = payload.leadIds ? [...payload.leadIds].sort() : [];
  const canonical = JSON.stringify({
    offer: payload.offerDescription.trim(),
    tone: payload.toneStyle,
    leads: sortedLeads,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export class AiCopyService {
  /**
   * Verifica se o provedor de IA está devidamente configurado e disponível.
   */
  public static isAvailable(): boolean {
    if (process.env.NODE_ENV === 'test' && testAiProvider) {
      return true;
    }
    const apiKey = (ENV.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
    return apiKey.length > 0;
  }

  /**
   * Constrói os prompts de sistema e usuário para o modelo Gemini.
   */
  public static buildPrompts(input: GenerateCopyInput): { systemPrompt: string; userPrompt: string } {
    const nomeEmpresa = formatarNomeEmpresa(input.leadTitle);
    const possuiSite = temWebsiteValido(input.website);
    const bairro = input.neighborhood ? input.neighborhood.trim() : '';

    const toneDescriptions: Record<AiToneStyle, string> = {
      CONSULTATIVE: 'Tom consultivo, profissional e respeitoso. Foque em agregar valor e diagnóstico.',
      FRIENDLY: 'Tom amigável, acolhedor e descontraído, como quem conhece a empresa e quer bater um papo.',
      DIRECT: 'Tom direto ao ponto, enxuto e ágil, com no máximo 2 a 3 frases respeitando o tempo do empresário.',
      SPECIAL_OFFER: 'Tom de oportunidade única, destacando condição especial ou exclusividade para a região.',
      URGENT_OFFER: 'Tom de oportunidade única, destacando condição especial ou exclusividade para a região.',
    };

    const systemPrompt = `Você é um copywriter de elite especializado em prospecção B2B humanizada e de alta conversão via WhatsApp no Brasil.
Seu objetivo é redigir UMA mensagem de primeiro contato altamente personalizada para o WhatsApp do responsável pela empresa.

DIRETRIZES OBRIGATÓRIAS:
1. Escreva em português do Brasil coloquial e natural. NUNCA use clichês robóticos ("Espero que este e-mail o encontre bem", "Venho por meio desta", "Prezado senhor").
2. Parágrafos curtos (1 a 3 linhas por parágrafo). Use espaçamento limpo entre blocos para leitura rápida na tela do celular.
3. Formatação WhatsApp: use *negrito* apenas em 1 ou 2 palavras de alto impacto. Não use itálico, sublinhado nem títulos Markdown com #.
4. NUNCA invente links fictícios, valores ou promessas não citados na oferta.
5. Se a empresa NÃO tem site e a oferta envolve serviços web/marketing, comente de forma construtiva como isso pode estar custando clientes para concorrentes no bairro.
6. Se a empresa JÁ tem site, reconheça a presença dela e foque em otimização, conversão ou novos resultados.
7. Finalize sempre com uma pergunta aberta e leve de baixo atrito (Call to Action / CTA suave) que estimule uma resposta rápida ("Faz sentido para vocês?", "Como está a demanda por aí?").
8. Retorne EXCLUSIVAMENTE o texto final da mensagem, sem aspas, introduções ou explicações.`;

    const userPrompt = `DADOS DO PROSPECT:
- Nome da Empresa: ${nomeEmpresa}
- Presença de Site: ${possuiSite ? `Possui site próprio (${input.website})` : 'Não possui website próprio'}
- Localização/Bairro: ${bairro || 'Local'}
- Remetente: ${input.senderName || 'Consultor'} da empresa ${input.senderCompany || 'Nossa Empresa'}

O QUE OFERECEMOS:
${input.offerDescription}

ESTILO DE ABORDAGEM:
${toneDescriptions[input.toneStyle] || toneDescriptions.CONSULTATIVE}

Gere a mensagem de abordagem personalizada pronta para envio:`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Executa a chamada à API do Google Gemini ou mock injetado em testes.
   * Não produz sucesso fictício sem chave configurada nem debita créditos.
   */
  public static async callGeminiApi(input: GenerateCopyInput): Promise<string> {
    if (process.env.NODE_ENV === 'test' && testAiProvider) {
      return await testAiProvider(input);
    }

    const apiKey = (ENV.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();

    if (!apiKey) {
      throw new Error('Chave de API do Gemini (GEMINI_API_KEY) não configurada no servidor. O assistente de IA está indisponível.');
    }

    const model = (ENV.GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite').trim();
    const { systemPrompt, userPrompt } = this.buildPrompts(input);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: userPrompt }],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 350,
            },
          }),
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        let errorText = await response.text().catch(() => '');
        if (apiKey && errorText.includes(apiKey)) {
          errorText = errorText.split(apiKey).join('[REDACTED_API_KEY]');
        }
        console.error('[GEMINI API ERROR]', response.status, errorText.slice(0, 150));
        if (response.status === 404) {
          throw new Error(`Modelo "${model}" não disponível no Gemini. Configure GEMINI_MODEL no .env com um modelo ativo da sua conta (ex: gemini-3.1-flash-lite ou gemini-3.5-flash).`);
        }
        throw new Error(`Falha na API do Gemini (HTTP ${response.status})`);
      }

      const data: any = await response.json();
      let content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!content) {
        throw new Error('O Gemini retornou uma resposta sem conteúdo.');
      }

      // Remove eventuais blocos de markdown ``` se o modelo envelopar a resposta
      content = content.replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```$/i, '').trim();

      return content;
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.message?.includes('timeout')) {
        throw new Error('Tempo limite excedido na comunicação com o assistente Gemini.');
      }
      throw err;
    }
  }

  /**
   * Inicia a operação assíncrona de geração de IA em lote com idempotência estrita.
   * Cria a reserva de créditos e enfileira o job BullMQ.
   */
  public static async initiateBatchGeneration(params: BatchGenerationParams) {
    const { userId, workspaceId, campaignId, leadIds } = params;
    const offerDescription = (params.offerDescription || '').trim();
    const toneStyle: AiToneStyle = params.toneStyle || 'CONSULTATIVE';

    if (offerDescription.length < 5 || offerDescription.length > 1000) {
      throw new Error('Informe o que você oferece (entre 5 e 1000 caracteres).');
    }

    if (!this.isAvailable()) {
      throw new Error('O assistente de IA está indisponível no momento. Configure a GEMINI_API_KEY no servidor.');
    }

    // 1. Validação de isolamento do Workspace e Campanha
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId, workspace: { userId } },
      include: {
        workspace: {
          include: { user: { select: { id: true, name: true, role: true, planId: true } } },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada ou não pertence ao seu workspace.');
    }

    // 2. Validação de permissões de plano
    const user = campaign.workspace.user;
    const caps = getUserCapabilities(user);
    if (!caps.canUseAi) {
      const err = new Error('O seu plano atual não possui acesso ao Assistente de IA.');
      (err as any).code = 'AI_NOT_ALLOWED';
      throw err;
    }

    const payloadHash = computePayloadHash({ offerDescription, toneStyle, leadIds });
    const idempotencyKey = params.idempotencyKey?.trim() || `ai_batch_${campaignId}_${randomUUID()}`;

    const targetQueue = params.customQueue || aiGenerationQueue;

    // 3. Verificação de idempotência durável no banco
    const existingOp = await prisma.aiOperation.findUnique({
      where: { idempotencyKey },
    });

    if (existingOp) {
      // Rejeita reutilização da chave com usuário, campanha ou payload divergente
      if (
        existingOp.userId !== userId ||
        existingOp.campaignId !== campaignId ||
        (existingOp.payloadHash && existingOp.payloadHash !== payloadHash)
      ) {
        const err = new Error('Chave de idempotência já utilizada com outros parâmetros ou usuário.');
        (err as any).statusCode = 409;
        throw err;
      }

      // Se a operação já foi finalizada, devolve o resultado sem gerar nem cobrar novamente
      if (existingOp.status === 'COMPLETED' || existingOp.status === 'PARTIAL') {
        return {
          operationId: existingOp.id,
          status: existingOp.status,
          totalLeads: existingOp.totalLeads,
          completedLeads: existingOp.completedLeads,
          failedLeads: existingOp.failedLeads,
          creditsConsumed: existingOp.creditsConsumed,
          totalRequested: existingOp.totalLeads,
          generatedCount: existingOp.completedLeads,
          failedCount: existingOp.failedLeads,
          isExisting: true,
        };
      }

      // Se a operação estiver PENDING ou PROCESSING:
      // Reconcilia conforme o estado real do job no BullMQ (ou executa síncrono em teste se solicitado)
      const isSyncReplay = params.processSyncForTest !== undefined ? Boolean(params.processSyncForTest) : (params.customQueue ? false : process.env.NODE_ENV === 'test');
      if (!isSyncReplay) {
        await this.reconcileAiBatchJob(existingOp.id, targetQueue);
      } else if (params.processSyncForTest) {
        await this.processOperationJob(existingOp.id);
        const finishedOp = await prisma.aiOperation.findUnique({ where: { id: existingOp.id } });
        return {
          operationId: existingOp.id,
          status: finishedOp?.status || 'COMPLETED',
          totalLeads: finishedOp?.totalLeads || existingOp.totalLeads,
          completedLeads: finishedOp?.completedLeads || 0,
          failedLeads: finishedOp?.failedLeads || 0,
          creditsConsumed: finishedOp?.creditsConsumed || 0,
          totalRequested: finishedOp?.totalLeads || existingOp.totalLeads,
          generatedCount: finishedOp?.completedLeads || 0,
          failedCount: finishedOp?.failedLeads || 0,
          isExisting: true,
        };
      }

      return {
        operationId: existingOp.id,
        status: existingOp.status,
        totalLeads: existingOp.totalLeads,
        completedLeads: existingOp.completedLeads,
        failedLeads: existingOp.failedLeads,
        creditsConsumed: existingOp.creditsConsumed,
        totalRequested: existingOp.totalLeads,
        generatedCount: existingOp.completedLeads,
        failedCount: existingOp.failedLeads,
        isExisting: true,
      };
    }

    // 4. Filtragem de leads elegíveis (status PENDING e sendStartedAt null)
    const whereClause: any = {
      campaignId,
      status: 'PENDING',
      sendStartedAt: null,
    };
    if (leadIds && leadIds.length > 0) {
      whereClause.id = { in: leadIds };
    }

    const eligibleLeads = await prisma.lead.findMany({
      where: whereClause,
      select: { id: true },
      take: 200,
    });

    if (eligibleLeads.length === 0) {
      throw new Error('Nenhum lead pendente encontrado para geração de mensagem.');
    }

    const totalLeads = eligibleLeads.length;

    // 5. Reserva prévia de créditos (1 crédito por lead)
    const reservation = await CreditWalletService.reserveCredits({
      userId,
      amount: totalLeads,
      sourceType: 'AI_ASSISTANT',
      sourceId: campaignId,
      idempotencyKey,
      description: `Geração de abordagens IA: ${totalLeads} leads na campanha "${campaign.name}"`,
    });

    // 6. Persiste a operação no banco com status PENDING e os itens vinculados (AiOperationLead)
    let op;
    try {
      op = await prisma.$transaction(async (tx) => {
        const createdOp = await tx.aiOperation.create({
          data: {
            workspaceId,
            userId,
            campaignId,
            type: 'BATCH',
            idempotencyKey,
            payloadHash,
            offerDescription,
            toneStyle,
            status: 'PENDING',
            reservationId: reservation.reservationId || null,
            totalLeads,
            creditsReserved: totalLeads,
            creditsConsumed: 0,
            resultSummary: JSON.stringify({ requestedLeadIds: eligibleLeads.map((l) => l.id) }),
          },
        });

        // Persiste duravelmente a seleção original de leads em AiOperationLead
        await tx.aiOperationLead.createMany({
          data: eligibleLeads.map((l) => ({
            operationId: createdOp.id,
            leadId: l.id,
            status: 'PENDING',
            isSettled: false,
          })),
        });

        return createdOp;
      });
    } catch (createErr: any) {
      if (createErr?.code === 'P2002' || createErr?.message?.includes('Unique constraint failed')) {
        const concurrentlyCreated = await prisma.aiOperation.findUnique({
          where: { idempotencyKey },
        });
        if (concurrentlyCreated) {
          if (reservation.reservationId && reservation.reservationId !== concurrentlyCreated.reservationId) {
            await CreditWalletService.releaseReservation({
              reservationId: reservation.reservationId,
              reason: 'Operação concorrente com a mesma chave detectada',
            }).catch(() => {});
          }

          if (params.processSyncForTest) {
            const finished = await this.waitForBatchCompletion(concurrentlyCreated.id);
            return {
              operationId: concurrentlyCreated.id,
              status: finished?.status || 'COMPLETED',
              totalLeads: concurrentlyCreated.totalLeads,
              completedLeads: finished?.completedLeads || 0,
              failedLeads: finished?.failedLeads || 0,
              creditsConsumed: finished?.creditsConsumed || 0,
              totalRequested: concurrentlyCreated.totalLeads,
              generatedCount: finished?.completedLeads || 0,
              failedCount: finished?.failedLeads || 0,
              isExisting: true,
            };
          }

          return {
            operationId: concurrentlyCreated.id,
            status: concurrentlyCreated.status,
            totalLeads: concurrentlyCreated.totalLeads,
            completedLeads: concurrentlyCreated.completedLeads,
            failedLeads: concurrentlyCreated.failedLeads,
            creditsConsumed: concurrentlyCreated.creditsConsumed,
            totalRequested: concurrentlyCreated.totalLeads,
            generatedCount: concurrentlyCreated.completedLeads,
            failedCount: concurrentlyCreated.failedLeads,
            isExisting: true,
          };
        }
      }
      throw createErr;
    }

    // 7. Enfileira o processamento em segundo plano no BullMQ com jobId determinístico
    const isSync = params.processSyncForTest !== undefined ? Boolean(params.processSyncForTest) : (params.customQueue ? false : process.env.NODE_ENV === 'test');
    if (!isSync) {
      try {
        await targetQueue.add(
          'process_ai_batch',
          { operationId: op.id },
          { jobId: `ai_op_${op.id}`, removeOnComplete: 100, removeOnFail: 100 }
        );
      } catch (queueErr: any) {
        console.warn(`[AI BATCH QUEUE ADD FAILED] Operação ${op.id} salva como PENDING, será recuperada:`, queueErr?.message);
      }
    } else {
      await this.processOperationJob(op.id);
      const finishedOp = await prisma.aiOperation.findUnique({ where: { id: op.id } });
      const completed = finishedOp?.completedLeads || 0;
      const failed = finishedOp?.failedLeads || 0;
      return {
        operationId: op.id,
        status: finishedOp?.status || 'COMPLETED',
        totalLeads,
        completedLeads: completed,
        failedLeads: failed,
        creditsConsumed: finishedOp?.creditsConsumed || 0,
        totalRequested: totalLeads,
        generatedCount: completed,
        failedCount: failed,
      };
    }

    return {
      operationId: op.id,
      status: 'PENDING',
      totalLeads,
      completedLeads: 0,
      failedLeads: 0,
      creditsConsumed: 0,
      totalRequested: totalLeads,
      generatedCount: 0,
      failedCount: 0,
    };
  }

  /**
   * Processamento durável do job de IA pelo worker BullMQ.
   * Executa chamadas ao Gemini fora da transação, persiste progresso por lead em AiOperationLead,
   * e garante que aplicação no lead e liquidação financeira sejam 100% atômicas.
   */
  public static async processOperationJob(operationId: string) {
    const op = await prisma.aiOperation.findUnique({
      where: { id: operationId },
      include: {
        campaign: {
          include: {
            workspace: {
              include: { user: { select: { id: true, name: true, role: true, planId: true } } },
            },
          },
        },
      },
    });

    if (!op || op.status === 'COMPLETED') {
      return;
    }

    await prisma.aiOperation.update({
      where: { id: op.id },
      data: { status: 'PROCESSING' },
    });

    // 1. Carrega ou inicializa os itens da operação vinculados duravelmente (AiOperationLead)
    let opLeads = await prisma.aiOperationLead.findMany({
      where: { operationId: op.id },
      include: { lead: true },
    });

    if (opLeads.length === 0) {
      let requestedLeadIds: string[] = [];
      try {
        if (op.resultSummary) {
          const parsed = JSON.parse(op.resultSummary);
          if (Array.isArray(parsed.requestedLeadIds)) {
            requestedLeadIds = parsed.requestedLeadIds;
          }
        }
      } catch {}

      const whereClause: any = {
        campaignId: op.campaignId,
        status: 'PENDING',
        sendStartedAt: null,
      };
      if (requestedLeadIds.length > 0) {
        whereClause.id = { in: requestedLeadIds };
      }

      const initialLeads = await prisma.lead.findMany({
        where: whereClause,
        select: { id: true },
        take: 200,
      });

      if (initialLeads.length > 0) {
        await prisma.aiOperationLead.createMany({
          data: initialLeads.map((l) => ({
            operationId: op.id,
            leadId: l.id,
            status: 'PENDING',
            isSettled: false,
          })),
        });

        opLeads = await prisma.aiOperationLead.findMany({
          where: { operationId: op.id },
          include: { lead: true },
        });
      }
    }

    const user = op.campaign.workspace.user;
    const senderName = user.name || op.campaign.workspace.name || 'Especialista';
    const senderCompany = op.campaign.workspace.name || 'Nossa Empresa';
    const offerDescription = op.offerDescription || '';
    const toneStyle = (op.toneStyle as AiToneStyle) || 'CONSULTATIVE';

    // 2. Filtra os itens que precisam de geração externa pela IA
    // Se o item já tem generatedContent salvo (interrupção anterior após geração), NÃO chama o Gemini de novo!
    const toGenerate = opLeads.filter(
      (item) => item.status !== 'COMPLETED' && !item.isSettled && (!item.generatedContent || item.status === 'PENDING' || item.status === 'GENERATING')
    );

    // Processamento da IA com concorrência calibrada (3 simultâneas por vez)
    const CHUNK_SIZE = 3;
    for (let i = 0; i < toGenerate.length; i += CHUNK_SIZE) {
      const chunk = toGenerate.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (item) => {
          try {
            // Revalidação antes da chamada externa
            const currentLead = await prisma.lead.findUnique({
              where: { id: item.leadId },
              select: { status: true, sendStartedAt: true, title: true, phone: true, website: true, neighborhood: true },
            });

            if (!currentLead || currentLead.status !== 'PENDING' || currentLead.sendStartedAt !== null) {
              await prisma.aiOperationLead.update({
                where: { id: item.id },
                data: { status: 'SKIPPED', errorMessage: 'Lead não elegível antes da chamada de IA' },
              });
              return;
            }

            // Marca status GENERATING (chamada iniciada / estado incerto)
            await prisma.aiOperationLead.update({
              where: { id: item.id },
              data: { status: 'GENERATING' },
            });

            // Chamada externa ao Gemini FORA de qualquer transação do banco
            const copy = await this.callGeminiApi({
              leadTitle: currentLead.title,
              phone: currentLead.phone,
              website: currentLead.website,
              neighborhood: currentLead.neighborhood,
              senderName,
              senderCompany,
              offerDescription,
              toneStyle,
            });

            // Persiste duravelmente o texto gerado no item da operação
            await prisma.aiOperationLead.update({
              where: { id: item.id },
              data: {
                generatedContent: copy,
                status: 'GENERATED',
              },
            });
          } catch (leadError: any) {
            console.warn(`[AI LEAD GENERATION FAILED] Item ${item.id} / Lead ${item.leadId}:`, leadError?.message);
            await prisma.aiOperationLead.update({
              where: { id: item.id },
              data: {
                status: 'FAILED',
                errorMessage: leadError?.message || 'Falha na geração com IA',
              },
            }).catch(() => {});
          }
        })
      );
    }

    // 3. Recarrega o estado atualizado de todos os itens da operação
    const refreshedOpLeads = await prisma.aiOperationLead.findMany({
      where: { operationId: op.id },
    });

    // Identifica itens que já estavam liquidados (de execuções parciais anteriores)
    const alreadySettledCount = refreshedOpLeads.filter((i) => i.isSettled).length;
    const alreadySettledLeadIds = refreshedOpLeads.filter((i) => i.isSettled).map((i) => i.leadId);

    // Itens que possuem texto gerado com sucesso e ainda não foram liquidados
    const newlyGeneratedItems = refreshedOpLeads.filter(
      (i) => !i.isSettled && (i.status === 'GENERATED' || i.generatedContent)
    );

    // 4. TRANSAÇÃO ATÔMICA: Aplicação das mensagens utilizáveis nos leads e liquidação da reserva
    try {
      await prisma.$transaction(async (tx) => {
        const newlyAppliedLeadIds: string[] = [];

        for (const item of newlyGeneratedItems) {
          // Revalida atomicamente se o lead ainda está PENDING e sem envio iniciado
          const updated = await tx.lead.updateMany({
            where: {
              id: item.leadId,
              campaignId: op.campaignId,
              status: 'PENDING',
              sendStartedAt: null,
            },
            data: {
              messageContent: item.generatedContent,
              aiGenerated: true,
              aiGeneratedAt: new Date(),
            } as any,
          });

          if (updated.count > 0) {
            newlyAppliedLeadIds.push(item.leadId);
            await tx.aiOperationLead.update({
              where: { id: item.id },
              data: { status: 'COMPLETED', isSettled: true },
            });
          } else {
            // O lead começou a ser enviado antes da finalização: não altera mensagem nem cobra
            await tx.aiOperationLead.update({
              where: { id: item.id },
              data: { status: 'SKIPPED', errorMessage: 'Lead iniciou envio antes da liquidação' },
            });
          }
        }

        const totalSettledNow = alreadySettledCount + newlyAppliedLeadIds.length;

        // Liquidação atômica vinculada estritamente à mesma transação
        if (op.reservationId) {
          if (totalSettledNow > 0) {
            await CreditWalletService.settleReservation(
              {
                reservationId: op.reservationId,
                actualConsumedAmount: totalSettledNow,
                description: `Geração de abordagens IA: ${totalSettledNow} mensagens aplicadas (${totalSettledNow} créditos debitados)`,
              },
              tx
            );
          } else {
            await CreditWalletService.releaseReservation(
              {
                reservationId: op.reservationId,
                reason: 'Nenhuma mensagem aplicada ou leads tornaram-se inelegíveis',
              },
              tx
            );
          }
        }

        const finalStatus = totalSettledNow === op.totalLeads ? 'COMPLETED' : (totalSettledNow > 0 ? 'PARTIAL' : 'FAILED');
        await tx.aiOperation.update({
          where: { id: op.id },
          data: {
            status: finalStatus,
            completedLeads: totalSettledNow,
            failedLeads: op.totalLeads - totalSettledNow,
            creditsConsumed: totalSettledNow,
            resultSummary: JSON.stringify({ completedLeadIds: [...alreadySettledLeadIds, ...newlyAppliedLeadIds] }),
          },
        });
      });
    } catch (settleOrApplyError: any) {
      console.error('[AI ATOMIC SETTLE ERROR] Transação de liquidação revertida:', settleOrApplyError?.message);

      // Em caso de falha na liquidação (ex: settleReservation falhou), a transação sofre ROLLBACK.
      // Nenhum lead permanece com a nova mensagem sem débito!
      await prisma.aiOperation.update({
        where: { id: op.id },
        data: {
          status: 'FAILED',
          completedLeads: alreadySettledCount,
          failedLeads: op.totalLeads - alreadySettledCount,
          creditsConsumed: alreadySettledCount,
          errorMessage: `Falha na liquidação financeira: ${settleOrApplyError?.message || 'Erro contábil'}`,
        },
      });

      // Libera a reserva pendente para não prender créditos do usuário
      if (op.reservationId && alreadySettledCount === 0) {
        await CreditWalletService.releaseReservation({
          reservationId: op.reservationId,
          reason: `Falha na liquidação atômica: ${settleOrApplyError?.message}`,
        }).catch(() => {});
      }

      throw settleOrApplyError;
    }

    // 5. Persiste preferências de tom e proposta na campanha se houve sucesso
    const finalOp = await prisma.aiOperation.findUnique({ where: { id: op.id } });
    if (finalOp && finalOp.creditsConsumed > 0) {
      await prisma.campaign.update({
        where: { id: op.campaignId },
        data: {
          aiOfferDescription: offerDescription,
          aiToneStyle: toneStyle,
        } as any,
      }).catch(() => {});
    }
  }

  /**
   * Helper que aguarda a conclusão de uma operação de regeneração individual concorrente em andamento.
   */
  private static async waitForSingleLeadCompletion(operationId: string, leadId: string) {
    for (let attempt = 0; attempt < 35; attempt++) {
      await new Promise((r) => setTimeout(r, 150));
      const op = await prisma.aiOperation.findUnique({ where: { id: operationId } });
      if (op?.status === 'COMPLETED') {
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        return {
          leadId,
          messageContent: lead?.messageContent || '',
          isExisting: true,
        };
      }
      if (op?.status === 'FAILED') {
        throw new Error(op.errorMessage || 'Falha na geração concorrente da mensagem.');
      }
    }

    const currentLead = await prisma.lead.findUnique({ where: { id: leadId } });
    return {
      leadId,
      messageContent: currentLead?.messageContent || '',
      isExisting: true,
    };
  }

  /**
   * Helper que aguarda a conclusão de uma operação de lote concorrente em andamento.
   */
  private static async waitForBatchCompletion(operationId: string) {
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise((r) => setTimeout(r, 100));
      const op = await prisma.aiOperation.findUnique({ where: { id: operationId } });
      if (op && op.status !== 'PENDING' && op.status !== 'PROCESSING') {
        return op;
      }
    }
    return await prisma.aiOperation.findUnique({ where: { id: operationId } });
  }

  /**
   * Reconcilia duravelmente o estado de um job BullMQ com a operação no banco.
   * - Operações já COMPLETED ou PARTIAL no banco não são reprocessadas.
   * - Job inexistente: enfileira novo job.
   * - Job FAILED: utiliza o mecanismo de retry nativo do BullMQ (job.retry('failed')),
   *   com fallback para remove + add caso o job esteja corrompido no Redis.
   * - Job active, waiting ou delayed: preservado sem duplicar.
   * - Divergência: job completed na fila mas operação ainda pendente no banco -> remove e reenfileira.
   * - Proteção contra concorrência: serializado via pg_advisory_xact_lock.
   */
  public static async reconcileAiBatchJob(operationId: string, customQueue?: any): Promise<{
    action: 'ALREADY_COMPLETED' | 'ENQUEUED' | 'RETRIED' | 'PRESERVED' | 'RECREATED_FROM_DIVERGENCE' | 'SKIPPED_NOT_FOUND';
    state?: string | null;
  }> {
    const queue = customQueue || aiGenerationQueue;
    const jobId = `ai_op_${operationId}`;

    return await prisma.$transaction(async (tx) => {
      // 1. Serializa recuperações concorrentes da mesma operação através de advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai_op_recovery:${operationId}`}))`;

      // 2. Operações concluídas no banco não devem ser reprocessadas
      const freshOp = await tx.aiOperation.findUnique({
        where: { id: operationId },
      });

      if (!freshOp) {
        return { action: 'SKIPPED_NOT_FOUND' };
      }

      if (freshOp.status === 'COMPLETED' || freshOp.status === 'PARTIAL') {
        return { action: 'ALREADY_COMPLETED' };
      }

      // 3. Consulta o estado real do job no BullMQ/Redis
      let job: any = null;
      try {
        job = await queue.getJob(jobId);
      } catch (err: any) {
        console.warn(`[AI RECONCILE] Falha ao consultar job ${jobId} na fila:`, err?.message);
      }

      // Caso 1: Job inexistente -> enfileirar
      if (!job) {
        await queue.add(
          'process_ai_batch',
          { operationId },
          { jobId, removeOnComplete: 100, removeOnFail: 100 }
        );
        return { action: 'ENQUEUED', state: 'nonexistent' };
      }

      const state = await job.getState();

      // Caso 2: Job active, waiting ou delayed -> preservar sem duplicar
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return { action: 'PRESERVED', state };
      }

      // Caso 3: Job FAILED recuperável -> utilizar o mecanismo correto de retry do BullMQ
      if (state === 'failed') {
        try {
          if (typeof job.retry === 'function') {
            await job.retry('failed');
          } else {
            await job.remove().catch(() => {});
            await queue.add(
              'process_ai_batch',
              { operationId },
              { jobId, removeOnComplete: 100, removeOnFail: 100 }
            );
          }
        } catch (retryErr: any) {
          console.warn(`[AI RECONCILE RETRY WARN] Falha ao executar job.retry(${jobId}), fallback para remove+add:`, retryErr?.message);
          await job.remove().catch(() => {});
          await queue.add(
            'process_ai_batch',
            { operationId },
            { jobId, removeOnComplete: 100, removeOnFail: 100 }
          );
        }
        return { action: 'RETRIED', state: 'failed' };
      }

      // Caso 4: Divergência explícita entre job completed e operação ainda pendente no banco
      if (state === 'completed') {
        console.warn(`[AI RECONCILE DIVERGENCE] Operação ${operationId} pendente no banco (${freshOp.status}), mas job ${jobId} consta como completed na fila. Reenfileirando...`);
        try {
          await job.remove();
        } catch {}
        await queue.add(
          'process_ai_batch',
          { operationId },
          { jobId, removeOnComplete: 100, removeOnFail: 100 }
        );
        return { action: 'RECREATED_FROM_DIVERGENCE', state: 'completed' };
      }

      // Caso 5: Outro estado qualquer não executando -> recria com segurança
      try {
        await job.remove();
      } catch {}
      await queue.add(
        'process_ai_batch',
        { operationId },
        { jobId, removeOnComplete: 100, removeOnFail: 100 }
      );
      return { action: 'ENQUEUED', state };
    });
  }

  /**
   * Recupera no boot do backend ou sob demanda operações de IA em lote órfãs ou interrompidas
   * que ficaram PENDING ou PROCESSING, reconciliando conforme o estado real do job no BullMQ.
   */
  public static async recoverOrphanedAiOperations(customQueue?: any) {
    try {
      const pendingOps = await prisma.aiOperation.findMany({
        where: {
          type: 'BATCH',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      });

      if (pendingOps.length === 0) return [];

      console.log(`[AI RECOVERY] Reconciliando ${pendingOps.length} operações de IA pendentes/interrompidas...`);

      const results = [];
      for (const op of pendingOps) {
        const result = await this.reconcileAiBatchJob(op.id, customQueue);
        results.push({ operationId: op.id, ...result });
      }
      return results;
    } catch (err) {
      console.error('[AI RECOVERY ERROR] Erro ao recuperar operações órfãs de IA:', err);
      return [];
    }
  }

  /**
   * Consulta o status e progresso de uma operação de IA pelo ID.
   */
  public static async getOperationStatus(params: {
    userId: string;
    workspaceId: string;
    campaignId: string;
    operationId: string;
  }) {
    const { userId, workspaceId, campaignId, operationId } = params;

    const op = await prisma.aiOperation.findFirst({
      where: { id: operationId, userId, workspaceId, campaignId },
      select: {
        id: true,
        campaignId: true,
        type: true,
        status: true,
        totalLeads: true,
        completedLeads: true,
        failedLeads: true,
        creditsReserved: true,
        creditsConsumed: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!op) {
      throw new Error('Operação de IA não encontrada.');
    }

    return op;
  }

  /**
   * Consulta se há alguma operação de lote em andamento para a campanha.
   */
  public static async getActiveCampaignOperation(params: {
    userId: string;
    workspaceId: string;
    campaignId: string;
  }) {
    const { userId, workspaceId, campaignId } = params;

    const op = await prisma.aiOperation.findFirst({
      where: {
        userId,
        workspaceId,
        campaignId,
        type: 'BATCH',
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        totalLeads: true,
        completedLeads: true,
        failedLeads: true,
        createdAt: true,
      },
    });

    return op;
  }

  /**
   * Regera a mensagem de um lead individual de forma atômica e idempotente.
   * Persiste e reivindica a operação ANTES da chamada ao Gemini para evitar duplicação em corridas concorrentes.
   * A chamada externa ocorre fora de transação do banco, e a gravação/liquidação é estritamente atômica.
   */
  public static async regenerateSingleLead(params: SingleLeadRegenParams) {
    const { userId, workspaceId, campaignId, leadId } = params;

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId, workspace: { userId } },
      include: {
        workspace: {
          include: { user: { select: { id: true, name: true, role: true, planId: true } } },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campanha não encontrada ou não autorizada.');
    }

    const user = campaign.workspace.user;
    const caps = getUserCapabilities(user);
    if (!caps.canUseAi) {
      const err = new Error('O seu plano atual não possui acesso ao Assistente de IA.');
      (err as any).code = 'AI_NOT_ALLOWED';
      throw err;
    }

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, campaignId },
    });

    if (!lead) {
      throw new Error('Lead não encontrado nesta campanha.');
    }

    // Regra estrita: não regenerar leads cujo envio já começou ou foi concluído
    // (Verificação prévia para garantir proteção do histórico independentemente de chave externa)
    if (lead.status !== 'PENDING' || lead.sendStartedAt !== null) {
      throw new Error(`Não é possível personalizar um lead que já foi enviado ou está em processamento de envio (status atual: ${lead.status}).`);
    }

    if (!this.isAvailable()) {
      throw new Error('O assistente de IA está indisponível no momento. Configure a GEMINI_API_KEY no servidor.');
    }

    const campaignOffer = (campaign as any).aiOfferDescription;
    const campaignTone = (campaign as any).aiToneStyle;
    const offerDescription = (params.offerDescription || campaignOffer || '').trim();
    if (offerDescription.length < 5 || offerDescription.length > 1000) {
      throw new Error('Informe a proposta/oferta (entre 5 e 1000 caracteres).');
    }

    const toneStyle: AiToneStyle = params.toneStyle || (campaignTone as AiToneStyle) || 'CONSULTATIVE';

    const payloadHash = computePayloadHash({ offerDescription, toneStyle, leadIds: [leadId] });
    const idempotencyKey = params.idempotencyKey?.trim() || `ai_single_${leadId}_${randomUUID()}`;

    // 1. Verificação prévia de idempotência
    const existingOp = await prisma.aiOperation.findUnique({
      where: { idempotencyKey },
    });

    if (existingOp) {
      if (
        existingOp.userId !== userId ||
        existingOp.leadId !== leadId ||
        (existingOp.payloadHash && existingOp.payloadHash !== payloadHash)
      ) {
        const err = new Error('Chave de idempotência já utilizada com outros parâmetros ou usuário.');
        (err as any).statusCode = 409;
        throw err;
      }

      if (existingOp.status === 'COMPLETED') {
        const currentLead = await prisma.lead.findUnique({ where: { id: leadId } });
        return {
          leadId,
          messageContent: currentLead?.messageContent || '',
          isExisting: true,
        };
      }

      if (existingOp.status === 'FAILED') {
        const err = new Error(existingOp.errorMessage || 'Falha persistida na geração da mensagem para esta chave de idempotência.');
        (err as any).code = 'OPERATION_FAILED';
        (err as any).statusCode = 422;
        throw err;
      }

      if (existingOp.status === 'PROCESSING') {
        return await this.waitForSingleLeadCompletion(existingOp.id, leadId);
      }
    }

    if (process.env.NODE_ENV === 'test' && testBeforeReserveHook) {
      await testBeforeReserveHook(params);
    }

    // Revalidação imediata pré-reserva para impedir corrida se houve pausa/processamento concorrente
    const recheckedOp = await prisma.aiOperation.findUnique({
      where: { idempotencyKey },
    });

    if (recheckedOp) {
      if (
        recheckedOp.userId !== userId ||
        recheckedOp.leadId !== leadId ||
        (recheckedOp.payloadHash && recheckedOp.payloadHash !== payloadHash)
      ) {
        const err = new Error('Chave de idempotência já utilizada com outros parâmetros ou usuário.');
        (err as any).statusCode = 409;
        throw err;
      }

      if (recheckedOp.status === 'COMPLETED') {
        const currentLead = await prisma.lead.findUnique({ where: { id: leadId } });
        return {
          leadId,
          messageContent: currentLead?.messageContent || '',
          isExisting: true,
        };
      }

      if (recheckedOp.status === 'FAILED') {
        const err = new Error(recheckedOp.errorMessage || 'Falha persistida na geração da mensagem para esta chave de idempotência.');
        (err as any).code = 'OPERATION_FAILED';
        (err as any).statusCode = 422;
        throw err;
      }

      if (recheckedOp.status === 'PROCESSING') {
        return await this.waitForSingleLeadCompletion(recheckedOp.id, leadId);
      }
    }

    // 2. Reserva 1 crédito na carteira
    let reservation: any;
    try {
      reservation = await CreditWalletService.reserveCredits({
        userId,
        amount: 1,
        sourceType: 'AI_ASSISTANT',
        sourceId: campaignId,
        idempotencyKey,
        description: `Regeneração IA para lead: ${lead.title}`,
      });
    } catch (reserveErr: any) {
      // Se a reserva falhar por já pertencer a operação terminal, reconsulta e devolve erro persistido
      const opAfterErr = await prisma.aiOperation.findUnique({ where: { idempotencyKey } });
      if (opAfterErr?.status === 'FAILED') {
        const err = new Error(opAfterErr.errorMessage || 'Falha persistida na geração da mensagem para esta chave de idempotência.');
        (err as any).code = 'OPERATION_FAILED';
        (err as any).statusCode = 422;
        throw err;
      }
      throw reserveErr;
    }

    // 3. PERSISTE e REIVINDICA a operação como PROCESSING ANTES de chamar o Gemini
    let op;
    try {
      op = await prisma.aiOperation.create({
        data: {
          workspaceId,
          userId,
          campaignId,
          leadId,
          type: 'SINGLE_LEAD',
          idempotencyKey,
          payloadHash,
          offerDescription,
          toneStyle,
          status: 'PROCESSING',
          reservationId: reservation.reservationId || null,
          totalLeads: 1,
          completedLeads: 0,
          failedLeads: 0,
          creditsReserved: 1,
          creditsConsumed: 0,
        },
      });
    } catch (createErr: any) {
      if (createErr?.code === 'P2002' || createErr?.message?.includes('Unique constraint failed')) {
        const concurrentlyCreated = await prisma.aiOperation.findUnique({
          where: { idempotencyKey },
        });

        if (concurrentlyCreated) {
          // Validação rigorosa de payload divergente na corrida concorrente
          if (
            concurrentlyCreated.userId !== userId ||
            concurrentlyCreated.leadId !== leadId ||
            (concurrentlyCreated.payloadHash && concurrentlyCreated.payloadHash !== payloadHash)
          ) {
            if (reservation.reservationId && (reservation.reservationId !== concurrentlyCreated.reservationId || concurrentlyCreated.status !== 'PROCESSING')) {
              await CreditWalletService.releaseReservation({
                reservationId: reservation.reservationId,
                reason: 'Operação concorrente com payload divergente',
              }).catch(() => {});
            }
            const conflictErr = new Error('Chave de idempotência já utilizada com outros parâmetros ou usuário.');
            (conflictErr as any).statusCode = 409;
            throw conflictErr;
          }

          // 1. Se a execução vencedora estiver ATIVA ('PROCESSING'):
          // DEVE PRESERVAR a reserva da vencedora! Se a reserva de A for redundante (ID diferente),
          // libera a redundante. Mas se for o mesmo ID compartilhado, NÃO libera (vencedora está usando).
          if (concurrentlyCreated.status === 'PROCESSING') {
            if (reservation.reservationId && reservation.reservationId !== concurrentlyCreated.reservationId) {
              await CreditWalletService.releaseReservation({
                reservationId: reservation.reservationId,
                reason: 'Operação concorrente ativa com mesma chave detectada',
              }).catch(() => {});
            }
            // Aguarda a operação vencedora concluir sem chamar o Gemini novamente
            return await this.waitForSingleLeadCompletion(concurrentlyCreated.id, leadId);
          }

          // 2. Se a execução vencedora já for TERMINAL ('FAILED'):
          // A vencedora já finalizou e não está ativa. Se a reserva em mãos estiver PENDING
          // (mesmo ID reativado ou ID diferente), deve ser liberada para não prender créditos órfãos!
          if (concurrentlyCreated.status === 'FAILED') {
            if (reservation.reservationId) {
              const resDb = await prisma.creditReservation.findUnique({ where: { id: reservation.reservationId } });
              if (resDb?.status === 'PENDING') {
                await CreditWalletService.releaseReservation({
                  reservationId: reservation.reservationId,
                  reason: 'Operação concorrente já falhou e finalizou',
                }).catch(() => {});
              }
            }
            const failErr = new Error(concurrentlyCreated.errorMessage || 'Falha persistida na geração da mensagem para esta chave de idempotência.');
            (failErr as any).code = 'OPERATION_FAILED';
            (failErr as any).statusCode = 422;
            throw failErr;
          }

          // 3. Se a execução vencedora já for 'COMPLETED':
          if (concurrentlyCreated.status === 'COMPLETED') {
            if (reservation.reservationId && reservation.reservationId !== concurrentlyCreated.reservationId) {
              await CreditWalletService.releaseReservation({
                reservationId: reservation.reservationId,
                reason: 'Operação concorrente já completada',
              }).catch(() => {});
            }
            const currentLead = await prisma.lead.findUnique({ where: { id: leadId } });
            return {
              leadId,
              messageContent: currentLead?.messageContent || '',
              isExisting: true,
            };
          }
        }
      }

      if (reservation.reservationId) {
        await CreditWalletService.releaseReservation({
          reservationId: reservation.reservationId,
          reason: 'Falha ao registrar operação de IA',
        }).catch(() => {});
      }
      throw createErr;
    }

    try {
      // 4. Chamada externa ao Gemini FORA de qualquer transação do banco (apenas a execução vencedora executa)
      const copy = await this.callGeminiApi({
        leadTitle: lead.title,
        phone: lead.phone,
        website: lead.website,
        neighborhood: lead.neighborhood,
        senderName: user.name || campaign.workspace.name || 'Especialista',
        senderCompany: campaign.workspace.name || 'Nossa Empresa',
        offerDescription,
        toneStyle,
      });

      // 5. Persistência do texto no lead e liquidação da reserva dentro da MESMA transação
      await prisma.$transaction(async (tx) => {
        // Revalida atomicamente elegibilidade no momento de salvar
        const updateResult = await tx.lead.updateMany({
          where: {
            id: lead.id,
            campaignId,
            status: 'PENDING',
            sendStartedAt: null,
          },
          data: {
            messageContent: copy,
            aiGenerated: true,
            aiGeneratedAt: new Date(),
          } as any,
        });

        if (updateResult.count === 0) {
          throw new Error('O lead iniciou o envio durante a geração e sua mensagem não foi alterada.');
        }

        // Liquidação atômica vinculada à mesma transação: se falhar, o lead sofre rollback!
        if (reservation.reservationId) {
          await CreditWalletService.settleReservation(
            {
              reservationId: reservation.reservationId,
              actualConsumedAmount: 1,
              description: `Regeneração IA para lead ${lead.title} concluída (1 crédito)`,
            },
            tx
          );
        }

        // Atualiza a operação para COMPLETED
        await tx.aiOperation.update({
          where: { id: op.id },
          data: {
            status: 'COMPLETED',
            completedLeads: 1,
            creditsConsumed: 1,
          },
        });
      });

      return { leadId: lead.id, messageContent: copy };
    } catch (err: any) {
      await prisma.aiOperation.update({
        where: { id: op.id },
        data: {
          status: 'FAILED',
          errorMessage: err?.message || 'Falha na regeneração individual',
        },
      }).catch(() => {});

      if (reservation.reservationId) {
        await CreditWalletService.releaseReservation({
          reservationId: reservation.reservationId,
          reason: `Falha na regeneração individual da IA: ${err?.message}`,
        }).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Permite ao usuário editar livremente o conteúdo da mensagem de um lead sem gastar créditos.
   * Impede estritamente a edição de leads que já foram enviados ou cujo envio foi iniciado.
   */
  public static async updateLeadMessage(params: {
    userId: string;
    workspaceId: string;
    campaignId: string;
    leadId: string;
    messageContent: string;
  }) {
    const { userId, workspaceId, campaignId, leadId, messageContent } = params;

    const trimmedContent = (messageContent || '').trim();
    if (trimmedContent.length > 2000) {
      throw new Error('O conteúdo da mensagem não pode ultrapassar 2000 caracteres.');
    }

    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        campaignId,
        campaign: { workspaceId, workspace: { userId } },
      },
    });

    if (!lead) {
      throw new Error('Lead não encontrado ou não pertence ao seu workspace.');
    }

    // Impede edição de mensagens cujo envio já começou ou já foi concluído
    if (lead.status !== 'PENDING' || lead.sendStartedAt !== null) {
      throw new Error(`Não é possível editar a mensagem de um lead que já foi enviado ou está em processamento de envio (status atual: ${lead.status}).`);
    }

    const updateResult = await prisma.lead.updateMany({
      where: {
        id: leadId,
        campaignId,
        status: 'PENDING',
        sendStartedAt: null,
      },
      data: {
        messageContent: trimmedContent || null,
      },
    });

    if (updateResult.count === 0) {
      throw new Error('O lead iniciou o envio no momento da edição e a alteração foi bloqueada para proteger o histórico.');
    }

    return await prisma.lead.findUnique({ where: { id: leadId } });
  }

  // Alias de compatibilidade com testes anteriores
  public static async generateBatchForCampaign(params: BatchGenerationParams) {
    return this.initiateBatchGeneration({ ...params, processSyncForTest: true });
  }
}
