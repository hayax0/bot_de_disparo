"use client";

import { Cloud, Timer, MessageSquareCheck, ShieldCheck, Shuffle, History } from "lucide-react";

export function TextScrollReveal() {
  const pillars = [
    {
      icon: Cloud,
      tag: "Autonomia 24/7",
      title: "Execução 100% em Nuvem",
      desc: "Inicie sua campanha e feche o navegador ou desligue o computador. Os disparos continuam sendo processados na nuvem com estabilidade contínua.",
    },
    {
      icon: Timer,
      tag: "Fila Inteligente",
      title: "Cadência com Ritmo Humano",
      desc: "Delays aleatórios e pausas naturais entre envios para reproduzir a velocidade de digitação e envio de uma pessoa real.",
    },
    {
      icon: MessageSquareCheck,
      tag: "Mais Produtividade",
      title: "Foco Exclusivo nas Respostas",
      desc: "Sua equipe não gasta mais horas diárias copiando e colando. Concentre seu tempo apenas nas empresas que responderem interessadas.",
    },
  ];

  return (
    <section className="py-24 sm:py-32 bg-[#08090D] relative overflow-hidden manifesto-trigger">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Cabeçalho Aberto e Tipográfico */}
        <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Metodologia de Envio Responsável</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight text-balance">
            Prospecção ativa no WhatsApp{" "}
            <span className="text-slate-400 font-normal">
              sem a exaustão do copia e cola manual
            </span>
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed max-w-2xl mx-auto font-normal">
            Arquitetura de envio inteligente com fila assíncrona que executa o trabalho repetitivo, respeitando intervalos humanos e liberando seu time para fechar negócios.
          </p>
        </div>

        {/* 3 Pilares em Layout Aberto */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-12">
          {pillars.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-6 sm:p-7 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.14] transition-colors space-y-4 manifesto-stagger"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Icon size={18} />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.06]">
                    {item.tag}
                  </span>
                </div>

                <h3 className="text-base font-semibold text-white tracking-tight">
                  {item.title}
                </h3>

                <p className="text-xs text-slate-400 leading-relaxed font-normal">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Linha de Proteção e Recursos */}
        <div className="pt-6 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldCheck size={15} className="text-emerald-400 shrink-0" />
            <span className="font-semibold text-white">Recursos Nativos da Fila:</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-1.5">
              <History size={13} className="text-slate-400 shrink-0" />
              <span>Memória permanente de contatos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shuffle size={13} className="text-slate-400 shrink-0" />
              <span>Intervalos aleatórios entre envios</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
