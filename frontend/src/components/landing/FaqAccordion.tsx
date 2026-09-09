"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Preciso deixar meu computador ou celular ligados durante os disparos?",
    answer:
      "Não. Toda a automação roda em segundo plano em servidores dedicados na nuvem. Depois de iniciar sua campanha, você pode fechar a aba, desligar seu computador ou sair de casa que os disparos continuarão sendo processados na cadência programada.",
  },
  {
    question: "Como funciona a segurança e o controle de cadência contra bloqueios?",
    answer:
      "A plataforma utiliza fila inteligente (BullMQ) com delays aleatórios configuráveis (por exemplo, pausas de 45 a 120 segundos entre cada mensagem) para reproduzir o ritmo de digitação e envio de um ser humano. Além disso, o motor de Spintax permite alternar palavras e saudações, evitando mensagens 100% idênticas em lote. Nenhuma ferramenta séria pode prometer imunidade absoluta ao WhatsApp, mas oferecemos as melhores práticas de cadência e controle técnico disponíveis no mercado.",
  },
  {
    question: "Como posso importar minha lista de contatos para a plataforma?",
    answer:
      "Você pode importar listas extraídas do Google Maps, planilhas em formato CSV ou arquivos JSON com nome, telefone e site. A plataforma higieniza os telefones, adiciona o código do país (+55) se necessário e organiza tudo em uma campanha limpa.",
  },
  {
    question: "O sistema me avisa se eu tentar mandar mensagem para um número que já abordei?",
    answer:
      "Sim! Implementamos um Histórico Permanente por Workspace. Mesmo se você criar uma nova campanha com outra lista de contatos, a plataforma avisa se um telefone já recebeu mensagens em campanhas anteriores, evitando retrabalho e o constrangimento de prospectar o mesmo cliente repetidas vezes.",
  },
  {
    question: "Como é feita a conexão com o WhatsApp?",
    answer:
      "A conexão é direta e instantânea: basta escanear um QR Code na tela da plataforma utilizando o WhatsApp do seu celular (Menu > Aparelhos conectados), exatamente como no WhatsApp Web. O sistema possui reconexão automática resiliente caso ocorra oscilação de sinal.",
  },
  {
    question: "Posso pausar uma campanha que já começou a disparar?",
    answer:
      "Sim. No painel de controle você pode acompanhar cada disparo em tempo real e pausar, retomar ou cancelar a campanha a qualquer momento com apenas um clique.",
  },
  {
    question: "Como funciona a contratação e liberação da minha conta?",
    answer:
      "A assinatura é mensal no valor de R$ 145,99, processada de forma 100% segura através da plataforma Cakto. Pagamentos via PIX ou Cartão de Crédito são aprovados instantaneamente e liberam seu acesso na mesma hora.",
  },
];

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-20 bg-[#0A0C13] border-t border-white/[0.06] relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full badge-purple text-xs font-semibold">
            <HelpCircle size={14} />
            <span>Tire Suas Dúvidas</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            Perguntas Frequentes
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Respostas transparentes sobre o funcionamento técnico, segurança e recursos da plataforma.
          </p>
        </div>

        {/* Acordeão */}
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="tech-card rounded-2xl border border-white/10 overflow-hidden transition-all hover:border-purple-500/30"
              >
                <button
                  onClick={() => toggle(index)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 focus:outline-none focus:ring-2 focus:ring-purple-500/30 rounded-2xl"
                  aria-expanded={isOpen}
                >
                  <span className="text-xs sm:text-sm font-bold text-white leading-snug">
                    {item.question}
                  </span>
                  <div
                    className={`p-1.5 rounded-lg bg-white/[0.04] text-slate-300 shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-purple-400 bg-purple-500/10" : ""
                    }`}
                  >
                    <ChevronDown size={16} />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-white/[0.04] animate-in fade-in duration-200">
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
