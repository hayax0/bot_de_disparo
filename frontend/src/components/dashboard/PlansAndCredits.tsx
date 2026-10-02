"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Sparkles, Zap, ShieldCheck, ArrowUpRight, CheckCircle2, ChevronRight } from 'lucide-react';

type Plan = {
  id: string;
  name: string;
  priceFormatted: string;
  monthlyCredits: number;
  monthlyDispatches: number;
  maxWhatsappConnections: number;
  isPopular?: boolean;
  checkoutUrl?: string;
};

type CreditPackage = {
  id: string;
  name: string;
  credits: number;
  priceFormatted: string;
  pricePerCreditFormatted?: string;
  isPopular?: boolean;
  checkoutUrl?: string;
  description?: string;
};

type Catalog = {
  purchaseEnabled: boolean;
  plans: Plan[];
  packages: CreditPackage[];
  currentPlan: Plan | null;
  isUnlimited: boolean;
  isLegacy: boolean;
  dispatch: {
    quota?: number;
    used?: number;
    remaining?: number;
    isUnlimited?: boolean;
  };
};

const number = (value: number) => value.toLocaleString('pt-BR');

export function PlansAndCredits() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [showPlansModal, setShowPlansModal] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<Catalog>('/integrations/plans')
      .then(({ data }) => {
        if (active) {
          setCatalog(data);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <section className="dash-card rounded-2xl p-5 border border-white/10">
        <p role="alert" className="text-sm text-amber-200">
          Não foi possível carregar as informações do seu plano.
        </p>
        <button
          onClick={() => setAttempt((v) => v + 1)}
          className="text-sm text-emerald-400 mt-2 font-medium hover:underline"
        >
          Tentar novamente
        </button>
      </section>
    );
  }

  if (!catalog) {
    return (
      <div className="dash-card rounded-2xl p-5 border border-white/10 text-sm text-slate-400">
        Carregando informações do plano e créditos…
      </div>
    );
  }

  if (catalog.isLegacy) return null;

  const used = catalog.dispatch.used ?? 0;
  const quota = catalog.dispatch.quota ?? 0;
  const remaining = catalog.dispatch.remaining ?? 0;
  const percentUsed = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  return (
    <section className="space-y-4" aria-label="Plano e recargas de IA">
      {/* Card do Plano Atual e Franquia de Disparos */}
      <div className="dash-card rounded-2xl p-5 border border-white/10 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Seu Plano
              </span>
              {catalog.isUnlimited ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck size={12} />
                  Admin Vitalício
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 size={12} />
                  Ativo
                </span>
              )}
            </div>

            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {catalog.isUnlimited
                ? 'Acesso Vitalício Completo'
                : `Plano ${catalog.currentPlan?.name ?? 'Essencial'}`}
            </h2>

            {catalog.isUnlimited ? (
              <p className="text-sm text-slate-300">
                Ambiente administrativo com disparos ilimitados e IA liberada sem consumo de créditos.
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Franquia renovada mensalmente. Créditos de IA renovam a cada ciclo de pagamento.
              </p>
            )}
          </div>

          {!catalog.isUnlimited && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPlansModal(!showPlansModal)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition"
              >
                <span>{showPlansModal ? 'Ocultar opções de plano' : 'Trocar ou renovar plano'}</span>
                <ChevronRight size={14} className={`transition-transform ${showPlansModal ? 'rotate-90' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* Barra de Progresso de Disparos (para usuários não-unlimited) */}
        {!catalog.isUnlimited && (
          <div className="mt-5 pt-4 border-t border-white/5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>
                Disparos realizados no ciclo: <strong>{number(used)}</strong> de {number(quota)}
              </span>
              <span className="font-semibold text-emerald-400">
                {number(remaining)} disponíveis
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${percentUsed}%` }}
              />
            </div>
          </div>
        )}

        {/* Modal / Acordeão sutil para quem desejar trocar de plano */}
        {showPlansModal && !catalog.isUnlimited && (
          <div className="mt-5 pt-5 border-t border-white/10 space-y-3">
            <p className="text-xs text-slate-300 font-medium">
              Escolha um plano para atualizar sua assinatura ou fazer upgrade:
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              {catalog.plans.map((p) => {
                const isCurrent = catalog.currentPlan?.id === p.id;
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl p-3.5 border text-xs flex flex-col justify-between ${
                      isCurrent
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">{p.name}</span>
                        {isCurrent && (
                          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            Atual
                          </span>
                        )}
                      </div>
                      <p className="text-base font-bold text-white mt-1">
                        R$ {p.priceFormatted}
                        <span className="text-[10px] text-slate-400 font-normal">/mês</span>
                      </p>
                      <ul className="mt-2 space-y-1 text-slate-400">
                        <li>• {number(p.monthlyDispatches)} disparos/mês</li>
                        <li>• {number(p.monthlyCredits)} créditos IA</li>
                      </ul>
                    </div>
                    {p.checkoutUrl && (
                      <a
                        href={p.checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`mt-3 w-full py-1.5 px-2 rounded-lg text-center font-medium transition block ${
                          isCurrent
                            ? 'bg-white/10 text-white hover:bg-white/15'
                            : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-semibold'
                        }`}
                      >
                        {isCurrent ? 'Renovar' : 'Mudar para este'}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Seção de Recargas de Créditos de IA (apenas para não-admin) */}
      {!catalog.isUnlimited && (
        <div className="dash-card rounded-2xl p-5 border border-white/10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-emerald-400" />
                <h3 className="text-sm sm:text-base font-semibold text-white">
                  Recarga Avulsa de Créditos de IA
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Pagamento único via PIX ou Cartão. Os créditos comprados <strong>nunca expiram</strong> e são liberados na mesma hora.
              </p>
            </div>
            <span className="text-[11px] text-emerald-400/90 font-medium shrink-0">
              1 crédito = 1 abordagem gerada
            </span>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            {catalog.packages.map((pack) => {
              const isPopular = pack.isPopular || pack.credits === 300;
              return (
                <div
                  key={pack.id}
                  className={`relative rounded-xl p-4 flex flex-col justify-between border transition-all ${
                    isPopular
                      ? 'border-emerald-500/50 bg-emerald-500/[0.06] shadow-sm shadow-emerald-500/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-2.5 right-3 bg-emerald-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Mais Vendido
                    </span>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-white font-semibold text-sm">
                      <Zap size={14} className="text-emerald-400" />
                      <span>{pack.credits} Créditos</span>
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-white">
                          R$ {pack.priceFormatted}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {pack.credits === 100 && 'R$ 0,10 por mensagem gerada'}
                        {pack.credits === 300 && 'R$ 0,08 por mensagem gerada'}
                        {pack.credits === 700 && 'R$ 0,07 por mensagem gerada'}
                      </p>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed pt-1">
                      {pack.description || 'Abasteça seu saldo de IA sem mensalidade extra.'}
                    </p>
                  </div>

                  {pack.checkoutUrl ? (
                    <a
                      href={pack.checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`mt-4 w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        isPopular
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      <span>Comprar {pack.credits} créditos</span>
                      <ArrowUpRight size={14} />
                    </a>
                  ) : (
                    <button
                      disabled
                      className="mt-4 w-full py-2 px-3 rounded-lg text-xs font-medium bg-white/5 text-slate-500 cursor-not-allowed"
                    >
                      Indisponível
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>
              💡 Dica: Créditos mensais inclusos no plano são consumidos primeiro. Créditos avulsos só entram em ação quando os mensais acabam.
            </span>
            <span className="text-slate-500 shrink-0">Liberação via webhook instantâneo</span>
          </div>
        </div>
      )}
    </section>
  );
}
