"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { LiveWhatsAppMockup } from "./LiveWhatsAppMockup";

export function HeroSection() {
  return (
    <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
      {/* Luz ambiente de fundo violeta e índigo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-purple-600/15 via-indigo-600/10 to-transparent blur-[120px] pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Lado Esquerdo: Mensagem de Conversão */}
          <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
            {/* Badge de Destaque */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-300 text-xs font-semibold tracking-wide shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Plataforma de Prospecção Ativa via WhatsApp</span>
            </div>

            {/* Headline Magnética */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.15]">
              Transforme o WhatsApp em um{" "}
              <span className="bg-gradient-to-r from-purple-400 via-indigo-300 to-sky-400 bg-clip-text text-transparent">
                canal ativo de novos clientes
              </span>
            </h1>

            {/* Subheadline Objetiva */}
            <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Importe listas de empresas, personalize mensagens com variáveis dinâmicas e automatize seus disparos com controle de ritmo humano. Tudo executado 24/7 na nuvem, sem você precisar deixar o computador ligado.
            </p>

            {/* CTAs de Alta Conversão */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 pt-2">
              <Link
                href="/register"
                className="w-full sm:w-auto btn-tech-primary px-7 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-600/25"
              >
                <span>Começar Agora</span>
                <ArrowRight size={16} />
              </Link>

              <a
                href="#como-funciona"
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-sm font-semibold text-slate-200 bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 transition-all flex items-center justify-center gap-2"
              >
                <span>Ver Como Funciona</span>
              </a>
            </div>

            {/* Pontos de Confiança Reais */}
            <div className="pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-5 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-purple-400" />
                <span>Cadência e intervalos humanos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap size={15} className="text-indigo-400" />
                <span>Execução 100% em nuvem</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-sky-400" />
                <span>Histórico contra recontato</span>
              </div>
            </div>
          </div>

          {/* Lado Direito: Simulador Visual Interativo */}
          <div className="lg:col-span-6 w-full flex justify-center">
            <LiveWhatsAppMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
