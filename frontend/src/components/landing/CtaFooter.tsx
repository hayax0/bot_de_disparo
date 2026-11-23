import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { appHref } from "@/lib/appUrl";

export function CtaFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[var(--studio-bg)] border-t border-white/[0.08] relative">
      {/* Banner de CTA Final */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
        <div className="gsap-reveal rounded-3xl p-8 sm:p-12 border border-white/[0.08] bg-[var(--studio-surface)] text-center relative overflow-hidden">
          {/* Micro-luz neutra sutil */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-emerald-500/[0.04] blur-3xl pointer-events-none" />

          <div className="max-w-2xl mx-auto space-y-5 relative z-10">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-white tracking-tight leading-tight">
              Sua próxima campanha começa aqui.
            </h2>

            <p className="text-sm text-[var(--studio-muted)] leading-relaxed font-normal">
              Escolha um plano e organize sua prospecção pelo WhatsApp.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="#planos"
                className="w-full sm:w-auto landing-btn-emerald px-8 py-3 text-sm font-semibold flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
              >
                <span>Ver planos</span>
                <ArrowRight size={15} />
              </Link>

              <Link
                href={appHref('/login')}
                className="w-full sm:w-auto landing-btn-secondary px-6 py-3 text-sm font-medium flex items-center justify-center focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
              >
                <span>Já sou cliente (Entrar)</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Rodapé Institucional */}
        <div className="relative mt-8 overflow-hidden rounded-3xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(17,24,22,0.92),rgba(8,10,9,0.96))] p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-emerald-400/[0.06] blur-3xl" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/[0.12] bg-black/30 p-0.5 shadow-[0_0_24px_rgba(110,231,183,0.08)]">
              <Image
                src="/logo-abordai-v1.png"
                alt="Logo Abordai"
                width={44}
                height={44}
                className="w-full h-full object-cover"
              />
            </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold tracking-tight text-white">Abordai</span>
                  <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-emerald-300 sm:text-[10px]">
                    Prospecção pelo WhatsApp
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--studio-muted)]">
                  Encontre empresas, organize oportunidades e acompanhe conversas.
                </p>
              </div>
            </div>

            <nav aria-label="Links do rodapé" className="flex flex-wrap gap-2 text-xs">
              <a href="#como-funciona" className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[var(--studio-muted)] transition-colors hover:border-emerald-300/20 hover:bg-emerald-300/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                Como funciona
              </a>
              <a href="#planos" className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[var(--studio-muted)] transition-colors hover:border-emerald-300/20 hover:bg-emerald-300/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                Planos
              </a>
              <a href="#faq" className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[var(--studio-muted)] transition-colors hover:border-emerald-300/20 hover:bg-emerald-300/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                FAQ
              </a>
              <Link href="/termos" className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[var(--studio-muted)] transition-colors hover:border-emerald-300/20 hover:bg-emerald-300/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                Termos de uso
              </Link>
              <Link href="/privacidade" className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[var(--studio-muted)] transition-colors hover:border-emerald-300/20 hover:bg-emerald-300/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                Privacidade
              </Link>
              <Link href={appHref('/login')} className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2 font-medium text-emerald-200 transition-colors hover:border-emerald-300/30 hover:bg-emerald-300/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                Entrar
              </Link>
            </nav>
          </div>

          <div className="relative mt-6 flex flex-col gap-2 border-t border-white/[0.07] pt-4 text-[11px] text-[var(--studio-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span>© {currentYear} Abordai. Todos os direitos reservados.</span>
            <span className="font-mono uppercase tracking-[0.14em] text-white/35">Prospecção · Conversas · Resultados</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

