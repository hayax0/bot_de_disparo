import { Layers, Cloud, History, Clock } from "lucide-react";

export function SocialProofBand() {
  const trustPillars = [
    {
      icon: Cloud,
      title: "Campanhas na nuvem",
      desc: "Depois de iniciar uma campanha, acompanhe o processamento pelo painel.",
    },
    {
      icon: Layers,
      title: "Mensagens com contexto",
      desc: "Use o perfil profissional e os dados disponíveis do lead para preparar abordagens com IA.",
    },
    {
      icon: Clock,
      title: "Ritmo configurável",
      desc: "Escolha os intervalos entre envios e acompanhe as etapas da campanha.",
    },
    {
      icon: History,
      title: "Histórico de contatos",
      desc: "Consulte contatos abordados e envios anteriores para organizar o acompanhamento.",
    },
  ];

  return (
    <section className="py-10 border-y border-white/[0.06] bg-[var(--studio-surface)]">
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
                  <p className="text-xs text-[var(--studio-muted)] leading-relaxed font-normal">
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

