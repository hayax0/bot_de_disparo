"use client";

import { useState } from "react";
import {
  Search,
  CheckCircle2,
  FolderGit2,
  Cpu,
  Send,
  BarChart3,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

interface StepItem {
  id: number;
  title: string;
  tag: string;
  desc: string;
  icon: typeof Search;
  detail: string;
}

const PIPELINE_STEPS: StepItem[] = [
  {
    id: 1,
    title: "1. Captação de Leads",
    tag: "Entrada",
    desc: "Importe contatos de empresas (via extração Google Maps ou arquivos CSV/JSON) com dados de nicho, telefone e website.",
    icon: Search,
    detail: "Suporte nativo a listas de empresas com telefone, website e classificação.",
  },
  {
    id: 2,
    title: "2. Validação & Higienização",
    tag: "Segurança",
    desc: "O sistema formata os números no padrão internacional do WhatsApp e checa no histórico se o número já foi contatado.",
    icon: CheckCircle2,
    detail: "Bloqueio automático de disparos repetidos para o mesmo cliente dentro do seu Workspace.",
  },
  {
    id: 3,
    title: "3. Organização da Campanha",
    tag: "Estratégia",
    desc: "Crie campanhas segmentadas com templates dedicados: mensagens personalizadas para empresas com site ou sem site.",
    icon: FolderGit2,
    detail: "Reutilização automática da última copy utilizada e suporte a variáveis dinâmicas como {nome} e {empresa}.",
  },
  {
    id: 4,
    title: "4. Fila Inteligente BullMQ",
    tag: "Motor",
    desc: "Os leads são injetados em uma fila assíncrona gerenciada por Redis. Cada disparo recebe um identificador determinístico.",
    icon: Cpu,
    detail: "Garante a ordem exata de execução e elimina duplicidade de processamento.",
  },
  {
    id: 5,
    title: "5. Disparo com Cadência Humana",
    tag: "Execução",
    desc: "A plataforma aplica delays aleatórios entre cada envio (ex: 45s a 120s) para simular o comportamento de um operador real.",
    icon: Send,
    detail: "Variação dinâmica de saudações para que mensagens consecutivas não fiquem idênticas.",
  },
  {
    id: 6,
    title: "6. Acompanhamento no Painel",
    tag: "Métricas",
    desc: "Monitore ao vivo o progresso dos disparos: total de pendentes, mensagens entregues com sucesso e eventuais falhas.",
    icon: BarChart3,
    detail: "Acesso a logs detalhados e possibilidade de pausar ou retomar a campanha a qualquer momento.",
  },
];

export function InteractiveRadar() {
  const [activeStep, setActiveStep] = useState<number>(1);

  const current = PIPELINE_STEPS.find((s) => s.id === activeStep) || PIPELINE_STEPS[0];
  const StepIcon = current.icon;

  return (
    <section id="como-funciona" className="py-24 bg-[#08090D] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho da Seção */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium">
            <ShieldCheck size={14} />
            <span>Fluxo Real da Plataforma</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            Como a prospecção funciona passo a passo
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Da importação dos contatos até a entrega final no WhatsApp, tudo é orquestrado com precisão técnica e cadência natural.
          </p>
        </div>

        {/* Grade de Navegação das Etapas */}
        <div
          role="tablist"
          aria-label="Etapas da esteira de prospecção"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 mb-8"
        >
          {PIPELINE_STEPS.map((step) => {
            const isSelected = activeStep === step.id;
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                role="tab"
                type="button"
                aria-selected={isSelected}
                onClick={() => setActiveStep(step.id)}
                className={`p-3.5 rounded-xl text-left border transition-all flex flex-col justify-between gap-3 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none cursor-pointer ${
                  isSelected
                    ? "bg-white/[0.06] border-emerald-500/40 text-white shadow-sm"
                    : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`p-1.5 rounded-lg border ${
                      isSelected
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                        : "bg-white/[0.04] border-white/[0.06] text-slate-400"
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">0{step.id}</span>
                </div>
                <div>
                  <span
                    className={`text-xs font-semibold block truncate ${
                      isSelected ? "text-emerald-300" : "text-slate-300"
                    }`}
                  >
                    {step.title.split(". ")[1]}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">{step.tag}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Card de Detalhe da Etapa Selecionada */}
        <div className="rounded-2xl p-6 sm:p-8 bg-[#0D1018] border border-white/[0.08] relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8 space-y-4">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold font-mono">
                  ETAPA 0{current.id}
                </span>
                <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                  {current.tag}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {current.title}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed max-w-2xl font-normal">
                {current.desc}
              </p>
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2.5 text-xs text-emerald-300">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                <span>{current.detail}</span>
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col items-center justify-center p-6 bg-black/40 rounded-xl border border-white/[0.05] text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                <StepIcon size={24} />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-white block">Arquitetura de Envio</span>
                <span className="text-[11px] text-slate-400 block font-mono">
                  Controle de cadência humana
                </span>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={activeStep === 1}
                  onClick={() => setActiveStep((prev) => Math.max(1, prev - 1))}
                  className="landing-btn-secondary px-3 py-1.5 text-xs disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={activeStep === PIPELINE_STEPS.length}
                  onClick={() => setActiveStep((prev) => Math.min(PIPELINE_STEPS.length, prev + 1))}
                  className="landing-btn-emerald px-3.5 py-1.5 text-xs disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
                >
                  <span>Próximo</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

