"use client";

import React, { useState } from "react";
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
} from "lucide-react";

export type AiToneStyle = "CONSULTATIVE" | "FRIENDLY" | "DIRECT" | "URGENT_OFFER";

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
  const [loading, setLoading] = useState(false);

  const creditsNeeded = Math.min(pendingLeadsCount, 200);
  const hasEnoughCredits = availableCredits >= creditsNeeded;

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

    setLoading(true);
    try {
      const res = await api.post(`/campaigns/${campaignId}/ai-generate`, {
        offerDescription: offerDescription.trim(),
        toneStyle,
      });

      addToast(
        "success",
        `Sucesso! ${res.data.generatedCount} abordagens personalizadas foram criadas com IA.`
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      let msg = "Erro ao gerar mensagens com IA.";
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.error || msg;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      addToast("error", msg);
    } finally {
      setLoading(false);
    }
  };

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
            disabled={loading}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleGenerate} className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
          {/* Informações da Carteira de Créditos */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Coins size={16} className="text-amber-400" />
              <div>
                <p className="text-xs text-slate-300 font-medium">Consumo de Créditos de IA</p>
                <p className="text-[11px] text-slate-500">1 crédito por mensagem gerada</p>
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
              disabled={loading}
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
                  key: "URGENT_OFFER" as AiToneStyle,
                  title: "🔥 Oferta Especial",
                  desc: "Gatilho de oportunidade e exclusividade regional",
                },
              ].map((t) => (
                <button
                  type="button"
                  key={t.key}
                  onClick={() => setToneStyle(t.key)}
                  disabled={loading}
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
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || creditsNeeded <= 0 || !hasEnoughCredits || !offerDescription.trim()}
              className="dash-btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Gerando abordagens...
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

  const handleSave = async () => {
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
    if (availableCredits < 1) {
      addToast("error", "Você não possui créditos suficientes para regerar.");
      return;
    }

    setRegenerating(true);
    try {
      const res = await api.post(`/campaigns/${campaignId}/leads/${lead.id}/ai-regenerate`);
      const newCopy = res.data.messageContent;
      setContent(newCopy);
      onSave(lead.id, newCopy);
      addToast("success", "Nova mensagem gerada com sucesso pela IA! (1 crédito consumido)");
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
              placeholder="Nenhuma mensagem gerada ainda. Esta campanha utilizará os templates padrões no disparo."
              className="w-full text-xs dash-input rounded-xl p-3 bg-white/[0.03] border border-white/[0.08] text-white placeholder-slate-500 focus:border-emerald-500/50 leading-relaxed font-sans"
            />
          </div>

          <div className="pt-2 flex items-center justify-between gap-2 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating || saving || availableCredits < 1}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
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
                disabled={saving || regenerating}
                className="dash-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
