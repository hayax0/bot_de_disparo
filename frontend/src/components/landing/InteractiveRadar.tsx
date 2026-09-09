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
    desc: "Importe contatos extraídos do Google Maps ou planilhas CSV/JSON com dados de nicho, telefone e website.",
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
    detail: "Reutilização automática da última copy utilizada e suporte a variáveis como {nome} e {empresa}.",
  },
  {
    id: 4,
    title: "4. Fila Inteligente (BullMQ)",
    tag: "Motor",
    desc: "Os leads são injetados em uma fila assíncrona gerenciada por Redis. Cada disparo recebe um identificador determinístico.",
    icon: Cpu,
    detail: "Evita duplicidade de tarefas e garante a ordem exata de execução.",
  },
  {
    id: 5,
    title: "5. Disparo com Cadência Humana",
    tag: "Execução",
    desc: "A plataforma aplica delays aleatórios entre cada envio (ex: 45s a 90s) para simular o comportamento humano no WhatsApp.",
    icon: Send,
    detail: "Variação dinâmica de saudações via Spintax para que mensagens consecutivas não fiquem idênticas.",
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
    <section id="como-funciona" className="py-20 bg-[#07080B] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho da Seção */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <ShieldCheck size={14} />
            <span>Fluxo Real da Plataforma</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            Como a prospecção funciona passo a passo
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Da importação dos contatos até a entrega final no WhatsApp, tudo é orquestrado com precisão técnica e segurança de envio.
          </p>
        </div>

        {/* Grade de Navegação das Etapas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-8">
          {PIPELINE_STEPS.map((step) => {
            const isSelected = activeStep === step.id;
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                className={`p-3 rounded-xl text-left border transition-all flex flex-col justify-between gap-3 ${
                  isSelected
                    ? "bg-[#171B2B] border-purple-500/60 shadow-lg shadow-purple-500/15"
                    : "bg-[#0D101A] border-white/[0.06] hover:border-purple-500/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`p-2 rounded-lg ${
                      isSelected
                        ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold"
                        : "bg-white/[0.05] text-slate-300"
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">0{step.id}</span>
                </div>
                <div>
                  <span
                    className={`text-xs font-bold block truncate ${
                      isSelected ? "text-purple-300" : "text-slate-300"
                    }`}
                  >
                    {step.title.split(". ")[1]}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">{step.tag}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Card de Detalhe da Etapa Selecionada */}
        <div className="tech-card rounded-2xl p-6 sm:p-8 border border-white/[0.08] relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-8 space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-bold font-mono">
                  ETAPA 0{current.id}
                </span>
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  {current.tag}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {current.title}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                {current.desc}
              </p>
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-2.5 text-xs text-emerald-300">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                <span>{current.detail}</span>
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col items-center justify-center p-6 bg-black/50 rounded-xl border border-white/[0.05] text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-inner">
                <StepIcon size={26} />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-white block">Arquitetura Integrada</span>
                <span className="text-[11px] text-slate-400 block">
                  Automação com segurança de envio
                </span>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  disabled={activeStep === 1}
                  onClick={() => setActiveStep((prev) => Math.max(1, prev - 1))}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <button
                  disabled={activeStep === PIPELINE_STEPS.length}
                  onClick={() => setActiveStep((prev) => Math.min(PIPELINE_STEPS.length, prev + 1))}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-tech-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  <span>Próximo</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
