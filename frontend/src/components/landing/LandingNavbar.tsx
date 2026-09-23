"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useAuth } from "@/store/useAuth";

export function LandingNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { token, hydrate, isHydrated } = useAuth();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Listener de tecla Escape para fechar o menu mobile acessivelmente
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setMobileMenuOpen(false);
    }
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      window.addEventListener("keydown", handleKeyDown);
    } else {
      window.removeEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen, handleKeyDown]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener("pageshow", handleScroll);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pageshow", handleScroll);
    };
  }, []);

  const isLoggedIn = Boolean(isHydrated && token);

  const navLinks = [
    { label: "Recursos", href: "#recursos" },
    { label: "Como Funciona", href: "#como-funciona" },
    { label: "Calculadora", href: "#calculadora" },
    { label: "Planos", href: "#planos" },
    { label: "FAQ", href: "#faq" },
  ];

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 sm:pt-4 sm:px-6 pointer-events-none">
      <div
        className={`max-w-6xl mx-auto pointer-events-auto transition-all duration-200 ${
          scrolled
            ? "bg-[#0E1118]/90 backdrop-blur-xl border-b sm:border border-white/[0.1] shadow-xl shadow-black/40 sm:rounded-full"
            : "bg-[#08090D]/95 sm:bg-[#0E1118]/70 sm:backdrop-blur-lg border-b sm:border border-white/[0.07] sm:rounded-full"
        }`}
      >
        <div className="px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Nome */}
          <Link
            href="/"
            className="flex items-center gap-2.5 group focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none rounded-xl"
            aria-label="Página Inicial do Disparador de Mensagens"
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 shadow-sm group-hover:border-emerald-500/40 transition-colors">
              <Image
                src="/logo.png"
                alt="Logo Disparador de Mensagens"
                width={32}
                height={32}
                priority
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white tracking-tight leading-none group-hover:text-emerald-300 transition-colors">
                Disparador
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-normal">
                Prospecção WhatsApp
              </span>
            </div>
          </Link>

          {/* Links Desktop */}
          <nav className="hidden lg:flex items-center gap-6" aria-label="Navegação Principal">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-xs font-medium text-slate-300 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none rounded-md px-1.5 py-1"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* CTAs Desktop */}
          <div className="hidden lg:flex items-center gap-2.5">
            {!isHydrated ? (
              <div className="w-28 h-8 rounded-full bg-white/[0.04] animate-pulse" />
            ) : isLoggedIn ? (
              <Link
                href="/dashboard"
                className="landing-btn-emerald px-4 py-1.5 text-xs flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
              >
                <span>Acessar Plataforma</span>
                <ArrowRight size={13} />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="landing-btn-secondary px-3.5 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
                >
                  Entrar
                </Link>
                <Link
                  href="/register"
                  className="landing-btn-primary px-4 py-1.5 text-xs flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
                >
                  <span>Criar Conta</span>
                  <ArrowRight size={13} />
                </Link>
              </>
            )}
          </div>

          {/* Botão Hambúrguer Mobile */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden min-h-11 min-w-11 p-2 text-slate-300 hover:text-white rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label={mobileMenuOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Menu Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#0B0E17]/98 backdrop-blur-2xl border-t border-white/10 px-5 pt-3 pb-6 space-y-3 sm:rounded-b-3xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
            <nav className="flex flex-col space-y-1.5" aria-label="Navegação Mobile">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={handleNavClick}
                  className="min-h-11 flex items-center px-3 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-2.5">
              {!isHydrated ? (
                <div className="w-full h-10 rounded-full bg-white/[0.04] animate-pulse" />
              ) : isLoggedIn ? (
                <Link
                  href="/dashboard"
                  onClick={handleNavClick}
                  className="w-full landing-btn-emerald py-2.5 text-xs text-center flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
                >
                  <span>Acessar Plataforma</span>
                  <ArrowRight size={14} />
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={handleNavClick}
                    className="w-full landing-btn-secondary py-2.5 text-center text-xs focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
                  >
                    Entrar na Conta
                  </Link>
                  <Link
                    href="/register"
                    onClick={handleNavClick}
                    className="w-full landing-btn-primary py-2.5 text-xs text-center flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
                  >
                    <span>Criar Conta</span>
                    <ArrowRight size={14} />
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

