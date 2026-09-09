import { CheckCircle2, Zap, ShieldCheck, ArrowRight } from "lucide-react";
import { CAKTO_CHECKOUT_URL, OFFICIAL_PLAN } from "@/lib/constants";

export function PricingSection() {
  return (
    <section id="planos" className="py-24 bg-[#07080B] relative overflow-hidden">
      {/* Luz ambiente de fundo roxa/azul */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-purple-600/10 blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full badge-purple text-xs font-semibold">
            <Zap size={14} />
            <span>Assinatura Simples e Direta</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            Acesso completo a todas as ferramentas
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Sem pegadinhas, sem cobrança por mensagem disparada e com ativação imediata.
          </p>
        </div>

        {/* Card de Preço Oficial */}
        <div className="max-w-lg mx-auto tech-card rounded-3xl p-6 sm:p-9 border border-purple-500/40 shadow-2xl relative shadow-purple-950/20">
          {/* Badge Superior Flutuante */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[11px] font-bold tracking-wider uppercase shadow-md shadow-purple-900/40 flex items-center gap-1.5">
            <span>Acesso Total Ilimitado</span>
          </div>

          {/* Cabeçalho do Plano */}
          <div className="text-center pt-2 pb-6 border-b border-white/[0.08] space-y-2">
            <h3 className="text-xl font-bold text-white tracking-tight">
              {OFFICIAL_PLAN.name}
            </h3>
            <p className="text-xs text-slate-400">
              {OFFICIAL_PLAN.description}
            </p>

            <div className="pt-3 flex items-baseline justify-center gap-1">
              <span className="text-sm font-semibold text-slate-400">{OFFICIAL_PLAN.currency}</span>
              <span className="text-4xl sm:text-5xl font-black text-white tracking-tight font-mono">
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
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              Tudo o que está incluso no seu acesso:
            </span>
            <ul className="space-y-2.5">
              {OFFICIAL_PLAN.features.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-200">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-tight">{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Botão de Checkout Oficial Cakto */}
          <div className="space-y-3 pt-2">
            <a
              href={CAKTO_CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full btn-tech-primary py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 text-center"
            >
              <span>Contratar Acesso Agora</span>
              <ArrowRight size={16} />
            </a>

            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 text-center">
              <ShieldCheck size={14} className="text-purple-400" />
              <span>Pagamento 100% seguro processado via Cakto</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
