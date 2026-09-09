import { Layers, Cloud, History, ShieldAlert } from "lucide-react";

export function SocialProofBand() {
  const trustPillars = [
    {
      icon: Cloud,
      title: "Execução 100% em Nuvem",
      desc: "Suas campanhas continuam rodando 24/7 sem exigir que seu computador ou celular fiquem ligados.",
    },
    {
      icon: Layers,
      title: "Fila Inteligente de Mensagens",
      desc: "Arquitetura com fila assíncrona que processa envio por envio com garantia de ordem e estabilidade.",
    },
    {
      icon: ShieldAlert,
      title: "Cadência Humana Anti-Bloqueio",
      desc: "Delays aleatórios configuráveis para manter intervalos naturais e consistentes entre cada contato.",
    },
    {
      icon: History,
      title: "Histórico Permanente por Workspace",
      desc: "Evita o constrangimento de prospectar o mesmo número repetidas vezes, mesmo em listas novas.",
    },
  ];

  return (
    <section className="py-8 border-y border-white/[0.07] bg-[#0A0C13]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {trustPillars.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="flex items-start gap-3.5 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]"
              >
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                  <Icon size={18} />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-xs sm:text-sm font-bold text-white leading-tight">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
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
