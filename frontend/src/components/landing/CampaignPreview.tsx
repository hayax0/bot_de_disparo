"use client";

import { useState } from "react";
import { ArrowUpRight, Check, MapPin, Send, Sparkles } from "lucide-react";

const examples = [
  { label: "Clínicas", niche: "Clínicas de estética", location: "Rio de Janeiro", company: "Clínica Aurora", initial: "A", message: "Olá, Ana! Vi a Clínica Aurora e queria entender como vocês recebem novos agendamentos hoje. Posso compartilhar uma ideia?" },
  { label: "Restaurantes", niche: "Restaurantes", location: "São Paulo", company: "Villa Gourmet", initial: "V", message: "Olá, equipe Villa Gourmet! Trabalho com soluções para restaurantes e queria conversar sobre as reservas de vocês. Podemos falar?" },
  { label: "Serviços", niche: "Escritórios de contabilidade", location: "Belo Horizonte", company: "Contabilidade Horizonte", initial: "H", message: "Olá, equipe Horizonte! Conheci o escritório de vocês e queria apresentar uma possibilidade de parceria. Quem cuida dessa área?" },
];

export function CampaignPreview() {
  const [selected, setSelected] = useState(0);
  const example = examples[selected];
  return (
    <div className="preview-shell">
      <div className="preview-console">
        <div className="preview-toolbar"><span className="preview-dot" /><span>disparador / campanha</span><span className="preview-example">Demonstração</span></div>
        <div className="preview-body">
          <div className="preview-topline"><div><span className="studio-eyebrow">DO CONTATO À CONVERSA</span><h2>Sua abordagem. Seu ritmo.</h2></div><ArrowUpRight size={22} strokeWidth={1.5} /></div>
          <div className="preview-switch" role="group" aria-label="Escolha um exemplo de segmento">
            {examples.map((item, index) => <button key={item.label} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>{item.label}</button>)}
          </div>
          <div key={example.label} className="preview-scene">
            <div className="preview-search"><MapPin size={17} strokeWidth={1.5} /><div><strong>{example.niche}</strong><span>{example.location}</span></div><span className="preview-step">01 / BUSCA</span></div>
            <div className="preview-connector" aria-hidden="true" />
            <div className="preview-contact"><span className="preview-avatar">{example.initial}</span><div><strong>{example.company}</strong><span>Contato de exemplo</span></div><Check size={16} /></div>
            <div className="preview-copy"><div><Sparkles size={14} /><span>02 / MENSAGEM PERSONALIZADA</span></div><p>{example.message}</p><span className="preview-review"><Check size={12} /> Você revisa antes de enviar</span></div>
            <div className="preview-send"><span className="preview-send-icon"><Send size={19} strokeWidth={1.5} /></span><div><strong>Pronta para uma conversa</strong><span>03 / ENVIO COM CADÊNCIA</span></div><span className="preview-ticks" aria-hidden="true">✓✓</span></div>
          </div>
          <p className="preview-caption">Exemplo ilustrativo. Nenhuma busca ou mensagem real é executada aqui.</p>
        </div>
      </div>
      <div className="preview-footnote"><span className="preview-dot" /> Busca, IA e campanhas. Uma só operação.</div>
    </div>
  );
}
