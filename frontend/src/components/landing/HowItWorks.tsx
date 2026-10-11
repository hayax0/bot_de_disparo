import { ArrowUpRight, MapPin, SlidersHorizontal, Sparkles } from "lucide-react";

export function HowItWorks() {
  return (
    <section id="como-funciona" className="studio-section scroll-mt-24">
      <div className="studio-container">
        <div className="studio-section-heading"><div><p className="studio-eyebrow">FEITO PARA A SUA ROTINA</p><h2>Uma operação completa.<br /><span>Sem trocar de janela.</span></h2></div><p>Da primeira busca ao acompanhamento dos envios, cada etapa tem seu lugar.</p></div>
        <div className="studio-feature-grid">
          <article className="studio-feature studio-feature-search"><span className="studio-feature-number">01 / ENCONTRE</span><MapPin size={28} strokeWidth={1.3} /><h3>As empresas certas,<br />na região que você escolhe.</h3><p>Defina o segmento e a localização. Conecte sua conta Apify e traga os contatos direto para a plataforma.</p><div className="studio-location"><span>Segmento</span><strong>Seu próximo cliente</strong><div className="studio-location-line" /><span>Localização</span><strong>Onde você quer crescer <ArrowUpRight size={17} /></strong></div><small>A busca usa sua própria chave Apify. Os custos são cobrados pelo provedor.</small></article>
          <article className="studio-feature"><span className="studio-feature-number">02 / PERSONALIZE</span><Sparkles size={26} strokeWidth={1.3} /><h3>Uma mensagem que<br />começa com contexto.</h3><p>A IA ajuda a criar e refinar suas abordagens. Você revisa, ajusta e decide o que será enviado.</p><div className="studio-copy-lines" aria-hidden="true"><span /><span /><span /></div><small>Créditos para IA. Edição manual sempre gratuita.</small></article>
          <article className="studio-feature"><span className="studio-feature-number">03 / ACOMPANHE</span><SlidersHorizontal size={26} strokeWidth={1.3} /><h3>Controle do ritmo.<br />Visibilidade do resultado.</h3><p>Conecte o WhatsApp, configure os intervalos e acompanhe cada campanha. Se desconectar antes do envio, reconecte e continue.</p><div className="studio-cadence" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></div><small>Cadência é organização. Não garante proteção contra bloqueios.</small></article>
        </div>
      </div>
    </section>
  );
}
