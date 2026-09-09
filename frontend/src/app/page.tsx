"use client";

import { useGsapScroll } from "@/components/landing/hooks/useGsapScroll";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { SocialProofBand } from "@/components/landing/SocialProofBand";
import { TextScrollReveal } from "@/components/landing/TextScrollReveal";
import { InteractiveRadar } from "@/components/landing/InteractiveRadar";
import { BentoFeatures } from "@/components/landing/BentoFeatures";
import { RoiCalculator } from "@/components/landing/RoiCalculator";
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FaqAccordion } from "@/components/landing/FaqAccordion";
import { CtaFooter } from "@/components/landing/CtaFooter";

export default function LandingPage() {
  const { containerRef } = useGsapScroll();

  return (
    <div ref={containerRef} className="min-h-screen bg-[#07080B] text-slate-100 selection:bg-purple-500/30 selection:text-purple-200">
      {/* Barra de Navegação Superior */}
      <LandingNavbar />

      {/* Hero Section com Simulador Interativo */}
      <HeroSection />

      {/* Faixa de Pilares de Confiabilidade Técnica */}
      <div className="gsap-reveal">
        <SocialProofBand />
      </div>

      {/* Efeito Scroll Reveal: O texto manifesto vai acendendo conforme o usuário rola a página */}
      <TextScrollReveal />

      {/* Esteira Visual Passo a Passo (Como Funciona) */}
      <div className="gsap-reveal">
        <InteractiveRadar />
      </div>

      {/* Recursos Nativos em Bento Grid */}
      <div className="gsap-reveal">
        <BentoFeatures />
      </div>

      {/* Calculadora Interativa de Produtividade */}
      <div className="gsap-reveal">
        <RoiCalculator />
      </div>

      {/* Comparativo Manual vs. Plataforma */}
      <div className="gsap-reveal">
        <ComparisonSection />
      </div>

      {/* Planos e Checkout Oficial */}
      <div className="gsap-reveal">
        <PricingSection />
      </div>

      {/* Perguntas Frequentes */}
      <div className="gsap-reveal">
        <FaqAccordion />
      </div>

      {/* CTA Final & Rodapé Institucional */}
      <CtaFooter />
    </div>
  );
}
