"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";

const COOKIE_STORAGE_KEY = "disparador_cookie_consent_v1";

export function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem(COOKIE_STORAGE_KEY);
      if (!consent) {
        // Exibe com um delay suave de 1s para não sobrecarregar o primeiro frame
        const timer = setTimeout(() => setIsVisible(true), 1000);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignora erro em ambientes restritos de storage
    }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem(COOKIE_STORAGE_KEY, "accepted");
    } catch {}
    setIsVisible(false);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(COOKIE_STORAGE_KEY, "essential_only");
    } catch {}
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <aside
      aria-label="Consentimento de Cookies e Privacidade"
      className="max-h-[calc(100dvh-6rem)] overflow-y-auto fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="rounded-2xl p-5 border border-white/[0.1] shadow-2xl bg-[#0E1017]/95 sm:backdrop-blur-xl relative">
        <button
          onClick={handleDismiss}
          aria-label="Fechar banner de cookies"
          className="absolute top-3.5 right-3.5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
        >
          <X size={15} />
        </button>

        <div className="flex items-start gap-3.5 pr-6">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/20">
            <Cookie size={17} />
          </div>

          <div className="space-y-2 text-xs">
            <h3 className="font-semibold text-white text-sm">Privacidade e Cookies</h3>
            <p className="text-slate-300 leading-relaxed font-normal">
              Utilizamos cookies essenciais e armazenamento local para autenticação da sua sessão e funcionamento técnico seguro da plataforma, em conformidade com a LGPD.
            </p>
            <div className="text-[11px] text-slate-400 font-normal">
              Consulte nossos{" "}
              <Link href="/termos" className="text-emerald-400 hover:underline font-medium focus-visible:outline-none focus-visible:underline">
                Termos de Uso
              </Link>{" "}
              e nossa{" "}
              <Link href="/privacidade" className="text-emerald-400 hover:underline font-medium focus-visible:outline-none focus-visible:underline">
                Política de Privacidade
              </Link>
              .
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 mt-4 pt-3 border-t border-white/[0.06]">
          <button
            onClick={handleDismiss}
            className="min-h-10 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
          >
            Apenas Essenciais
          </button>
          <button
            onClick={handleAccept}
            className="landing-btn-emerald min-h-10 px-4 py-1.5 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
          >
            Entendi e Aceito
          </button>
        </div>
      </div>
    </aside>
  );
}

