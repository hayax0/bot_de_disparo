"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, Cloud, History } from "lucide-react";
import { LiveWhatsAppMockup } from "./LiveWhatsAppMockup";

export function HeroSection() {
  return (
    <section className="relative pt-24 pb-14 sm:pt-32 sm:pb-20 overflow-hidden">
      {/* Luz ambiente sutil de fundo fosco */}
      <div className="hidden sm:block absolute top-1/4 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-[350px] bg-gradient-to-b from-emerald-500/[0.04] via-slate-500/[0.02] to-transparent blur-[140px] pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Lado Esquerdo: Mensagem de Conversão */}
          <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
            {/* Badge de Destaque Técnico */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-300 text-xs font-mono font-medium tracking-tight">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span>Automação com Cadência Humana via WhatsApp</span>
            </div>

            {/* Headline de Alto Contraste */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.12] text-balance">
              Transforme o WhatsApp em um{" "}
              <span className="text-emerald-400">
                canal ativo de novos clientes
              </span>
            </h1>

            {/* Subheadline Objetiva */}
            <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed font-normal">
              Importe listas de empresas, personalize mensagens com variáveis dinâmicas e automatize seus disparos com controle de ritmo humano. Execução 24/7 na nuvem, sem você precisar deixar o computador ligado.
            </p>

            {/* CTAs de Alta Conversão com Física de Clique */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 pt-1">
              <Link
                href="/register"
                className="w-full sm:w-auto landing-btn-emerald px-7 py-3.5 text-sm font-semibold flex items-center justify-center gap-2 text-center focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
              >
                <span>Começar Agora</span>
                <ArrowRight size={15} />
              </Link>

              <a
                href="#como-funciona"
                className="w-full sm:w-auto landing-btn-secondary px-6 py-3.5 text-sm font-medium flex items-center justify-center gap-2 text-center focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
              >
                <span>Ver Como Funciona</span>
              </a>
            </div>

            {/* Pontos de Confiança Reais */}
            <div className="pt-3 flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-5 text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
                <span>Intervalos humanos de 45s a 120s</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Cloud size={14} className="text-slate-400 shrink-0" />
                <span>Execução 100% em nuvem</span>
              </div>
              <div className="flex items-center gap-1.5">
                <History size={14} className="text-slate-400 shrink-0" />
                <span>Histórico para não repetir contatos</span>
              </div>
            </div>
          </div>

          {/* Lado Direito: Simulador Visual Interativo */}
          <div className="lg:col-span-6 min-w-0 w-full flex justify-center">
            <LiveWhatsAppMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

