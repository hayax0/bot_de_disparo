import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";

export function CtaFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#050608] border-t border-white/[0.08] relative">
      {/* Banner de CTA Final */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-14">
        <div className="tech-card rounded-3xl p-8 sm:p-12 border border-purple-500/30 text-center relative overflow-hidden shadow-2xl shadow-purple-950/20">
          {/* Brilho sutil de fundo em roxo */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-40 bg-purple-600/15 blur-3xl pointer-events-none" />

          <div className="max-w-2xl mx-auto space-y-5 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full badge-purple text-xs font-semibold">
              <Zap size={14} />
              <span>Automação em Segundo Plano</span>
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Pronto para colocar sua prospecção no piloto automático?
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Chega de perder horas diárias com o trabalho repetitivo de copiar e colar contatos. Inicie suas campanhas na nuvem com controle de cadência e foco nas respostas dos clientes.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
              <Link
                href="/register"
                className="w-full sm:w-auto btn-tech-primary px-8 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              >
                <span>Criar Minha Conta</span>
                <ArrowRight size={16} />
              </Link>

              <Link
                href="/login"
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-sm font-semibold text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-purple-500/30 transition-colors flex items-center justify-center"
              >
                <span>Já sou cliente (Entrar)</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Rodapé Institucional */}
        <div className="mt-14 pt-8 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-500">
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
            <span className="font-semibold text-slate-300">
              Disparador de Mensagens
            </span>
            <span>—</span>
            <span>Plataforma SaaS de Prospecção</span>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-slate-400">
            <a href="#recursos" className="hover:text-white transition-colors">
              Recursos
            </a>
            <a href="#como-funciona" className="hover:text-white transition-colors">
              Como Funciona
            </a>
            <a href="#calculadora" className="hover:text-white transition-colors">
              Calculadora
            </a>
            <a href="#planos" className="hover:text-white transition-colors">
              Planos
            </a>
            <a href="#faq" className="hover:text-white transition-colors">
              FAQ
            </a>
            <Link href="/termos" className="hover:text-white transition-colors">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="hover:text-white transition-colors">
              Política de Privacidade
            </Link>
            <Link href="/login" className="hover:text-white transition-colors font-medium">
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
