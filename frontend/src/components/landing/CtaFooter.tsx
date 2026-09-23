import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";

export function CtaFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#050608] border-t border-white/[0.08] relative">
      {/* Banner de CTA Final */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="rounded-3xl p-8 sm:p-12 border border-white/[0.08] bg-[#0A0C12] text-center relative overflow-hidden">
          {/* Micro-luz neutra sutil */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-emerald-500/[0.04] blur-3xl pointer-events-none" />

          <div className="max-w-2xl mx-auto space-y-5 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-medium">
              <Zap size={13} className="text-emerald-400" />
              <span>Automação em Segundo Plano</span>
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-white tracking-tight leading-tight">
              Pronto para colocar sua prospecção no ritmo automático?
            </h2>

            <p className="text-sm text-slate-400 leading-relaxed font-normal">
              Chega de perder horas diárias com a digitação repetitiva de contatos. Inicie suas campanhas na nuvem com cadência humana programada e foque em quem responde.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/register"
                className="w-full sm:w-auto landing-btn-emerald px-8 py-3 text-sm font-semibold flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
              >
                <span>Criar Minha Conta</span>
                <ArrowRight size={15} />
              </Link>

              <Link
                href="/login"
                className="w-full sm:w-auto landing-btn-secondary px-6 py-3 text-sm font-medium flex items-center justify-center focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
              >
                <span>Já sou cliente (Entrar)</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Rodapé Institucional */}
        <div className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/10">
              <Image
                src="/logo.png"
                alt="Logo Disparador"
                width={28}
                height={28}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-medium text-slate-300">
              Disparador de Mensagens
            </span>
            <span>—</span>
            <span>Plataforma SaaS de Prospecção</span>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-slate-400">
            <a href="#recursos" className="hover:text-white transition-colors focus-visible:outline-none focus-visible:text-white">
              Recursos
            </a>
            <a href="#como-funciona" className="hover:text-white transition-colors focus-visible:outline-none focus-visible:text-white">
              Como Funciona
            </a>
            <a href="#calculadora" className="hover:text-white transition-colors focus-visible:outline-none focus-visible:text-white">
              Calculadora
            </a>
            <a href="#planos" className="hover:text-white transition-colors focus-visible:outline-none focus-visible:text-white">
              Planos
            </a>
            <a href="#faq" className="hover:text-white transition-colors focus-visible:outline-none focus-visible:text-white">
              FAQ
            </a>
            <a href="/plataforma.md" className="hover:text-white transition-colors focus-visible:outline-none focus-visible:text-white">
              Guia da Plataforma (.md)
            </a>
            <Link href="/termos" className="hover:text-white transition-colors focus-visible:outline-none focus-visible:text-white">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="hover:text-white transition-colors focus-visible:outline-none focus-visible:text-white">
              Política de Privacidade
            </Link>
            <Link href="/login" className="hover:text-white transition-colors font-medium focus-visible:outline-none focus-visible:text-white">
              Login
            </Link>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <span>© {currentYear} Disparador. Todos os direitos reservados.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

