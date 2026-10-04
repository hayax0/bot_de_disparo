"use client";
import { useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/lib/api';

export function ApifyConnection({ onConnectionChange }: { onConnectionChange: (ready: boolean) => void }) {
  const [account, setAccount] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Verificando conexão…');
  useEffect(() => {
    let active = true;
    api.get('/integrations/apify').then(({ data }) => {
      if (!active) return;
      setAccount(data.configured ? data.accountName : null);
      onConnectionChange(data.configured);
      setMessage(data.configured ? 'Chave salva. As buscas serão cobradas na sua conta Apify.' : 'Conecte sua conta para começar.');
    }).catch(() => { if (active) setMessage('Não foi possível verificar a conexão. Recarregue a página.'); });
    return () => { active = false; };
  }, [onConnectionChange]);
  async function update(remove = false) {
    setBusy(true);
    try {
      const { data } = remove ? await api.delete('/integrations/apify') : await api.put('/integrations/apify', { token });
      setToken('');
      setAccount(data.configured ? data.accountName : null);
      onConnectionChange(data.configured);
      setMessage(remove ? 'Chave removida da plataforma.' : 'Conta validada e chave salva! Nenhuma busca foi iniciada.');
    } catch (error) {
      setMessage(axios.isAxiosError(error) ? error.response?.data?.error || 'Não foi possível conectar. Tente novamente.' : 'Falha ao atualizar conexão.');
    } finally { setBusy(false); }
  }
  return <section className="dash-card rounded-2xl p-5 space-y-4 border border-white/10">
    <div><h3 className="text-white font-semibold">Sua conta Apify {account && <span className="text-emerald-400 text-sm">• Conectada: {account}</span>}</h3>
      <p className="text-sm text-slate-400 mt-2">Busque empresas aqui usando sua própria conta Apify. O consumo é cobrado pela Apify, conforme seu saldo e plano. Créditos de IA da plataforma não são usados nas buscas.</p></div>
    <details className="text-sm text-slate-300" open={!account}>
      <summary className="cursor-pointer text-emerald-400 font-medium">Como conectar minha Apify — passo a passo</summary>
      <ol className="list-decimal pl-5 space-y-2 mt-3">
        <li>Crie uma conta ou entre em <a className="underline" href="https://console.apify.com/" target="_blank" rel="noopener noreferrer">console.apify.com</a>.</li>
        <li>Nas configurações, abra <strong>API &amp; Integrations</strong> e crie um token exclusivo para esta plataforma. Copie a chave API.</li>
        <li>Se limitar as permissões, permita verificar a conta, executar o Google Maps Scraper (<strong>compass/crawler-google-places</strong>), consultar suas execuções e ler os dados de entrada e resultados. Validar a conta não confirma todas essas permissões.</li>
        <li>Cole a chave abaixo e clique em <strong>Validar e salvar</strong>. Essa validação não inicia uma busca paga. Guardamos a chave criptografada e não a exibimos novamente.</li>
        <li>Confira seu saldo em Usage/Billing na Apify. Depois escolha segmento, cidade e quantidade aqui. Você não precisa baixar nem arrastar JSON ou planilhas.</li>
      </ol>
      <p className="mt-3 text-amber-200">A Apify pode cobrar pela extração mesmo se descartarmos empresas sem telefone ou repetidas. Remover a chave aqui não revoga o token na Apify. Para revogá-lo, use o painel da Apify.</p>
      <a className="block mt-2 underline" href="https://docs.apify.com/integrations/api" target="_blank" rel="noopener noreferrer">Guia oficial de tokens e permissões</a>
    </details>
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void update(); }}>
      <label htmlFor="apify-key" className="sr-only">Chave API da Apify</label>
      <input id="apify-key" type="password" autoComplete="new-password" value={token} onChange={event => setToken(event.target.value)} placeholder={account ? 'Nova chave para substituir a atual' : 'Cole sua chave API Apify'} className="min-w-0 flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-white" />
      <button disabled={busy || !token.trim()} className="dash-btn-primary px-4 py-2 disabled:opacity-40">{busy ? 'Aguarde…' : 'Validar e salvar'}</button>
      {account && <button type="button" disabled={busy} onClick={() => void update(true)} className="dash-btn-secondary px-4 py-2">Remover chave</button>}
    </form>
    <p role="status" className="text-sm text-slate-300">{message}</p>
  </section>;
}
