import { AiMessageDemo } from "./AiMessageDemo";
import { ArrowUpRight, MapPin, SlidersHorizontal, Sparkles } from "lucide-react";

export function HowItWorks() {
  return (
    <section id="como-funciona" className="studio-section scroll-mt-24">
      <div className="studio-container">
        <div className="studio-section-heading gsap-reveal"><div><p className="studio-eyebrow">FEITO PARA A SUA ROTINA</p><h2>Uma operação completa.<br /><span>Sem trocar de janela.</span></h2></div><p>Da primeira busca ao acompanhamento dos envios, cada etapa tem seu lugar.</p></div>
        <div className="studio-feature-grid manifesto-trigger">
          <article className="studio-feature studio-feature-search manifesto-stagger"><span className="studio-feature-number">01 / ENCONTRE</span><MapPin size={28} strokeWidth={1.3} /><h3>Empresas por segmento<br />e região.</h3><p>Escolha o público e a localização para encontrar empresas. Revise telefone, presença de site e outros dados antes de usar os contatos.</p><div className="studio-location"><span>Segmento</span><strong>O público que você atende</strong><div className="studio-location-line" /><span>Localização</span><strong>Onde você quer prospectar <ArrowUpRight size={17} /></strong></div><small>A quantidade de contatos varia conforme os filtros e os dados disponíveis.</small></article>
          <article className="studio-feature manifesto-stagger"><span className="studio-feature-number">02 / PERSONALIZE</span><Sparkles size={26} strokeWidth={1.3} /><h3>Uma boa ideia.<br />Um motivo para conversar.</h3><p>Transforme o contexto da empresa em uma abordagem que convida à conversa. A IA sugere. Você dá o seu toque.</p><AiMessageDemo /><small>Créditos para IA. Edição manual sempre gratuita.</small></article>
          <article className="studio-feature manifesto-stagger"><span className="studio-feature-number">03 / ACOMPANHE</span><SlidersHorizontal size={26} strokeWidth={1.3} /><h3>Controle do ritmo.<br />Visibilidade do resultado.</h3><p>Conecte o WhatsApp, configure os intervalos e acompanhe cada campanha. Se desconectar antes do envio, reconecte e continue.</p><div className="studio-cadence" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></div><small>Cadência é organização. Não garante proteção contra bloqueios.</small></article>
        </div>
      </div>
    </section>
  );
}
