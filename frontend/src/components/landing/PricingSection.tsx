import { CheckCircle2, Zap, ShieldCheck, ArrowRight, Sparkles } from "lucide-react";
import { LANDING_PLANS } from "@/lib/constants";

export function PricingSection() {
  return (
    <section id="planos" className="py-24 bg-[#08090D] relative overflow-hidden border-t border-white/[0.06]">
      {/* Sutil micro-brilho neutro de profundidade */}
      <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-emerald-500/[0.03] blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-medium">
            <Zap size={13} className="text-emerald-400" />
            <span>Planos Flexíveis & Transparentes</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-white tracking-tight">
            Escolha o plano ideal para sua operação
          </h2>
          <p className="text-sm text-slate-400 font-normal">
            Potencialize sua prospecção com Inteligência Artificial, busca de leads e disparos automatizados. Sem pegadinhas e com ativação imediata.
          </p>
        </div>

        {/* Grid com os 3 Planos Oficiais */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch max-w-6xl mx-auto">
          {LANDING_PLANS.map((plan) => {
            const isPopular = plan.isPopular;
            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 ${
                  isPopular
                    ? "bg-[#0D121B] border-2 border-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.12)] lg:-translate-y-2"
                    : "bg-[#0A0D14] border border-white/[0.08] hover:border-white/[0.18]"
                }`}
              >
                {/* Badge Destaque para o Plano Mais Popular */}
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-emerald-500 text-slate-950 text-xs font-bold tracking-wider uppercase flex items-center gap-1.5 shadow-md">
                    <Sparkles size={13} />
                    <span>Mais Escolhido</span>
                  </div>
                )}

                {/* Conteúdo Superior */}
                <div>
                  <div className="space-y-1.5 pb-5 border-b border-white/[0.08]">
                    <h3 className="text-xl font-bold text-white tracking-tight flex items-center justify-between">
                      <span>{plan.name}</span>
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed min-h-[36px]">
                      {plan.description}
                    </p>

                    {/* Preço */}
                    <div className="pt-3 flex items-baseline gap-1">
                      <span className="text-sm font-semibold text-slate-400">{plan.currency}</span>
                      <span className="text-4xl sm:text-5xl font-black text-white tracking-tight font-mono tabular-nums">
                        {plan.price}
                      </span>
                      <span className="text-xs font-medium text-slate-400">{plan.period}</span>
                    </div>

                    <span className="inline-block text-[11px] text-emerald-400 font-medium bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 mt-1">
                      {plan.paymentNote}
                    </span>
                  </div>

                  {/* Franquias em Destaque */}
                  <div className="py-4 border-b border-white/[0.08] grid grid-cols-2 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-[10px] text-slate-400 block uppercase font-mono">Disparos</span>
                      <span className="text-xs font-bold text-white mt-0.5 block">{plan.monthlyDispatches.split(" ")[0]} /mês</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/15">
                      <span className="text-[10px] text-emerald-400 block uppercase font-mono">Créditos IA</span>
                      <span className="text-xs font-bold text-emerald-300 mt-0.5 block">{plan.monthlyCredits.split(" ")[0]} IA</span>
                    </div>
                  </div>

                  {/* Lista de Recursos */}
                  <div className="py-5 space-y-3">
                    <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block font-mono">
                      Incluso no plano:
                    </span>
                    <ul className="space-y-2.5">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-200">
                          <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Botão de Ação Direto para o Checkout da Cakto */}
                <div className="pt-4 space-y-3">
                  <a
                    href={plan.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full py-3.5 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 text-center transition-all ${
                      isPopular
                        ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20"
                        : "bg-white/10 hover:bg-white/15 text-white border border-white/15"
                    }`}
                  >
                    <span>Assinar Plano {plan.name}</span>
                    <ArrowRight size={15} />
                  </a>

                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 text-center">
                    <ShieldCheck size={13} className="text-emerald-400" />
                    <span>Ativação automática via PIX ou Cartão</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé Informativo */}
        <div className="mt-14 max-w-3xl mx-auto p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
          <p className="text-xs text-slate-400 leading-relaxed">
            Cada mensagem gerada ou refinada com a Inteligência Artificial consome 1 crédito. Edições manuais são gratuitas.
            A busca de empresas utiliza sua própria chave Apify pessoal com custos direto no provedor.
            Cancelamento simples a qualquer momento, sem fidelidade.
          </p>
        </div>
      </div>
    </section>
  );
}

