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
    <section id="calculadora" className="py-24 bg-[#08090D] border-t border-white/[0.06] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-medium">
            <Calculator size={13} className="text-emerald-400" />
            <span>Simulador de Produtividade & Tempo</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-white tracking-tight">
            Quanto tempo sua equipe economiza por mês?
          </h2>
          <p className="text-sm text-slate-400 font-normal">
            Compare o custo operacional do envio manual contra o processamento assíncrono em segundo plano na nuvem.
          </p>
        </div>

        {/* Card da Calculadora */}
        <div className="max-w-4xl mx-auto rounded-2xl p-6 sm:p-10 bg-[#0E1017]/80 border border-white/[0.08] backdrop-blur-md">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Lado Esquerdo: Controles / Sliders */}
            <div className="lg:col-span-6 space-y-6">
              {/* Slider 1: Contatos Diários */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="contacts-range" className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                    Contatos planejados por dia
                  </label>
                  <span className="px-2.5 py-1 bg-white/[0.06] border border-white/[0.1] text-emerald-400 font-mono tabular-nums font-semibold text-xs rounded-md">
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
                  aria-label="Contatos planejados por dia"
                  aria-valuemin={20}
                  aria-valuemax={200}
                  aria-valuenow={contactsPerDay}
                  aria-valuetext={`${contactsPerDay} contatos por dia`}
                  className="w-full h-2 landing-range rounded-lg appearance-none cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                  <span>20/dia (cadência suave)</span>
                  <span>100/dia</span>
                  <span>200/dia (teto recomendado)</span>
                </div>
              </div>

              {/* Slider 2: Taxa Estimada de Resposta */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="rate-range" className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Taxa estimada de resposta</span>
                  </label>
                  <span className="px-2.5 py-1 bg-white/[0.06] border border-white/[0.1] text-slate-200 font-mono tabular-nums font-semibold text-xs rounded-md">
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
                  aria-label="Taxa estimada de resposta"
                  aria-valuemin={2}
                  aria-valuemax={10}
                  aria-valuenow={responseRate}
                  aria-valuetext={`${responseRate} por cento`}
                  className="w-full h-2 landing-range rounded-lg appearance-none cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                  <span>2% (conservador)</span>
                  <span>5% (médio com boa abordagem)</span>
                  <span>10% (nicho aquecido)</span>
                </div>
              </div>

              {/* Nota de Transparência */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[11px] text-slate-400 leading-relaxed flex items-start gap-2.5">
                <Info size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Metodologia do cálculo:</strong> Base de 22 dias úteis de prospecção e média de 3 minutos por abordagem manual (buscar contato, digitar, trocar variáveis e registrar). Taxas reais de resposta dependem da relevância da oferta e do nicho.
                </span>
              </div>
            </div>

            {/* Lado Direito: Resultados Visuais */}
            <div className="lg:col-span-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Métrica 1: Volume Mensal */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Calendar size={13} className="text-slate-400" />
                    <span>Contatos no mês</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
                    {totalContactsPerMonth.toLocaleString("pt-BR")}
                  </div>
                  <span className="text-[11px] text-slate-500 block">Em 22 dias úteis</span>
                </div>

                {/* Métrica 2: Horas Economizadas */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock size={13} className="text-emerald-400" />
                    <span>Tempo economizado</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-emerald-400 font-mono tabular-nums">
                    ~{hoursSavedPerMonth}h
                  </div>
                  <span className="text-[11px] text-slate-500 block">De digitação e envio</span>
                </div>
              </div>

              {/* Métrica de Destaque: Reuniões / Respostas Estimadas */}
              <div className="p-5 rounded-xl bg-[#12141C] border border-white/[0.1] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-emerald-400" />
                    Respostas / Oportunidades Estimadas
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-slate-300 border border-white/[0.08] font-mono tabular-nums">
                    Base {responseRate}%
                  </span>
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-white font-mono tabular-nums">
                  ~{estimatedReplies} <span className="text-xs font-normal text-slate-400">conversas iniciadas/mês</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-normal">
                  Enquanto a fila processa os disparos na cadência configurada com intervalos humanos (45s a 120s), sua equipe foca em qualificar e converter quem respondeu.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

