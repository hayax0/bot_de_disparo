import { ArrowDown, ArrowUpRight, Check } from "lucide-react";
import { CampaignPreview } from "./CampaignPreview";

export function HeroSection() {
  return (
    <section className="studio-hero">
      <div className="studio-container studio-hero-grid">
        <div className="studio-hero-copy">
          <p className="studio-eyebrow"><span className="preview-dot" /> SUA PROSPECÇÃO, BEM ORGANIZADA</p>
          <h1>O próximo contato.<br />A próxima <em>conversa.</em><br />Tudo começa aqui.</h1>
          <p className="studio-hero-description">Encontre empresas, crie abordagens com IA e acompanhe suas campanhas pelo WhatsApp. Menos tarefas soltas. Mais espaço para vender.</p>
          <div className="studio-hero-actions">
            <a href="#planos" className="studio-cta">Encontrar meu plano <span><ArrowUpRight size={19} /></span></a>
            <a href="#como-funciona" className="studio-text-link">Explore o produto <ArrowDown size={15} /></a>
          </div>
          <div className="studio-hero-proof"><span><Check size={14} /> A partir de R$ 27,99/mês</span><span><Check size={14} /> Sem fidelidade</span></div>
        </div>
        <CampaignPreview />
      </div>
      <div className="studio-container studio-capabilities"><span>UMA ROTINA, DE PONTA A PONTA</span><div>Busca de empresas <span>↗</span></div><div>Mensagens com IA <span>↗</span></div><div>Campanhas no WhatsApp <span>↗</span></div></div>
    </section>
  );
}
