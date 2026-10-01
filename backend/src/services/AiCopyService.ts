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
      if (existingOp.status === 'COMPLETED') {
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

      // Se estiver em andamento (PENDING ou PROCESSING), devolve status atual sem duplicar
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

    // 6. Persiste a operação no banco com status PENDING (com tratamento para concorrência simultânea)
    let op;
    try {
      op = await prisma.aiOperation.create({
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

    // 7. Enfileira o processamento em segundo plano no BullMQ
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(params.processSyncForTest);
    if (!isTestEnv) {
      await aiGenerationQueue.add(
        'process_ai_batch',
        { operationId: op.id },
        { jobId: `ai_op_${op.id}`, removeOnComplete: 100, removeOnFail: 100 }
      );
    } else {
      // Em testes unitários que pedirem sincronia ou ambiente de teste sem worker
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
   * Executa chamadas fora da transação, revalida elegibilidade e liquida atomicamente.
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

    let requestedLeadIds: string[] = [];
    try {
      if (op.resultSummary) {
        const parsed = JSON.parse(op.resultSummary);
        if (Array.isArray(parsed.requestedLeadIds)) {
          requestedLeadIds = parsed.requestedLeadIds;
        }
      }
    } catch {
      // Ignora erro de parsing
    }

    const whereClause: any = {
      campaignId: op.campaignId,
      status: 'PENDING',
      sendStartedAt: null,
    };
    if (requestedLeadIds.length > 0) {
      whereClause.id = { in: requestedLeadIds };
    }

    const leads = await prisma.lead.findMany({
      where: whereClause,
      select: { id: true, title: true, phone: true, website: true, neighborhood: true },
      take: 200,
    });

    const user = op.campaign.workspace.user;
    const senderName = user.name || op.campaign.workspace.name || 'Especialista';
    const senderCompany = op.campaign.workspace.name || 'Nossa Empresa';
    const offerDescription = op.offerDescription || '';
    const toneStyle = (op.toneStyle as AiToneStyle) || 'CONSULTATIVE';

    let successCount = 0;
    let failCount = 0;
    const completedLeadIds: string[] = [];

    // Processamento com concorrência calibrada (3 simultâneas por vez)
    const CHUNK_SIZE = 3;
    for (let i = 0; i < leads.length; i += CHUNK_SIZE) {
      const chunk = leads.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (lead) => {
          try {
            // Revalidação antes da chamada externa
            const currentLead = await prisma.lead.findUnique({
              where: { id: lead.id },
              select: { status: true, sendStartedAt: true },
            });

            if (!currentLead || currentLead.status !== 'PENDING' || currentLead.sendStartedAt !== null) {
              failCount++;
              return;
            }

            // Chamada externa à IA fora de qualquer transação do banco
            const copy = await this.callGeminiApi({
              leadTitle: lead.title,
              phone: lead.phone,
              website: lead.website,
              neighborhood: lead.neighborhood,
              senderName,
              senderCompany,
              offerDescription,
              toneStyle,
            });

            // Persistência condicional atômica: se o lead começou a ser enviado durante a chamada, descarte
            const saved = await prisma.$transaction(async (tx) => {
              const updated = await tx.lead.updateMany({
                where: {
                  id: lead.id,
                  campaignId: op.campaignId,
                  status: 'PENDING',
                  sendStartedAt: null,
                },
                data: {
                  messageContent: copy,
                  aiGenerated: true,
                  aiGeneratedAt: new Date(),
                } as any,
              });
              return updated.count > 0;
            });

            if (saved) {
              successCount++;
              completedLeadIds.push(lead.id);
            } else {
              failCount++;
            }
          } catch (leadError) {
            console.warn(`[AI LEAD GENERATION FAILED] Lead ${lead.id}:`, leadError);
            failCount++;
          }
        })
      );
    }

    // Liquidação estrita atômica da reserva de créditos
    if (op.reservationId) {
      try {
        if (successCount > 0) {
          await CreditWalletService.settleReservation({
            reservationId: op.reservationId,
            actualConsumedAmount: successCount,
            description: `Geração de abordagens IA concluída: ${successCount} mensagens geradas (${successCount} créditos debitados)`,
          });
        } else {
          await CreditWalletService.releaseReservation({
            reservationId: op.reservationId,
            reason: 'Nenhuma mensagem foi gerada com sucesso ou leads não estavam mais elegíveis',
          });
        }
      } catch (settleError) {
        console.error('[AI SETTLE RESERVATION ERROR]', settleError);
      }
    }

    // Atualiza estado final da operação
    const finalStatus = successCount === op.totalLeads ? 'COMPLETED' : (successCount > 0 ? 'PARTIAL' : 'FAILED');
    await prisma.aiOperation.update({
      where: { id: op.id },
      data: {
        status: finalStatus,
        completedLeads: successCount,
        failedLeads: failCount,
        creditsConsumed: successCount,
        resultSummary: JSON.stringify({ completedLeadIds }),
      },
    });

    // Persiste preferências na campanha
    if (successCount > 0) {
      await prisma.campaign.update({
        where: { id: op.campaignId },
        data: {
          aiOfferDescription: offerDescription,
          aiToneStyle: toneStyle,
        } as any,
      });
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
   * Se a liquidação da reserva falhar, a mensagem no lead sobre rollback automático.
   */
  public static async regenerateSingleLead(params: SingleLeadRegenParams) {
    const { userId, workspaceId, campaignId, leadId } = params;

    if (!this.isAvailable()) {
      throw new Error('O assistente de IA está indisponível no momento. Configure a GEMINI_API_KEY no servidor.');
    }

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
    if (lead.status !== 'PENDING' || lead.sendStartedAt !== null) {
      throw new Error(`Não é possível personalizar um lead que já foi enviado ou está em processamento de envio (status atual: ${lead.status}).`);
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

    // Verificação de idempotência para regeneração individual
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
    }

    // Reserva 1 crédito na carteira
    const reservation = await CreditWalletService.reserveCredits({
      userId,
      amount: 1,
      sourceType: 'AI_ASSISTANT',
      sourceId: campaignId,
      idempotencyKey,
      description: `Regeneração IA para lead: ${lead.title}`,
    });

    try {
      // Chamada externa ao Gemini FORA de qualquer transação do banco
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

      // Persistência do texto no lead e liquidação da reserva dentro da MESMA transação
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

        // Registra operação de IA como concluída
        await tx.aiOperation.upsert({
          where: { idempotencyKey },
          create: {
            workspaceId,
            userId,
            campaignId,
            type: 'SINGLE_LEAD',
            leadId,
            idempotencyKey,
            payloadHash,
            offerDescription,
            toneStyle,
            status: 'COMPLETED',
            reservationId: reservation.reservationId || null,
            totalLeads: 1,
            completedLeads: 1,
            failedLeads: 0,
            creditsReserved: 1,
            creditsConsumed: 1,
          },
          update: {
            status: 'COMPLETED',
            completedLeads: 1,
            creditsConsumed: 1,
          },
        });
      });

      return { leadId: lead.id, messageContent: copy };
    } catch (err: any) {
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
