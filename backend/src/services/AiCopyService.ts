import { prisma } from '../lib/prisma';
import { ENV } from '../config/env';
import { getUserCapabilities } from '../config/plans';
import { CreditWalletService } from './CreditWalletService';
import { formatarNomeEmpresa, temWebsiteValido } from './ProposalEngine';
import { randomUUID } from 'node:crypto';

export type AiToneStyle = 'CONSULTATIVE' | 'FRIENDLY' | 'DIRECT' | 'URGENT_OFFER';

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
  toneStyle?: AiToneStyle;
  leadIds?: string[];
  idempotencyKey?: string;
}

// Provedor injetável exclusivamente para testes unitários automatizados
let testAiProvider: ((input: GenerateCopyInput) => Promise<string>) | null = null;

export function setTestAiProvider(fn: ((input: GenerateCopyInput) => Promise<string>) | null) {
  testAiProvider = fn;
}

export class AiCopyService {
  /**
   * Constrói os prompts de sistema e usuário para a OpenAI (GPT-4o-mini).
   */
  public static buildPrompts(input: GenerateCopyInput): { systemPrompt: string; userPrompt: string } {
    const nomeEmpresa = formatarNomeEmpresa(input.leadTitle);
    const possuiSite = temWebsiteValido(input.website);
    const bairro = input.neighborhood ? input.neighborhood.trim() : '';

    const toneDescriptions: Record<AiToneStyle, string> = {
      CONSULTATIVE: 'Tom consultivo, profissional e respeitoso. Foque em agregar valor e diagnóstico.',
      FRIENDLY: 'Tom amigável, acolhedor e descontraído, como quem conhece a empresa e quer bater um papo.',
      DIRECT: 'Tom direto ao ponto, enxuto e ágil, com no máximo 2 a 3 frases respeitando o tempo do empresário.',
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
   * Executa a chamada à OpenAI ou ao mock de testes / desenvolvimento.
   */
  public static async callOpenAiApi(input: GenerateCopyInput): Promise<string> {
    if (process.env.NODE_ENV === 'test' && testAiProvider) {
      return await testAiProvider(input);
    }

    const apiKey = (ENV.OPENAI_API_KEY || '').trim();

    // Fallback inteligente em desenvolvimento quando a chave ainda não foi informada
    if (!apiKey) {
      if (ENV.NODE_ENV === 'production') {
        throw new Error('Chave de API da OpenAI (OPENAI_API_KEY) não configurada no servidor.');
      }
      return this.generateDevelopmentFallback(input);
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(input);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 350,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('[OPENAI API ERROR]', response.status, errorText);
        throw new Error(`Falha na API da OpenAI (HTTP ${response.status}): ${errorText.slice(0, 150)}`);
      }

      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('A OpenAI retornou uma resposta sem conteúdo.');
      }

      return content;
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.message?.includes('timeout')) {
        throw new Error('Tempo limite excedido na comunicação com o assistente de IA.');
      }
      throw err;
    }
  }

  /**
   * Fallback de desenvolvimento para testes locais antes de inserir chave real da OpenAI.
   */
  private static generateDevelopmentFallback(input: GenerateCopyInput): string {
    const nome = formatarNomeEmpresa(input.leadTitle);
    const bairro = input.neighborhood ? `aqui em ${input.neighborhood}` : 'na sua região';
    const temSite = temWebsiteValido(input.website);

    if (temSite) {
      return `Olá, pessoal da *${nome}*! Tudo bem?\n\nEstive dando uma olhada no site de vocês e achei o posicionamento bem bacana.\n\nNós ajudamos empresas ${bairro} com: ${input.offerDescription.slice(0, 80)}.\n\nFaz sentido batermos um papo rápido de 5 minutos sobre isso?`;
    }

    return `Olá, pessoal da *${nome}*! Tudo bem?\n\nVi o perfil de vocês ${bairro} e notei que ainda não contam com um site oficial para captar mais contatos no Google.\n\nTrabalhamos exatamente com: ${input.offerDescription.slice(0, 80)}.\n\nPodemos trocar uma ideia rápida para eu te mostrar como funciona na prática?`;
  }

  /**
   * Gera cópias em lote para os leads de uma campanha com reserva e liquidação atômica de créditos.
   */
  public static async generateBatchForCampaign(params: BatchGenerationParams) {
    const { userId, workspaceId, campaignId, leadIds } = params;
    const offerDescription = (params.offerDescription || '').trim();
    const toneStyle: AiToneStyle = params.toneStyle || 'CONSULTATIVE';

    if (offerDescription.length < 5) {
      throw new Error('Informe o que você oferece com pelo menos 5 caracteres.');
    }

    // 1. Validação de isolamento do Workspace e Campanha
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId, workspace: { userId } },
      include: {
        workspace: {
          include: { user: { select: { id: true, name: true, role: true, planId: true } } }
        }
      }
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

    // 3. Filtragem de leads elegíveis
    const whereClause: any = {
      campaignId,
      status: 'PENDING',
    };
    if (leadIds && leadIds.length > 0) {
      whereClause.id = { in: leadIds };
    }

    const eligibleLeads = await prisma.lead.findMany({
      where: whereClause,
      select: { id: true, title: true, phone: true, website: true, neighborhood: true },
      take: 200, // Limite operacional de lote de IA
    });

    if (eligibleLeads.length === 0) {
      throw new Error('Nenhum lead pendente encontrado para geração de mensagem.');
    }

    const totalLeads = eligibleLeads.length;
    const idempotencyKey = params.idempotencyKey || `ai_batch_${campaignId}_${randomUUID()}`;

    // 4. Reserva atômica prévia dos créditos necessários na carteira (1 crédito por lead)
    const reservation = await CreditWalletService.reserveCredits({
      userId,
      amount: totalLeads,
      sourceType: 'AI_ASSISTANT',
      sourceId: campaignId,
      idempotencyKey,
      description: `Geração de abordagens IA: ${totalLeads} leads na campanha "${campaign.name}"`,
    });

    const senderName = user.name || campaign.workspace.name || 'Especialista';
    const senderCompany = campaign.workspace.name || 'Nossa Empresa';

    let successCount = 0;
    let failCount = 0;
    const updatedLeadIds: string[] = [];

    try {
      // 5. Concorrência controlada: processa em chunks de 5 chamadas simultâneas
      const CONCURRENCY = 5;
      for (let i = 0; i < eligibleLeads.length; i += CONCURRENCY) {
        const chunk = eligibleLeads.slice(i, i + CONCURRENCY);

        await Promise.all(
          chunk.map(async (lead) => {
            try {
              const copy = await this.callOpenAiApi({
                leadTitle: lead.title,
                phone: lead.phone,
                website: lead.website,
                neighborhood: lead.neighborhood,
                senderName,
                senderCompany,
                offerDescription,
                toneStyle,
              });

              await prisma.lead.update({
                where: { id: lead.id },
                data: {
                  messageContent: copy,
                  aiGenerated: true,
                  aiGeneratedAt: new Date(),
                } as any,
              });

              successCount++;
              updatedLeadIds.push(lead.id);
            } catch (leadError) {
              console.warn(`[AI LEAD GENERATION FAILED] Lead ${lead.id}:`, leadError);
              failCount++;
            }
          })
        );
      }

      // 6. Liquidação estrita da reserva: debita apenas os que foram gerados com sucesso
      // Se algum falhou, CreditWalletService.settleReservation estorna a diferença atomicamente
      if (reservation.reservationId) {
        await CreditWalletService.settleReservation({
          reservationId: reservation.reservationId,
          actualConsumedAmount: successCount,
          description: `Geração de abordagens IA concluída: ${successCount} mensagens geradas (${successCount} créditos debitados)`,
        });
      }

      // 7. Persiste a última proposta e tom configurados na campanha
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          aiOfferDescription: offerDescription,
          aiToneStyle: toneStyle,
        } as any,
      });

      return {
        totalRequested: totalLeads,
        generatedCount: successCount,
        failedCount: failCount,
        updatedLeadIds,
      };
    } catch (err: any) {
      // Se houve falha catastrófica no processo antes da liquidação, libera a reserva total
      if (reservation.reservationId && successCount === 0) {
        await CreditWalletService.releaseReservation({
          reservationId: reservation.reservationId,
          reason: `Falha na geração em lote da IA: ${err?.message || 'Erro inesperado'}`,
        }).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Regera ou edita a mensagem de um lead individual.
   */
  public static async regenerateSingleLead(params: {
    userId: string;
    workspaceId: string;
    campaignId: string;
    leadId: string;
    offerDescription?: string;
    toneStyle?: AiToneStyle;
  }) {
    const { userId, workspaceId, campaignId, leadId } = params;

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId, workspace: { userId } },
      include: {
        workspace: {
          include: { user: { select: { id: true, name: true, role: true, planId: true } } }
        }
      }
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
      where: { id: leadId, campaignId }
    });

    if (!lead) {
      throw new Error('Lead não encontrado nesta campanha.');
    }

    const campaignOffer = (campaign as any).aiOfferDescription;
    const campaignTone = (campaign as any).aiToneStyle;
    const offerDescription = (params.offerDescription || campaignOffer || '').trim();
    if (offerDescription.length < 5) {
      throw new Error('Informe a proposta/oferta com pelo menos 5 caracteres.');
    }

    const toneStyle: AiToneStyle = params.toneStyle || (campaignTone as AiToneStyle) || 'CONSULTATIVE';

    // Reserva 1 crédito
    const idempotencyKey = `ai_single_${leadId}_${randomUUID()}`;
    const reservation = await CreditWalletService.reserveCredits({
      userId,
      amount: 1,
      sourceType: 'AI_ASSISTANT',
      sourceId: campaignId,
      idempotencyKey,
      description: `Regeneração IA para lead: ${lead.title}`,
    });

    try {
      const copy = await this.callOpenAiApi({
        leadTitle: lead.title,
        phone: lead.phone,
        website: lead.website,
        neighborhood: lead.neighborhood,
        senderName: user.name || campaign.workspace.name || 'Especialista',
        senderCompany: campaign.workspace.name || 'Nossa Empresa',
        offerDescription,
        toneStyle,
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          messageContent: copy,
          aiGenerated: true,
          aiGeneratedAt: new Date(),
        } as any,
      });

      if (reservation.reservationId) {
        await CreditWalletService.settleReservation({
          reservationId: reservation.reservationId,
          actualConsumedAmount: 1,
          description: `Regeneração IA para lead ${lead.title} concluída (1 crédito)`,
        });
      }

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
   */
  public static async updateLeadMessage(params: {
    userId: string;
    workspaceId: string;
    campaignId: string;
    leadId: string;
    messageContent: string;
  }) {
    const { userId, workspaceId, campaignId, leadId, messageContent } = params;

    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        campaignId,
        campaign: { workspaceId, workspace: { userId } }
      }
    });

    if (!lead) {
      throw new Error('Lead não encontrado ou não pertence ao seu workspace.');
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        messageContent: messageContent.trim() || null,
      },
    });

    return updated;
  }
}
