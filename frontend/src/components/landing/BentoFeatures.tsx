import {
  Clock,
  History,
  QrCode,
  ShieldCheck,
  Bot,
  MapPin,
  Sparkles,
  Layers,
} from "lucide-react";

export function BentoFeatures() {
  return (
    <section id="recursos" className="py-24 bg-[#08090D] border-t border-white/[0.06] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-emerald-400">
            <Layers size={14} />
            <span>Recursos Nativos da Plataforma</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            Tecnologia de ponta: IA, busca ativa e envios humanos
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Uma esteira completa para você prospectar empresas, gerar copies únicas e fechar novos contratos todos os dias.
          </p>
        </div>

        {/* Bento Grid Assimétrico */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Card 1: Destaque IA (Span 8) */}
          <div className="md:col-span-8 bg-[#0D1018] rounded-2xl p-6 sm:p-8 flex flex-col justify-between border border-emerald-500/20 hover:border-emerald-500/40 transition-colors relative overflow-hidden group shadow-[0_0_30px_rgba(16,185,129,0.06)]">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Bot size={20} />
                </div>
                <span className="text-xs font-mono text-emerald-300 font-semibold uppercase tracking-wider flex items-center gap-1">
                  <Sparkles size={12} />
                  Agente de Inteligência Artificial
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Abordagens Persuasivas Sob Medida por Nicho
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl font-normal">
                Nosso assistente de IA analisa o nicho do lead, dados da empresa e a presença de site para redigir uma mensagem consultiva irresistível para cada contato. Sem textos genéricos ou frios.
              </p>
            </div>

            <div className="mt-8 pt-5 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                <span className="text-[10px] text-slate-500 block font-mono">Tecnologia</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">Motor de IA Integrado</span>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                <span className="text-[10px] text-slate-500 block font-mono">Consumo</span>
                <span className="text-sm font-bold text-white font-mono">1 Crédito / Copy</span>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                <span className="text-[10px] text-slate-500 block font-mono">Edição</span>
                <span className="text-sm font-bold text-emerald-400">100% Gratuita</span>
              </div>
            </div>
          </div>

          {/* Card 2: Busca Google Maps (Span 4) */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-white/[0.04] text-emerald-400 border border-white/[0.08] w-fit">
                <MapPin size={20} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Busca de Empresas no Google Maps
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                Encontre centenas de empresas locais por segmento e cidade. Importe telefones comerciais validados diretamente para suas campanhas em instantes com sua chave Apify.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-slate-300 font-mono">
              ✓ Leads frescos e verificados no Maps
            </div>
          </div>

          {/* Card 3: Cadência Humana (Span 4) */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-white/[0.04] text-slate-300 border border-white/[0.08] w-fit">
                <Clock size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Cadência Humana Anti-Bloqueio
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                Delays aleatórios inteligentes entre cada mensagem (45s a 120s), simulando a digitação humana natural e protegendo o seu número contra bloqueios.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-emerald-400 flex items-center gap-1.5 font-mono">
              <ShieldCheck size={14} />
              <span>Proteção e ritmo natural de envios</span>
            </div>
          </div>

          {/* Card 4: Histórico Permanente (Span 4) */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-white/[0.04] text-slate-300 border border-white/[0.08] w-fit">
                <History size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Histórico Permanente & Anti-Recontato
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                Registro histórico persistente por Workspace. Evite abordar contatos que já receberam mensagem anteriormente, mantendo sua comunicação limpa e profissional.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-slate-400 font-mono">
              ✓ Filtro inteligente anti-recontato
            </div>
          </div>

          {/* Card 5: Conexão QR Code (Span 4) */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 w-fit">
                <QrCode size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Conexão QR Code em 5 Segundos
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                Escaneie o QR Code com o WhatsApp do seu celular como no WhatsApp Web. Execução contínua 24/7 em nuvem com reconexão automática resiliente.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-emerald-400 font-mono">
              ✓ Nuvem ativa sem precisar deixar PC ligado
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

