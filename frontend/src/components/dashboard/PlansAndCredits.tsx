"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Plan = {
  id: string; name: string; priceFormatted: string; monthlyCredits: number;
  monthlyDispatches: number; maxWhatsappConnections: number; isPopular?: boolean;
};
type CreditPackage = { id: string; name: string; credits: number; priceFormatted: string };
type Catalog = {
  purchaseEnabled: false; unavailableReason: string; plans: Plan[]; packages: CreditPackage[];
  currentPlan: Plan | null; isUnlimited: boolean; isLegacy: boolean;
  dispatch: { quota?: number; used?: number; remaining?: number; isUnlimited?: boolean };
};
const number = (value: number) => value.toLocaleString('pt-BR');

export function PlansAndCredits() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api.get<Catalog>('/integrations/plans').then(({ data }) => {
      if (active) { setCatalog(data); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);

  if (error) return <section className="dash-card rounded-2xl p-5 border border-white/10">
    <p role="alert" className="text-sm text-amber-200">Não foi possível carregar planos e recargas.</p>
    <button onClick={() => setAttempt(value => value + 1)} className="text-sm text-emerald-400 mt-2">Tentar novamente</button>
  </section>;
  if (!catalog) return <p role="status" className="text-sm text-slate-400">Carregando planos e recargas…</p>;
  if (catalog.isLegacy) return null;

  return <section className="dash-card rounded-2xl p-5 border border-white/10 space-y-4" aria-label="Planos e recargas de IA">
    <div>
      <h2 className="text-white font-semibold">Meu plano e recargas</h2>
      {catalog.isUnlimited ? <p className="text-sm text-emerald-400 mt-1">Administrador: acesso vitalício e IA ilimitada. Você não precisa comprar créditos.</p> : <>
        <p className="text-sm text-slate-300 mt-1">Plano atual: <strong>{catalog.currentPlan?.name ?? 'Não definido'}</strong></p>
        <p className="text-sm text-slate-400 mt-1">Disparos no ciclo: {number(catalog.dispatch.used ?? 0)} de {number(catalog.dispatch.quota ?? 0)}.
          {' '}{number(catalog.dispatch.remaining ?? 0)} disponíveis.</p>
      </>}
    </div>
    <p className="text-sm text-amber-200">{catalog.unavailableReason} Nenhuma compra está habilitada nesta etapa.</p>
    <details>
      <summary className="text-emerald-400 cursor-pointer text-sm font-medium">Comparar os três planos</summary>
      <div className="grid md:grid-cols-3 gap-3 mt-4">
        {catalog.plans.map(plan => <article key={plan.id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <h3 className="text-white font-semibold">{plan.name}{catalog.currentPlan?.id === plan.id && <span className="text-xs text-emerald-400 ml-2">Atual</span>}</h3>
          <p className="text-xl text-white font-semibold">R$ {plan.priceFormatted}<span className="text-xs text-slate-400 font-normal"> /mês</span></p>
          <ul className="text-sm text-slate-300 space-y-2">
            <li>{number(plan.monthlyDispatches)} disparos por mês</li>
            <li>{number(plan.monthlyCredits)} créditos mensais de IA</li>
            <li>{plan.maxWhatsappConnections} conexão WhatsApp</li>
            <li>Busca com sua própria conta Apify</li>
            <li>Campanhas e histórico de contatos</li>
          </ul>
          <button disabled className="w-full rounded-lg border border-white/10 p-2 text-sm text-slate-500 cursor-not-allowed">Assinaturas em breve</button>
        </article>)}
      </div>
    </details>
    {!catalog.isUnlimited && <div>
      <h3 className="text-white font-medium">Créditos extras de IA</h3>
      <p className="text-sm text-slate-400 mt-1">Pagamento único, em qualquer plano. Recargas não aumentam sua franquia de disparos.</p>
      <div className="grid md:grid-cols-3 gap-3 mt-3">
        {catalog.packages.map(pack => <article key={pack.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h4 className="text-white font-medium">{pack.name}</h4>
          <p className="text-lg text-emerald-400 mt-1">R$ {pack.priceFormatted}</p>
          <p className="text-xs text-slate-400 mt-1">Não expiram</p>
          <button disabled className="w-full rounded-lg border border-white/10 p-2 text-sm text-slate-500 mt-3 cursor-not-allowed">Recargas em breve</button>
        </article>)}
      </div>
    </div>}
    <p className="text-xs text-slate-400 leading-relaxed">Cada mensagem gerada ou regenerada com sucesso custa 1 crédito. Edição manual não consome créditos.
      Os créditos mensais renovam a cada ciclo pago, não acumulam e são usados antes dos comprados.
      Créditos comprados não expiram; seu uso exige assinatura ativa.
      Buscas são cobradas diretamente na sua conta Apify, conforme o consumo. Os intervalos de envio continuam sendo respeitados.</p>
  </section>;
}
