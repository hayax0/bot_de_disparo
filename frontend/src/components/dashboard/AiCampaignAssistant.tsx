"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import axios from "axios";
import {
  Sparkles,
  X,
  CheckCircle2,
  RefreshCw,
  Coins,
  Globe,
  MapPin,
  AlertCircle,
} from "lucide-react";

export type AiToneStyle = "CONSULTATIVE" | "FRIENDLY" | "DIRECT" | "SPECIAL_OFFER" | "URGENT_OFFER";

interface AiGenerateModalProps {
  campaignId: string;
  campaignName: string;
  pendingLeadsCount: number;
  availableCredits: number;
  initialOffer?: string | null;
  initialTone?: string | null;
  onSuccess: () => void;
  onClose: () => void;
  addToast: (type: "success" | "error" | "info", message: string) => void;
}

interface ActiveOperation {
  id: string;
  status: string;
  totalLeads: number;
  completedLeads: number;
  failedLeads: number;
  creditsConsumed?: number;
}

export function AiGenerateModal({
  campaignId,
  campaignName,
  pendingLeadsCount,
  availableCredits,
  initialOffer = "",
  initialTone = "CONSULTATIVE",
  onSuccess,
  onClose,
  addToast,
}: AiGenerateModalProps) {
  const [offerDescription, setOfferDescription] = useState(initialOffer || "");
  const [toneStyle, setToneStyle] = useState<AiToneStyle>((initialTone as AiToneStyle) || "CONSULTATIVE");
  const [submitting, setSubmitting] = useState(false);
  const [activeOp, setActiveOp] = useState<ActiveOperation | null>(null);
  const [batchIdempotencyKey, setBatchIdempotencyKey] = useState<string>(() => `ai_batch_${campaignId}_${Date.now()}`);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const creditsNeeded = Math.min(pendingLeadsCount, 200);
  const hasEnoughCredits = availableCredits >= creditsNeeded;

  const pollOperationStatus = useCallback(async (opId: string) => {
    try {
      const res = await api.get(`/campaigns/${campaignId}/ai-operations/${opId}`);
      const data: ActiveOperation = res.data;
      setActiveOp(data);

      if (data.status === "COMPLETED" || data.status === "FAILED" || data.status === "PARTIAL") {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setSubmitting(false);

        if (data.status === "COMPLETED" || data.status === "PARTIAL") {
          addToast("success", `Personalização concluída! ${data.completedLeads} abordagens geradas com sucesso.`);
          onSuccess();
        } else {
          addToast("error", "Não foi possível gerar as mensagens para os leads.");
        }
      }
    } catch {
      // Ignora erro momentâneo de polling de rede
    }
  }, [campaignId, onSuccess, addToast]);

  // Checa se já existe uma operação em andamento para esta campanha
  useEffect(() => {
    let mounted = true;
    api.get(`/campaigns/${campaignId}/ai-operations/active`)
      .then((res) => {
        if (mounted && res.data?.activeOperation) {
          setActiveOp(res.data.activeOperation);
          setSubmitting(true);
          pollingRef.current = setInterval(() => {
            pollOperationStatus(res.data.activeOperation.id);
          }, 2000);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [campaignId, pollOperationStatus]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerDescription.trim() || offerDescription.trim().length < 5) {
      addToast("error", "Descreva sua oferta com pelo menos 5 caracteres.");
      return;
    }

    if (creditsNeeded <= 0) {
      addToast("info", "Não há leads pendentes nesta campanha para gerar mensagens.");
      return;
    }

    if (!hasEnoughCredits) {
      addToast("error", `Saldo insuficiente. Você precisa de ${creditsNeeded} créditos, mas possui ${availableCredits}.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/campaigns/${campaignId}/ai-generate`, {
        offerDescription: offerDescription.trim(),
        toneStyle,
        idempotencyKey: batchIdempotencyKey,
      });

      const opId = res.data.operationId;
      setActiveOp({
        id: opId,
        status: res.data.status,
        totalLeads: res.data.totalLeads,
        completedLeads: res.data.completedLeads || 0,
        failedLeads: res.data.failedLeads || 0,
      });

      // Inicia polling de progresso do BullMQ
      if (res.data.status === "COMPLETED") {
        addToast("success", `Operação concluída! ${res.data.completedLeads} abordagens geradas.`);
        setSubmitting(false);
        onSuccess();
        onClose();
        return;
      }

      pollingRef.current = setInterval(() => {
        pollOperationStatus(opId);
      }, 2000);
    } catch (err: unknown) {
      setSubmitting(false);
      let msg = "Erro ao iniciar geração assíncrona com IA.";
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.error || msg;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      addToast("error", msg);
      // Em caso de falha de validação ou conflito, gera nova chave para próxima tentativa
      setBatchIdempotencyKey(`ai_batch_${campaignId}_${Date.now()}`);
    }
  };

  const isRunning = activeOp && (activeOp.status === "PENDING" || activeOp.status === "PROCESSING");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="dash-card border border-white/10 rounded-3xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-white">Personalizar Abordagens com IA</h2>
              <p className="text-xs text-slate-400 mt-0.5">Campanha: {campaignName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {isRunning ? (
          <div className="p-6 space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto animate-pulse">
              <RefreshCw size={24} className="animate-spin" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Processando lote em segundo plano</h3>
              <p className="text-xs text-slate-400 mt-1">
                A IA está personalizando suas mensagens individualmente. Você pode fechar esta janela se quiser; o progresso continuará rodando.
              </p>
            </div>

            <div className="w-full bg-white/[0.06] rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                style={{
                  width: `${activeOp.totalLeads > 0 ? Math.round((activeOp.completedLeads / activeOp.totalLeads) * 100) : 5}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>{activeOp.completedLeads} de {activeOp.totalLeads} concluídos</span>
              {activeOp.failedLeads > 0 && <span className="text-amber-400">{activeOp.failedLeads} falhas</span>}
              <span className="font-semibold text-white">
                {activeOp.totalLeads > 0 ? Math.round((activeOp.completedLeads / activeOp.totalLeads) * 100) : 0}%
              </span>
            </div>

            <div className="pt-3 border-t border-white/[0.08] flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] transition-all cursor-pointer"
              >
                Acompanhar depois
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleGenerate} className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
            {/* Informações da Carteira de Créditos */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Coins size={16} className="text-amber-400" />
                <div>
                  <p className="text-xs text-slate-300 font-medium">Consumo de Créditos de IA</p>
                  <p className="text-[11px] text-slate-500">1 crédito por mensagem gerada e entregue</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-white tabular-nums">
                  {creditsNeeded} de {availableCredits} créditos
                </span>
                <p className={`text-[10px] ${hasEnoughCredits ? "text-emerald-400" : "text-red-400 font-medium"}`}>
                  {hasEnoughCredits ? "Saldo disponível" : "Saldo insuficiente"}
                </p>
              </div>
            </div>

            {/* O que sua empresa oferece */}
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                O que sua empresa oferece? <span className="text-emerald-400">*</span>
              </label>
              <textarea
                rows={3}
                value={offerDescription}
                onChange={(e) => setOfferDescription(e.target.value)}
                placeholder="Ex.: Criação de landing pages e sites rápidos para atrair mais clientes locais, com otimização no Google e botão de WhatsApp."
                className="w-full text-xs dash-input rounded-xl p-3 bg-white/[0.03] border border-white/[0.08] text-white placeholder-slate-500 focus:border-emerald-500/50"
                disabled={submitting}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                A IA combinará essa oferta com os dados de cada lead (site, bairro e segmento) para criar abordagens exclusivas.
              </p>
            </div>

            {/* Tom de Voz / Estilo de Abordagem */}
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-2">
                Estilo da Abordagem
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    key: "CONSULTATIVE" as AiToneStyle,
                    title: "🎯 Consultivo",
                    desc: "Profissional, diagnóstico e foco em agregar valor",
                  },
                  {
                    key: "FRIENDLY" as AiToneStyle,
                    title: "🤝 Amigável",
                    desc: "Próximo, acolhedor e descontraído",
                  },
                  {
                    key: "DIRECT" as AiToneStyle,
                    title: "⚡ Direto ao Ponto",
                    desc: "Enxuto, rápido e sem rodeios (2 a 3 frases)",
                  },
                  {
                    key: "SPECIAL_OFFER" as AiToneStyle,
                    title: "🔥 Oferta Especial",
                    desc: "Gatilho de oportunidade e exclusividade regional",
                  },
                ].map((t) => (
                  <button
                    type="button"
                    key={t.key}
                    onClick={() => setToneStyle(t.key)}
                    disabled={submitting}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      toneStyle === t.key
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-sm"
                        : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:bg-white/[0.04]"
                    }`}
                  >
                    <p className="text-xs font-semibold text-white">{t.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || creditsNeeded <= 0 || !hasEnoughCredits || !offerDescription.trim()}
                className="dash-btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Iniciando lote...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Gerar para {creditsNeeded} Leads ({creditsNeeded} créditos)
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

interface LeadMessageModalProps {
  campaignId: string;
  lead: {
    id: string;
    title: string;
    phone: string;
    status?: string;
    sendStartedAt?: string | null;
    website?: string | null;
    neighborhood?: string | null;
    messageContent?: string | null;
    aiGenerated?: boolean;
  };
  availableCredits: number;
  onSave: (leadId: string, newContent: string) => void;
  onClose: () => void;
  addToast: (type: "success" | "error" | "info", message: string) => void;
}

export function LeadMessageModal({
  campaignId,
  lead,
  availableCredits,
  onSave,
  onClose,
  addToast,
}: LeadMessageModalProps) {
  const [content, setContent] = useState(lead.messageContent || "");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenKey, setRegenKey] = useState<string>(() => `ai_single_${lead.id}_${Date.now()}`);

  const isAlreadySentOrSending =
    lead.status &&
    (lead.status !== "PENDING" || lead.sendStartedAt !== null && lead.sendStartedAt !== undefined);

  const handleSave = async () => {
    if (isAlreadySentOrSending) {
      addToast("error", "Não é possível alterar a mensagem de um lead cujo envio já foi iniciado ou concluído.");
      return;
    }

    setSaving(true);
    try {
      await api.put(`/campaigns/${campaignId}/leads/${lead.id}/message`, {
        messageContent: content,
      });
      addToast("success", "Mensagem do lead atualizada com sucesso!");
      onSave(lead.id, content);
      onClose();
    } catch (err: unknown) {
      let msg = "Erro ao atualizar mensagem do lead.";
      if (axios.isAxiosError(err)) msg = err.response?.data?.error || msg;
      addToast("error", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (isAlreadySentOrSending) {
      addToast("error", "Não é possível regerar a mensagem de um lead que já foi enviado.");
      return;
    }

    if (availableCredits < 1) {
      addToast("error", "Você não possui créditos suficientes para regerar.");
      return;
    }

    setRegenerating(true);
    try {
      const res = await api.post(`/campaigns/${campaignId}/leads/${lead.id}/ai-regenerate`, {
        idempotencyKey: regenKey,
      });
      const newCopy = res.data.messageContent;
      setContent(newCopy);
      onSave(lead.id, newCopy);
      addToast("success", "Nova mensagem gerada com sucesso pela IA! (1 crédito consumido)");
      // Cria nova chave estável para próxima solicitação intencional
      setRegenKey(`ai_single_${lead.id}_${Date.now()}`);
    } catch (err: unknown) {
      let msg = "Erro ao regerar mensagem.";
      if (axios.isAxiosError(err)) msg = err.response?.data?.error || msg;
      addToast("error", msg);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="dash-card border border-white/10 rounded-3xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">{lead.title}</h2>
              {lead.aiGenerated ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Sparkles size={10} /> IA Gerada
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
                  Template Padrão
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{lead.phone}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isAlreadySentOrSending && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
              <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-amber-300 font-semibold">Registro Histórico Protegido</p>
                <p className="text-[11px] text-amber-200/70 mt-0.5 leading-relaxed">
                  O envio desta mensagem já foi iniciado ou concluído (status: {lead.status}). A edição e regeração estão bloqueadas para preservar o histórico real enviado ao prospect.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {lead.website ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-medium border border-emerald-500/20">
                <Globe size={11} /> {lead.website}
              </span>
            ) : (
              <span className="text-slate-500">Sem site informado</span>
            )}
            {lead.neighborhood && (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <MapPin size={11} className="text-slate-500" /> {lead.neighborhood}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5 flex items-center justify-between">
              <span>Mensagem de Envio para WhatsApp</span>
              <span className="text-[10px] text-slate-500 font-normal">Edição manual não consome créditos</span>
            </label>
            <textarea
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={Boolean(isAlreadySentOrSending)}
              placeholder="Nenhuma mensagem gerada ainda. Esta campanha utilizará os templates padrões no disparo."
              className="w-full text-xs dash-input rounded-xl p-3 bg-white/[0.03] border border-white/[0.08] text-white placeholder-slate-500 focus:border-emerald-500/50 leading-relaxed font-sans disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="pt-2 flex items-center justify-between gap-2 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={Boolean(isAlreadySentOrSending) || regenerating || saving || availableCredits < 1}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Gera uma nova cópia usando 1 crédito de IA"
            >
              {regenerating ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  Regerando...
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  Regerar com IA (1 crédito)
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-all cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={Boolean(isAlreadySentOrSending) || saving || regenerating}
                className="dash-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} />
                    Salvar Alterações
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
