"use client";

import { useState } from "react";
import { Calculator, Clock, Calendar, MessageSquare, Info } from "lucide-react";

export function RoiCalculator() {
  const [contactsPerDay, setContactsPerDay] = useState<number>(60);
  const [responseRate, setResponseRate] = useState<number>(4); // 4% estimativa padrão

  const workDaysPerMonth = 22; // Dias úteis de prospecção
  const totalContactsPerMonth = contactsPerDay * workDaysPerMonth;

  // No processo manual, um operador gasta em média 3 minutos por lead (copiar, colar, personalizar nome/empresa, conferir e enviar)
  const manualMinutesPerLead = 3;
  const hoursSavedPerMonth = Math.round((totalContactsPerMonth * manualMinutesPerLead) / 60);

  // Estimativa de conversas/reuniões iniciadas
  const estimatedReplies = Math.round((totalContactsPerMonth * responseRate) / 100);

  return (
    <section id="calculadora" className="py-20 bg-[#07080B] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-300 text-xs font-semibold">
            <Calculator size={14} className="text-purple-400" />
            <span>Simulação de Produtividade</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            Quanto tempo sua equipe economiza por mês?
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Compare o tempo gasto copiando e colando manualmente no WhatsApp contra a automação em segundo plano na nuvem.
          </p>
        </div>

        {/* Card da Calculadora */}
        <div className="max-w-4xl mx-auto tech-card rounded-2xl p-6 sm:p-10 border border-white/[0.08] shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Lado Esquerdo: Controles / Sliders */}
            <div className="lg:col-span-6 space-y-6">
              {/* Slider 1: Contatos Diários */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="contacts-range" className="text-xs font-bold text-white uppercase tracking-wider">
                    Contatos planejados por dia
                  </label>
                  <span className="px-3 py-1 bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono font-bold text-sm rounded-lg">
                    {contactsPerDay} contatos/dia
                  </span>
                </div>
                <input
                  id="contacts-range"
                  type="range"
                  min={20}
                  max={200}
                  step={10}
                  value={contactsPerDay}
                  onChange={(e) => setContactsPerDay(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>20/dia (cadência leve)</span>
                  <span>100/dia</span>
                  <span>200/dia (máx recomendado)</span>
                </div>
              </div>

              {/* Slider 2: Taxa Estimada de Resposta */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="rate-range" className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span>Taxa estimada de resposta</span>
                  </label>
                  <span className="px-2.5 py-0.5 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-mono font-bold text-xs rounded-lg">
                    {responseRate}%
                  </span>
                </div>
                <input
                  id="rate-range"
                  type="range"
                  min={2}
                  max={10}
                  step={1}
                  value={responseRate}
                  onChange={(e) => setResponseRate(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>2% (conservador)</span>
                  <span>5% (médio com boa copy)</span>
                  <span>10% (nicho ultra-aquecido)</span>
                </div>
              </div>

              {/* Nota de Transparência */}
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.05] text-[11px] text-slate-400 leading-relaxed flex items-start gap-2">
                <Info size={15} className="text-purple-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Cálculo estimado:</strong> Considera 22 dias úteis de prospecção e uma média de 3 minutos por contato manual (buscar contato, digitar, trocar variáveis e registrar). Taxas reais de resposta variam conforme a qualidade da sua copy e nicho.
                </span>
              </div>
            </div>

            {/* Lado Direito: Resultados Visuais */}
            <div className="lg:col-span-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Métrica 1: Volume Mensal */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Calendar size={14} className="text-purple-400" />
                    <span>Contatos no mês</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                    {totalContactsPerMonth.toLocaleString("pt-BR")}
                  </div>
                  <span className="text-[10px] text-slate-500 block">Em 22 dias úteis</span>
                </div>

                {/* Métrica 2: Horas Economizadas */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock size={14} className="text-emerald-400" />
                    <span>Tempo economizado</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">
                    ~{hoursSavedPerMonth}h
                  </div>
                  <span className="text-[10px] text-slate-500 block">De digitação manual</span>
                </div>
              </div>

              {/* Métrica de Destaque: Reuniões / Respostas Estimadas */}
              <div className="p-5 rounded-xl bg-gradient-to-br from-[#16152E] via-[#101424] to-[#0A0D16] border border-purple-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare size={14} />
                    Respostas / Oportunidades Estimadas
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25 font-mono">
                    Base {responseRate}%
                  </span>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono">
                  ~{estimatedReplies} <span className="text-xs font-normal text-slate-400">conversas iniciadas/mês</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Enquanto o robô cuida do primeiro contato no ritmo seguro, seu foco fica 100% em responder quem demonstrou interesse e fechar negócios.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
