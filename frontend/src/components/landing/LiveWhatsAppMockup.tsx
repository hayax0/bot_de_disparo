"use client";

import { useState, useEffect, useRef } from "react";
import { Check, CheckCheck, Clock, MessageSquare, Braces } from "lucide-react";

type TemplateKey = "com-site" | "sem-site" | "follow-up";

interface TemplateData {
  title: string;
  badge: string;
  leadName: string;
  leadCompany: string;
  leadCategory: string;
  rawText: string;
  leadReply: string;
}

const TEMPLATES: Record<TemplateKey, TemplateData> = {
  "com-site": {
    title: "Com Site",
    badge: "Otimização & Tráfego",
    leadName: "Roberto",
    leadCompany: "Restaurante Villa Gourmet",
    leadCategory: "Gastronomia",
    rawText:
      "Olá, {nome}! Tudo bem? Vi o site da {empresa} no Google e notei uma oportunidade excelente para vocês receberem mais reservas direto no WhatsApp todos os dias. Podemos bater um papo rápido de 5 minutos sobre isso?",
    leadReply: "Olá! Tudo bem sim. Achei interessante, como funcionaria essa estratégia para nós?",
  },
  "sem-site": {
    title: "Sem Site",
    badge: "Presença Digital",
    leadName: "Dra. Carolina",
    leadCompany: "Clínica OdontoPrime",
    leadCategory: "Odontologia",
    rawText:
      "Oi, {nome}! Encontrei o perfil da {empresa} com ótimas avaliações, mas percebi que ainda não possuem um catálogo digital ou página própria para agendamentos. Ajudamos clínicas de {categoria} a dobrar contatos. Tem disponibilidade amanhã?",
    leadReply: "Olá! Estávamos justamente pesquisando sobre isso aqui na clínica. Quais são os horários?",
  },
  "follow-up": {
    title: "Follow-up",
    badge: "Retomada Amigável",
    leadName: "Felipe",
    leadCompany: "TechSolutions Hub",
    leadCategory: "Tecnologia B2B",
    rawText:
      "Olá, {nome}! Passando apenas para saber se você conseguiu ver a mensagem anterior que enviei sobre a {empresa}. Caso a semana esteja corrida, posso te chamar na próxima segunda?",
    leadReply: "Opa, Felipe aqui! Desculpe a demora na resposta. Consegue me mandar uma proposta resumida?",
  },
};

type DeliveryStep = "queued" | "sent" | "delivered" | "replied";

