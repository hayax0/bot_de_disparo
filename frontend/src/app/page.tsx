import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { PricingSection } from "@/components/landing/PricingSection";
import { FaqAccordion } from "@/components/landing/FaqAccordion";
import { CtaFooter } from "@/components/landing/CtaFooter";
import { CookieConsentBanner } from "@/components/landing/CookieConsentBanner";

export default function LandingPage() {
  return (
    <div className="landing-page min-h-screen bg-[#08090D] text-slate-100 selection:bg-emerald-500/20 selection:text-emerald-200 overflow-x-hidden">
      <LandingNavbar />
      <main>
        <HeroSection />
        <HowItWorks />
        <PricingSection />
        <FaqAccordion />
      </main>
      <CtaFooter />
      <CookieConsentBanner />
    </div>
  );
}
