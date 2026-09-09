"use client";

import { useState, useEffect } from "react";
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

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
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
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-[#07080B]/85 backdrop-blur-md border-b border-white/[0.08] shadow-lg shadow-black/40"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        {/* Logo & Nome */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden border border-white/10 shadow-md group-hover:border-amber-500/40 transition-colors">
            <Image
              src="/logo.png"
              alt="Logo Disparador de Mensagens"
              width={40}
              height={40}
              priority
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-sm sm:text-base font-bold text-white tracking-tight leading-none group-hover:text-amber-400 transition-colors">
              Disparador
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wide">
              Prospecção WhatsApp
            </span>
          </div>
        </Link>

        {/* Links Desktop */}
        <nav className="hidden md:flex items-center gap-7">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs lg:text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* CTAs Desktop */}
        <div className="hidden md:flex items-center gap-3">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="btn-kinpaku px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-2"
            >
              <span>Acessar Plataforma</span>
              <ArrowRight size={15} />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-xs sm:text-sm font-semibold text-slate-300 hover:text-white px-3.5 py-2 transition-colors"
              >
                Entrar
              </Link>
              <a
                href="#planos"
                className="btn-kinpaku px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-2"
              >
                <span>Começar Agora</span>
                <ArrowRight size={14} />
              </a>
            </>
          )}
        </div>

        {/* Botão Hambúrguer Mobile */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-slate-300 hover:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Menu Mobile */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0D0F15] border-b border-white/10 px-4 pt-3 pb-6 space-y-3 shadow-2xl">
          <nav className="flex flex-col space-y-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleNavClick}
                className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-2.5">
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                onClick={handleNavClick}
                className="w-full btn-kinpaku py-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2"
              >
                <span>Acessar Plataforma</span>
                <ArrowRight size={15} />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={handleNavClick}
                  className="w-full py-2.5 text-center text-xs font-semibold text-slate-200 bg-white/[0.05] hover:bg-white/[0.08] rounded-xl border border-white/10 transition-colors"
                >
                  Entrar na Conta
                </Link>
                <a
                  href="#planos"
                  onClick={handleNavClick}
                  className="w-full btn-kinpaku py-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2"
                >
                  <span>Começar Agora</span>
                  <ArrowRight size={14} />
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
