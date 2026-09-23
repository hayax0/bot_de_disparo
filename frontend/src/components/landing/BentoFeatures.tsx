import {
  Clock,
  Shuffle,
  History,
  QrCode,
  ShieldCheck,
  FileText,
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
            Tecnologia desenvolvida para prospecção responsável
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Controle total de cadência, dados higienizados e prevenção ativa contra retrabalho ou abordagens repetidas.
          </p>
        </div>

        {/* Bento Grid Assimétrico */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Card 1: Grande (Span 8) - Controle de Cadência e Delays Naturais */}
          <div className="md:col-span-8 bg-[#0D1018] rounded-2xl p-6 sm:p-8 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors relative overflow-hidden group">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Clock size={18} />
                </div>
                <span className="text-xs font-mono text-emerald-300 font-semibold uppercase tracking-wider">
                  Controle de Ritmo
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Cadência Humana e Delays Inteligentes
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl font-normal">
                Configure intervalos aleatórios entre cada mensagem (ex: de 45 a 120 segundos). O algoritmo evita rajadas instantâneas, simulando a digitação e pausas naturais de um operador humano.
              </p>
            </div>

            <div className="mt-8 pt-5 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                <span className="text-[10px] text-slate-500 block font-mono">Intervalo Mínimo</span>
                <span className="text-sm font-bold text-white font-mono tabular-nums">45 segundos</span>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                <span className="text-[10px] text-slate-500 block font-mono">Intervalo Máximo</span>
                <span className="text-sm font-bold text-white font-mono tabular-nums">120 segundos</span>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                <span className="text-[10px] text-slate-500 block font-mono">Comportamento</span>
                <span className="text-sm font-bold text-emerald-400">Pausas Aleatórias</span>
              </div>
            </div>
          </div>

          {/* Card 2: Médio (Span 4) - Motor de Variação de Mensagens */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-white/[0.04] text-slate-300 border border-white/[0.08] w-fit">
                <Shuffle size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Variação Dinâmica com Spintax
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                Alterne saudações e frases automaticamente utilizando blocos como <code className="text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono text-[11px]">{"{Olá|Oi|Tudo bem}"}</code> para que nenhum contato receba textos 100% idênticos.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-slate-400 font-mono">
              ✓ Evita mensagens padronizadas em massa
            </div>
          </div>

          {/* Card 3: Médio (Span 4) - Histórico Permanente de Contatos */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-white/[0.04] text-slate-300 border border-white/[0.08] w-fit">
                <History size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Histórico Permanente por Workspace
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                O sistema registra permanentemente cada número abordado no seu Workspace. Mesmo que você crie campanhas novas, o histórico identifica contatos anteriores.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-emerald-400 flex items-center gap-1.5 font-mono">
              <ShieldCheck size={14} />
              <span>Prevenção contra recontatos não planejados</span>
            </div>
          </div>

          {/* Card 4: Médio (Span 4) - Persistência da Última Copy */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-white/[0.04] text-slate-300 border border-white/[0.08] w-fit">
                <FileText size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Memória de Cópias & Abordagens
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                Ao criar uma nova campanha, a plataforma recupera automaticamente a última copy utilizada para empresas com site e sem site, economizando seu tempo de configuração.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-slate-400 font-mono">
              ✓ Agilidade no lançamento de listas
            </div>
          </div>

          {/* Card 5: Médio (Span 4) - Conexão via QR Code & Resiliência */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 w-fit">
                <QrCode size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Conexão Direta em Segundos
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                Escaneie o QR Code com o WhatsApp do seu celular exatamente como no WhatsApp Web. Reconexão automática resiliente com proteção de sessão e limpeza de processos.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-slate-400 font-mono">
              ✓ Sem custos de API oficial por mensagem
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

