"use client";

import { CloudLightning, Timer, MessageSquareCheck, ShieldCheck, Shuffle, History } from "lucide-react";

export function TextScrollReveal() {
  const pillars = [
    {
      icon: CloudLightning,
      iconColor: "text-purple-400 bg-purple-500/10 border-purple-500/20",
      tag: "Autonomia 24/7",
      title: "Execução 100% em Nuvem",
      desc: "Inicie sua campanha e feche o navegador ou desligue o PC. Seus disparos continuam sendo processados na nuvem com estabilidade contínua.",
    },
    {
      icon: Timer,
      iconColor: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
      tag: "Fila Inteligente",
      title: "Cadência com Ritmo Humano",
      desc: "Delays variáveis entre mensagens e intervalos configuráveis para reproduzir a velocidade natural de digitação e envio de uma pessoa real.",
    },
    {
      icon: MessageSquareCheck,
      iconColor: "text-sky-400 bg-sky-500/10 border-sky-500/20",
      tag: "Mais Conversões",
      title: "Foco Exclusivo nas Respostas",
      desc: "Sua equipe não gasta mais horas diárias abordando contatos frios um a um. Concentre seu tempo apenas nos leads que responderem e quiserem avançar.",
    },
  ];

  return (
    <section className="py-20 sm:py-28 bg-[#090B12] border-y border-white/[0.06] relative overflow-hidden manifesto-trigger">
      {/* Luz ambiente de fundo roxa e azul */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[320px] bg-gradient-to-r from-purple-600/10 via-indigo-600/10 to-sky-600/5 blur-[140px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Painel Principal do Manifesto Tecnológico */}
        <div className="tech-card rounded-3xl p-6 sm:p-10 lg:p-12 border border-purple-500/20 shadow-2xl relative shadow-purple-950/20 manifesto-stagger">
          {/* Cabeçalho */}
          <div className="max-w-3xl mx-auto text-center space-y-4 mb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full badge-purple text-xs font-semibold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Metodologia de Envio Responsável</span>
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Prospecção ativa no WhatsApp{" "}
              <span className="bg-gradient-to-r from-purple-400 via-indigo-300 to-sky-400 bg-clip-text text-transparent">
                sem a exaustão do copia e cola manual
              </span>
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl mx-auto">
              Desenvolvemos uma arquitetura de envio inteligente que automatiza o trabalho repetitivo, protegendo sua operação com cadência calculada e garantindo foco total no que gera receita: a resposta do cliente.
            </p>
          </div>

          {/* Grid dos 3 Pilares */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
            {pillars.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div
                  key={idx}
                  className="bg-black/40 rounded-2xl p-5 sm:p-6 border border-white/[0.06] hover:border-purple-500/30 transition-all space-y-3.5 manifesto-stagger"
                >
                  <div className="flex items-center justify-between">
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${item.iconColor}`}>
                      <Icon size={20} />
                    </div>
                    <span className="text-[10px] font-mono font-semibold text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                      {item.tag}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white tracking-tight">
                    {item.title}
                  </h3>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Faixa de Proteção Técnica Integrada */}
          <div className="pt-6 border-t border-white/[0.08] flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2 text-slate-300">
              <ShieldCheck size={16} className="text-purple-400 shrink-0" />
              <span className="font-semibold text-white">Garantias da Plataforma:</span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-1.5">
                <History size={14} className="text-indigo-400 shrink-0" />
                <span>Histórico persistente anti-recontato</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shuffle size={14} className="text-purple-400 shrink-0" />
                <span>Motor Spintax anti-repetição</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Variáveis personalizadas por lead</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
