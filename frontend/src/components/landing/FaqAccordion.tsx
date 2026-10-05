"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  { question: "Preciso de uma conta Apify para buscar empresas?", answer: "Sim. Você conecta sua própria chave Apify no painel. O custo das buscas é cobrado pela Apify, separado da assinatura do Disparador. O painel explica como fazer a conexão." },
  { question: "Onde uso os créditos de IA?", answer: "Cada mensagem gerada ou refinada com IA usa 1 crédito. Escrever e editar manualmente não consome créditos. A franquia renova a cada ciclo pago e não acumula; créditos comprados à parte não expiram e podem ser usados com a assinatura ativa." },
  { question: "Preciso deixar o computador ligado?", answer: "Não. Depois de conectar seu WhatsApp e iniciar a campanha, os envios rodam na nuvem. Você acompanha o andamento pelo painel." },
  { question: "Os intervalos evitam bloqueios no WhatsApp?", answer: "Os intervalos permitem controlar o ritmo dos envios, mas não garantem proteção contra bloqueios. Use a plataforma respeitando as regras do WhatsApp e as preferências dos destinatários." },
  { question: "Como assino ou cancelo?", answer: "Escolha um plano, crie sua conta e conclua o pagamento pela Cakto. O acesso é liberado após a confirmação do pagamento. A assinatura é mensal e pode ser cancelada sem fidelidade." },
];

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-16 sm:py-20 scroll-mt-24 bg-[#08090D] border-t border-white/[0.06] relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-medium">
            <HelpCircle size={13} className="text-emerald-400" />
            <span>Tire Suas Dúvidas</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-white tracking-tight">
            Antes de começar
          </h2>
          <p className="text-sm text-slate-400 font-normal">
            O que você precisa saber sobre buscas, créditos e assinatura.
          </p>
        </div>

        {/* Acordeão Editorial */}
        <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            const btnId = `faq-btn-${index}`;
            const panelId = `faq-panel-${index}`;

            return (
              <div key={index} className="py-2 transition-colors">
                <button
                  id={btnId}
                  onClick={() => toggle(index)}
                  className="w-full py-4 text-left flex items-center justify-between gap-4 rounded-lg focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none transition-colors"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                >
                  <span className="text-sm sm:text-base font-medium text-white leading-snug">
                    {item.question}
                  </span>
                  <div
                    className={`p-1.5 rounded-md text-slate-400 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
                      isOpen ? "rotate-180 text-emerald-400" : ""
                    }`}
                  >
                    <ChevronDown size={16} />
                  </div>
                </button>

                {isOpen && (
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={btnId}
                    className="pb-5 pt-1 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal"
                  >
                    <p>{item.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

