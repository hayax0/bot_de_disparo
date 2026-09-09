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
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="tech-card rounded-2xl p-5 border border-purple-500/30 shadow-2xl shadow-purple-950/40 bg-[#0c0e14]/95 backdrop-blur-xl relative">
        <button
          onClick={handleDismiss}
          aria-label="Fechar banner de cookies"
          className="absolute top-3.5 right-3.5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
        >
          <X size={15} />
        </button>

        <div className="flex items-start gap-3.5 pr-6">
          <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
            <Cookie size={18} />
          </div>

          <div className="space-y-2 text-xs">
            <h3 className="font-bold text-white text-sm">Privacidade e Cookies</h3>
            <p className="text-slate-300 leading-relaxed">
              Utilizamos cookies essenciais e armazenamento local para autenticação da sua sessão e funcionamento técnico seguro da plataforma, em conformidade com a LGPD.
            </p>
            <div className="text-[11px] text-slate-400">
              Consulte nossos{" "}
              <Link href="/termos" className="text-purple-400 hover:underline font-medium">
                Termos de Uso
              </Link>{" "}
              e nossa{" "}
              <Link href="/privacidade" className="text-purple-400 hover:underline font-medium">
                Política de Privacidade
              </Link>
              .
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 mt-4 pt-3 border-t border-white/[0.06]">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            Apenas Essenciais
          </button>
          <button
            onClick={handleAccept}
            className="btn-tech-primary px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm"
          >
            Entendi e Aceito
          </button>
        </div>
      </div>
    </aside>
  );
}
