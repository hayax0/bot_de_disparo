import Link from "next/link";
import { CheckCircle2, Zap, ShieldCheck, ArrowRight } from "lucide-react";
import { OFFICIAL_PLAN } from "@/lib/constants";

export function PricingSection() {
  return (
    <section id="planos" className="py-24 bg-[#08090D] relative overflow-hidden border-t border-white/[0.06]">
      {/* Sutil micro-brilho neutro de profundidade */}
      <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[260px] bg-emerald-500/[0.03] blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-medium">
            <Zap size={13} className="text-emerald-400" />
            <span>Assinatura Direta & Transparente</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-white tracking-tight">
            Acesso completo a todas as ferramentas
          </h2>
          <p className="text-sm text-slate-400 font-normal">
            Sem pegadinhas, sem cobrança por mensagem disparada e com ativação imediata.
          </p>
        </div>

        {/* Card de Preço Oficial - Ponto Focal 3 */}
        <div className="max-w-lg mx-auto focal-card rounded-3xl p-6 sm:p-9 relative">
          {/* Badge Superior */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-white/[0.08] border border-white/[0.12] text-emerald-400 text-[11px] font-semibold tracking-wider uppercase backdrop-blur-md flex items-center gap-1.5">
            <span>Acesso Total Ilimitado</span>
          </div>

          {/* Cabeçalho do Plano */}
          <div className="text-center pt-2 pb-6 border-b border-white/[0.08] space-y-2">
            <h3 className="text-xl font-semibold text-white tracking-tight">
              {OFFICIAL_PLAN.name}
            </h3>
            <p className="text-xs text-slate-400">
              {OFFICIAL_PLAN.description}
            </p>

            <div className="pt-3 flex items-baseline justify-center gap-1">
              <span className="text-sm font-semibold text-slate-400">{OFFICIAL_PLAN.currency}</span>
              <span className="text-4xl sm:text-5xl font-black text-white tracking-tight font-mono tabular-nums">
                {OFFICIAL_PLAN.price}
              </span>
              <span className="text-xs font-medium text-slate-400">{OFFICIAL_PLAN.period}</span>
            </div>
            <span className="inline-block text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              {OFFICIAL_PLAN.paymentNote}
            </span>
          </div>

          {/* Lista de Funcionalidades Reais Inclusas */}
          <div className="py-6 space-y-3">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Tudo o que está incluso no seu acesso:
            </span>
            <ul className="space-y-2.5">
              {OFFICIAL_PLAN.features.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-200">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Botão de Cadastro & Início */}
          <div className="space-y-3 pt-2">
            <Link
              href="/register"
              className="w-full landing-btn-emerald py-3.5 text-sm font-semibold flex items-center justify-center gap-2 text-center focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
            >
              <span>Criar Minha Conta & Começar</span>
              <ArrowRight size={15} />
            </Link>

            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 text-center">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Cadastro em menos de 1 minuto • Ativação via PIX ou Cartão</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

