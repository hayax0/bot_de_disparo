"use client";

export function TextScrollReveal() {
  const statement =
    "Prospecção ativa no WhatsApp não precisa ser um processo cansativo de copiar e colar mensagens o dia inteiro. Criamos uma esteira inteligente em nuvem que automatiza seus disparos com ritmo humano, variáveis dinâmicas e proteção de histórico para sua equipe focar apenas em quem responder.";

  const words = statement.split(" ");

  return (
    <section className="py-24 sm:py-32 bg-[#090B12] border-y border-white/[0.06] relative overflow-hidden gsap-text-scrub-trigger">
      {/* Glow de fundo sutil violeta e índigo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[280px] bg-purple-600/10 blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-semibold tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          <span>A Nova Forma de Prospectar</span>
        </div>

        <p className="gsap-text-scrub text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.3] select-none">
          {words.map((word, idx) => (
            <span key={idx} className="inline-block mr-[0.28em] transition-colors duration-150">
              {word}
            </span>
          ))}
        </p>

        <div className="pt-4 flex items-center justify-center gap-2 text-xs sm:text-sm text-slate-400">
          <span className="text-purple-400 font-semibold">Sem robôs genéricos.</span>
          <span>•</span>
          <span className="text-indigo-400 font-semibold">Sem risco de recontato repetido.</span>
          <span>•</span>
          <span className="text-slate-300 font-semibold">100% no seu controle.</span>
        </div>
      </div>
    </section>
  );
}
