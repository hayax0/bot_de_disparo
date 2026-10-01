"use client";
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
interface Wallet {
  availableBalance: number; monthlyBalance: number; purchasedBalance: number; reservedBalance: number;
  monthlyExpiresAt: string | null; isUnlimited: boolean; isLegacy: boolean;
  transactions: { id: string; amount: number; description: string; sourceType: string; createdAt: string }[];
}
export function AiWallet() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/integrations/ai-wallet'); setWallet(data); setError(''); }
    catch { setError('Não foi possível carregar o saldo. Tente atualizar.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    api.get('/integrations/ai-wallet').then(({ data }) => { if (active) setWallet(data); })
      .catch(() => { if (active) setError('Não foi possível carregar o saldo. Tente atualizar.'); });
    return () => { active = false; };
  }, []);
  if (wallet?.isLegacy && !wallet.isUnlimited) return null;
  return <section className="dash-card rounded-2xl p-5 space-y-3 border border-white/10">
    <div className="flex items-center justify-between gap-3"><h2 className="text-white font-semibold">Minha carteira de IA</h2>
      <button disabled={loading} onClick={() => void refresh()} className="text-emerald-400 text-sm">{loading ? 'Atualizando…' : 'Atualizar saldo'}</button></div>
    {error && <p role="alert" className="text-amber-300 text-sm">{error}</p>}
    {wallet && <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Disponíveis', wallet.isUnlimited ? 'Ilimitados' : wallet.availableBalance], ['Mensais', wallet.isUnlimited ? '—' : wallet.monthlyBalance], ['Comprados', wallet.isUnlimited ? '—' : wallet.purchasedBalance], ['Reservados', wallet.isUnlimited ? '—' : wallet.reservedBalance]].map(([label, value]) =>
          <div key={label} className="bg-white/5 rounded-xl p-3"><p className="text-xs text-slate-400">{label}</p><p className="text-xl text-emerald-400 font-semibold mt-1">{value}</p></div>)}
      </div>
      <p className="text-sm text-slate-400">Créditos exclusivos para gerar mensagens e usar o assistente de IA. Buscas utilizam sua conta Apify; disparos seguem a franquia do plano.</p>
      {!wallet.isUnlimited && wallet.monthlyExpiresAt && <p className="text-xs text-slate-400">Créditos mensais válidos até {new Date(wallet.monthlyExpiresAt).toLocaleDateString('pt-BR')}. Créditos comprados não expiram.</p>}
      <p className="text-xs text-amber-200">Assistente de IA e compra de créditos em preparação. Nenhum pagamento está disponível nesta etapa.</p>
      <details><summary className="text-emerald-400 text-sm cursor-pointer">Ver extrato — últimas 50 movimentações</summary>
        <p className="text-xs text-slate-400 mt-2">Movimentações antigas de buscas permanecem no histórico. Novas buscas não consomem créditos.</p>
        <ul className="mt-3 space-y-2 max-h-64 overflow-auto">{wallet.transactions.length === 0 && <li className="text-sm text-slate-400">Nenhuma movimentação.</li>}
          {wallet.transactions.map(item => <li key={item.id} className="flex justify-between gap-3 text-sm text-slate-300 border-b border-white/5 py-2"><div>{item.description}<span className="block text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('pt-BR')}</span></div><span className="whitespace-nowrap">{item.amount > 0 ? '+' : ''}{item.amount}</span></li>)}
        </ul>
      </details>
    </>}
  </section>;
}