export function LiveWhatsAppMockup() {
  const [activeTemplate, setActiveTemplate] = useState<TemplateKey>("com-site");
  const [typedText, setTypedText] = useState("");
  const [deliveryStep, setDeliveryStep] = useState<DeliveryStep>("queued");
  const [isTyping, setIsTyping] = useState(false);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  const current = TEMPLATES[activeTemplate];

  // Gera o texto personalizado substituindo as variáveis dinâmicas
  const targetText = current.rawText
    .replace("{nome}", current.leadName)
    .replace("{empresa}", current.leadCompany)
    .replace("{categoria}", current.leadCategory);

  useEffect(() => {
    // Limpa timeouts anteriores
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    const initTimeout = setTimeout(() => {
      setIsTyping(true);
      setTypedText("");
      setDeliveryStep("queued");

      let charIndex = 0;
      const interval = setInterval(() => {
        if (charIndex < targetText.length) {
          setTypedText(targetText.slice(0, charIndex + 1));
          charIndex++;
        } else {
          clearInterval(interval);
          setIsTyping(false);

          const t1 = setTimeout(() => setDeliveryStep("sent"), 600);
          const t2 = setTimeout(() => setDeliveryStep("delivered"), 1400);
          const t3 = setTimeout(() => setDeliveryStep("replied"), 2600);
          timeoutsRef.current.push(t1, t2, t3);
        }
      }, 18);

      timeoutsRef.current.push(interval as unknown as NodeJS.Timeout);
    }, 50);

    timeoutsRef.current.push(initTimeout);

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [activeTemplate, targetText]);

  return (
    <div className="w-full max-w-lg mx-auto tech-card rounded-2xl p-4 sm:p-5 border border-white/[0.08] shadow-2xl relative">
      {/* Barra superior de controle do simulador */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-200">
            Simulador de Cadência e Personalização
          </span>
        </div>
        <span className="text-[10px] text-purple-300 font-mono uppercase tracking-wider bg-purple-500/10 px-2.5 py-0.5 rounded border border-purple-500/20 w-fit">
          Demonstração Interativa
        </span>
      </div>

      {/* Alternador de abordagem / template */}
      <div className="flex items-center gap-1.5 p-1 bg-black/50 rounded-xl mb-4 border border-white/[0.06]">
        {(Object.keys(TEMPLATES) as TemplateKey[]).map((key) => {
          const item = TEMPLATES[key];
          const isSelected = activeTemplate === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTemplate(key)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                isSelected
                  ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {item.title}
            </button>
          );
        })}
      </div>

      {/* Cabeçalho do contato simulado */}
      <div className="bg-[#131724] rounded-xl p-3 mb-3 flex items-center justify-between border border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-inner">
            {current.leadName[0]}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white leading-tight">
                {current.leadName}
              </span>
              <span className="text-[9px] px-1.5 py-0.2 bg-white/10 text-slate-300 rounded">
                Lead
              </span>
            </div>
            <span className="text-[11px] text-slate-400 leading-tight">
              {current.leadCompany}
            </span>
          </div>
        </div>

        {/* Indicador de Status do Disparo na Fila */}
        <div className="flex items-center gap-1 text-[11px] font-mono">
          {deliveryStep === "queued" && (
            <span className="text-purple-300 flex items-center gap-1 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
              <Clock size={12} />
              <span>Na Fila (delay)</span>
            </span>
          )}
          {deliveryStep === "sent" && (
            <span className="text-slate-300 flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded">
              <Check size={12} />
              <span>Enviado</span>
            </span>
          )}
          {deliveryStep === "delivered" && (
            <span className="text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              <CheckCheck size={12} />
              <span>Entregue</span>
            </span>
          )}
          {deliveryStep === "replied" && (
            <span className="text-emerald-300 font-bold flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/40 animate-pulse">
              <MessageSquare size={12} />
              <span>Lead Respondeu</span>
            </span>
          )}
        </div>
      </div>

      {/* Caixa de Mensagens Simulada */}
      <div className="bg-[#0A0C12] rounded-xl p-3.5 space-y-3 min-h-[190px] flex flex-col justify-between border border-white/[0.04]">
        {/* Mensagem Enviada pela Plataforma */}
        <div className="flex justify-end">
          <div className="max-w-[88%] bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-sm p-3 text-xs leading-relaxed shadow-md relative">
            <p className="whitespace-pre-line">
              {typedText}
              {isTyping && <span className="inline-block w-1.5 h-3 bg-white ml-0.5 animate-pulse" />}
            </p>
            <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] text-emerald-200/70">
              <span>10:42</span>
              {deliveryStep === "queued" && <Clock size={11} className="text-purple-300" />}
              {deliveryStep === "sent" && <Check size={11} className="text-slate-200" />}
              {(deliveryStep === "delivered" || deliveryStep === "replied") && (
                <CheckCheck size={12} className="text-sky-300" />
              )}
            </div>
          </div>
        </div>

        {/* Resposta do Lead (aparece quando status === replied) */}
        {deliveryStep === "replied" && (
          <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="max-w-[85%] bg-[#202c33] text-[#e9edef] rounded-2xl rounded-tl-sm p-3 text-xs leading-relaxed shadow-md">
              <p>{current.leadReply}</p>
              <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                <span>10:43</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legenda explicativa transparente */}
      <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <Braces size={13} className="text-purple-400" />
          <span>Variáveis dinâmicas:</span>
          <code className="text-purple-300 bg-purple-500/10 px-1 py-0.2 rounded font-mono">{"{nome}"}</code>
          <code className="text-indigo-300 bg-indigo-500/10 px-1 py-0.2 rounded font-mono">{"{empresa}"}</code>
        </span>
        <span className="text-slate-400">Fila com cadência configurável</span>
      </div>
    </div>
  );
}
