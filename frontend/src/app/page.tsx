import { LandingMotion } from "@/components/landing/LandingMotion";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { BentoFeatures } from "@/components/landing/BentoFeatures";
import { SocialProofBand } from "@/components/landing/SocialProofBand";
import { PricingSection } from "@/components/landing/PricingSection";
import { FaqAccordion } from "@/components/landing/FaqAccordion";
import { CtaFooter } from "@/components/landing/CtaFooter";
import { CookieConsentBanner } from "@/components/landing/CookieConsentBanner";

export default function LandingPage() {
  return (
    <LandingMotion>
      <LandingNavbar />
      <main>
        <HeroSection />
        <SocialProofBand />
        <HowItWorks />
        <BentoFeatures />
        <PricingSection />
        <FaqAccordion />
      </main>
      <CtaFooter />
      <CookieConsentBanner />
    </LandingMotion>
  );
}
