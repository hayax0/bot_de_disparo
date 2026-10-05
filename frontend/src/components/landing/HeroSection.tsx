import { ArrowRight, Check, MapPin, Sparkles, Send } from "lucide-react";

export function HeroSection() {
  return (
    <section className="pt-32 pb-20 sm:pt-44 sm:pb-28">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
        <div>
          <p className="text-sm text-emerald-400 font-medium mb-6">Prospecção pelo WhatsApp</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.08] text-balance">
            Menos trabalho manual.<br /><span className="text-emerald-400">Mais tempo para conversar.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg leading-relaxed text-slate-300 max-w-lg">
            Encontre empresas, prepare mensagens com IA e organize os envios pelo WhatsApp. Tudo no mesmo lugar.
          </p>
          <a href="#planos" className="landing-btn-emerald inline-flex items-center justify-center gap-3 px-7 py-4 mt-8 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
            Escolher meu plano <ArrowRight size={17} />
          </a>
          <p className="mt-4 text-sm text-slate-400">A partir de R$ 27,99/mês. Cancele quando quiser.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#0D1117] p-6 sm:p-8" aria-label="Exemplo ilustrativo do fluxo de uma campanha">
          <div className="flex items-center justify-between gap-4 pb-6 border-b border-white/10">
            <span className="text-sm font-medium">Sua próxima campanha</span>
            <span className="text-xs text-slate-500">Exemplo</span>
          </div>
          <div className="space-y-7 py-7">
            <div className="flex gap-4"><MapPin className="text-emerald-400 shrink-0" size={20} /><div><p className="text-sm font-medium">Encontre quem você quer abordar</p><p className="text-sm text-slate-400 mt-1">Clínicas de estética · Rio de Janeiro</p></div></div>
            <div className="flex gap-4"><Sparkles className="text-emerald-400 shrink-0" size={20} /><div><p className="text-sm font-medium">Prepare uma mensagem com IA</p><p className="text-sm text-slate-400 mt-1">Revise o texto antes de enviar.</p></div></div>
            <div className="rounded-2xl rounded-tl-sm bg-emerald-500/10 border border-emerald-500/15 p-5 text-sm leading-relaxed text-slate-200">Olá, Ana! Trabalho com sites para clínicas e queria entender como vocês recebem novos agendamentos hoje.</div>
          </div>
          <div className="flex items-center gap-3 border-t border-white/10 pt-5 text-sm text-slate-300"><Send size={17} className="text-emerald-400" /> Envios com intervalos que você define <Check size={16} className="ml-auto text-emerald-400" /></div>
        </div>
      </div>
    </section>
  );
}
