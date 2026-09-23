import { Layers, Cloud, History, Clock } from "lucide-react";

export function SocialProofBand() {
  const trustPillars = [
    {
      icon: Cloud,
      title: "Execução 100% em Nuvem",
      desc: "Suas campanhas continuam rodando 24/7 sem exigir que seu computador ou celular fiquem ligados.",
    },
    {
      icon: Layers,
      title: "Fila Inteligente BullMQ",
      desc: "Processamento sequencial assíncrono com Redis, garantindo ordem exata e alta estabilidade.",
    },
    {
      icon: Clock,
      title: "Cadência e Delays Naturais",
      desc: "Intervalos configuráveis entre cada disparo para simular o comportamento de um operador humano.",
    },
    {
      icon: History,
      title: "Memória por Workspace",
      desc: "Histórico consolidado que previne contatar a mesma empresa repetidas vezes.",
    },
  ];

  return (
    <section className="py-10 border-y border-white/[0.06] bg-[#090B10]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {trustPillars.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="flex items-start gap-3.5 group"
              >
                <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-emerald-400 shrink-0 group-hover:border-emerald-500/30 transition-colors">
                  <Icon size={18} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs sm:text-sm font-semibold text-white tracking-tight">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-normal">
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

