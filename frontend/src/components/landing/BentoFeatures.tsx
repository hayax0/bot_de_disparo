import {
  Clock,
  CalendarClock,
  QrCode,
  ShieldCheck,
  Bot,
  MapPin,
  Sparkles,
  Layers,
} from "lucide-react";

export function BentoFeatures() {
  return (
    <section id="recursos" className="py-24 bg-[var(--studio-bg)] border-t border-white/[0.06] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-emerald-400">
            <Layers size={14} />
            <span>Recursos Nativos da Plataforma</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            Busca, IA e acompanhamento comercial em um só lugar
          </h2>
          <p className="text-xs sm:text-sm text-[var(--studio-muted)]">
            Encontre contatos, prepare mensagens, organize campanhas e acompanhe as conversas em um só fluxo.
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
              <p className="text-xs sm:text-sm text-[var(--studio-muted)] leading-relaxed max-w-xl font-normal">
                A IA considera o nicho, os dados disponíveis da empresa e o contexto do seu perfil para sugerir uma abordagem curta. Você revisa e edita antes do envio.
              </p>
            </div>

            <div className="mt-8 pt-5 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                <span className="text-[10px] text-[var(--studio-muted)] block font-mono">Tecnologia</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">Motor de IA Integrado</span>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                <span className="text-[10px] text-[var(--studio-muted)] block font-mono">Consumo</span>
                <span className="text-sm font-bold text-white font-mono">1 Crédito / Copy</span>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                <span className="text-[10px] text-[var(--studio-muted)] block font-mono">Edição</span>
                <span className="text-sm font-bold text-emerald-400">100% Gratuita</span>
              </div>
            </div>
          </div>

          {/* Card 2: Busca de empresas (Span 4) */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-white/[0.04] text-emerald-400 border border-white/[0.08] w-fit">
                <MapPin size={20} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Busca de Empresas por Região
              </h3>
              <p className="text-xs text-[var(--studio-muted)] leading-relaxed font-normal">
                Encontre empresas por segmento e localização, filtre pela presença de site e revise os contatos antes de adicioná-los a uma campanha.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-[var(--studio-muted)] font-mono">
              ✓ Telefones fixos e contatos inválidos são descartados
            </div>
          </div>

          {/* Card 3: Cadência Humana (Span 4) */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-white/[0.04] text-[var(--studio-muted)] border border-white/[0.08] w-fit">
                <Clock size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Intervalos Configuráveis
              </h3>
              <p className="text-xs text-[var(--studio-muted)] leading-relaxed font-normal">
                Defina o intervalo entre envios conforme sua operação. Os intervalos ajudam a organizar o ritmo, mas não garantem proteção contra restrições do WhatsApp.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-emerald-400 flex items-center gap-1.5 font-mono">
              <ShieldCheck size={14} />
              <span>Controle sobre o ritmo dos envios</span>
            </div>
          </div>

          {/* Card 4: CRM comercial (Span 4) */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-white/[0.04] text-[var(--studio-muted)] border border-white/[0.08] w-fit">
                <CalendarClock size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                CRM para o próximo passo
              </h3>
              <p className="text-xs text-[var(--studio-muted)] leading-relaxed font-normal">
                Classifique conversas, registre notas e programe retornos para manter cada oportunidade em movimento.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-[var(--studio-muted)] font-mono">
              ✓ Etapas comerciais e lembretes
            </div>
          </div>

          {/* Card 5: Conexão QR Code (Span 4) */}
          <div className="md:col-span-4 bg-[#0D1018] rounded-2xl p-6 sm:p-7 flex flex-col justify-between border border-white/[0.08] hover:border-white/[0.16] transition-colors group">
            <div className="space-y-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 w-fit">
                <QrCode size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Conecte seu WhatsApp por QR Code
              </h3>
              <p className="text-xs text-[var(--studio-muted)] leading-relaxed font-normal">
                Faça a conexão pelo celular e acompanhe o status no painel. Campanhas iniciadas são processadas na nuvem, sem manter esta página aberta.
              </p>
            </div>
            <div className="mt-6 p-3 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-emerald-400 font-mono">
              ✓ Acompanhe o andamento pelo painel
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

