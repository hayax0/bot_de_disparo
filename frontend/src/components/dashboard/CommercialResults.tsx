'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BarChart3, CalendarCheck, MessageSquare, RefreshCw, Users } from 'lucide-react';
import { api } from '@/lib/api';

type CampaignRow = { campaignId: string; name: string; total: number; sent: number; replied: number; responseRate: number | null; interested: number; meetings: number; inConversation: number; noResponse: number; notInterested: number; unclassified: number };
type Metrics = { summary: { total: number; sent: number; replied: number; interested: number; meetings: number }; campaigns: CampaignRow[] };
export function CommercialResults({ onOpenCampaign }: { onOpenCampaign: (id: string) => void }) {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(0);
  const request = useRef(0);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const sequence = ++request.current;
      setLoading(true);
      try {
        const response = await api.get<Metrics>('/campaigns/commercial-metrics');
        if (!mounted || sequence !== request.current) return;
        setData(response.data); setError(''); setUpdatedAt(new Date());
      } catch { if (mounted && sequence === request.current) setError('Não foi possível atualizar os resultados. Tente novamente.'); }
      finally { if (mounted && sequence === request.current) setLoading(false); }
    };
    refresh.current = () => { void load(); };
    void Promise.resolve().then(load);
    const update = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = setInterval(update, 30000);
    window.addEventListener('commercial:updated', update);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('commercial:updated', update); };
  }, []);
  const rows = useMemo(() => {
    const filtered = (data?.campaigns || []).filter(row => row.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
    if (sort !== 'recent') filtered.sort((a, b) => b[sort as 'replied' | 'interested' | 'meetings'] - a[sort as 'replied' | 'interested' | 'meetings'] || a.name.localeCompare(b.name));
    return filtered;
  }, [data, query, sort]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 10) - 1));
  const stats = [
    { label: 'Contatos únicos', value: data?.summary.total, hint: 'Contatos identificáveis nas suas campanhas', icon: Users },
    { label: 'Respondidos no WhatsApp', value: data?.summary.replied, hint: 'Respostas detectadas; não significa interesse', icon: MessageSquare },
    { label: 'Interessados atuais', value: data?.summary.interested, hint: 'Classificados manualmente por você', icon: BarChart3 },
    { label: 'Reuniões marcadas', value: data?.summary.meetings, hint: 'Contatos com reunião registrada manualmente', icon: CalendarCheck },
  ];
  return <section aria-label="Resultados comerciais" className="space-y-5">
    <header className="flex flex-wrap justify-between items-start gap-4"><div><span className="studio-eyebrow">DA ABORDAGEM À OPORTUNIDADE</span><h2 className="text-2xl font-semibold tracking-tight mt-2">Conversa é o começo. Acompanhe o que vem depois.</h2><p className="text-sm text-[var(--studio-muted)] mt-2">Compare suas campanhas e registre a evolução comercial dos contatos.</p></div><button type="button" disabled={loading} onClick={() => refresh.current()} className="dash-btn-secondary px-4 py-2.5 text-xs flex gap-2 items-center"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Atualizar resultados</button></header>
    {error && <p role="alert" className="rounded-xl border border-amber-500/30 p-4 text-sm text-amber-300">{error}{data ? ' Os dados abaixo são da última atualização.' : ''}</p>}
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{stats.map(stat => <div key={stat.label} className="dash-card p-5 space-y-3"><stat.icon size={19} className="text-[var(--studio-accent)]" /><p className="text-xs text-[var(--studio-muted)]">{stat.label}</p><strong className="block text-3xl font-semibold tabular-nums">{data ? stat.value?.toLocaleString('pt-BR') : '—'}</strong><p className="text-xs text-[var(--studio-muted)]">{stat.hint}</p></div>)}</div>
    <div className="dash-card p-4 text-xs text-[var(--studio-muted)] space-y-2 leading-relaxed"><p>O resumo conta cada telefone uma vez no seu workspace. Na tabela, o mesmo contato pode aparecer em várias campanhas: os números das linhas não devem ser somados.</p><p>Interesse e reunião mostram a situação atual dos contatos de cada lista, registrada por você. Não atribuem uma venda à campanha. Entrega e leitura nunca viram interesse automaticamente.</p><p>Taxa de resposta = contatos com status “Respondeu” ÷ contatos com envio confirmado na campanha. Respostas fora da plataforma ou não detectadas não entram; essa taxa não mede vendas.</p></div>
    <div className="flex flex-wrap gap-3"><input aria-label="Buscar campanha nos resultados" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Buscar campanha…" className="dash-input rounded-xl p-3 text-sm flex-1 min-w-0" /><select aria-label="Ordenar comparação de campanhas" value={sort} onChange={event => { setSort(event.target.value); setPage(0); }} className="dash-input rounded-xl p-3 text-sm"><option value="recent">Mais recentes</option><option value="replied">Mais respostas</option><option value="interested">Mais interessados atuais</option><option value="meetings">Mais reuniões registradas</option></select></div>
    <div className="dash-card overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Comparação de envios, respostas e acompanhamento manual por campanha</caption><thead className="text-xs text-[var(--studio-muted)] border-b border-[var(--studio-line)]"><tr>{['Campanha', 'Contatos', 'Envios confirmados', 'Respondidos', 'Taxa de resposta', 'Em conversa', 'Interessados atuais', 'Reuniões registradas', 'Acompanhar'].map(label => <th key={label} className="p-4 whitespace-nowrap font-medium">{label}</th>)}</tr></thead><tbody>{rows.slice(currentPage * 10, (currentPage + 1) * 10).map(row => <tr key={row.campaignId} className="border-b border-[var(--studio-line)] last:border-0"><td className="p-4 min-w-48 max-w-72 break-words font-semibold">{row.name}</td>{[row.total, row.sent, row.replied].map((value, i) => <td key={i} className="p-4 tabular-nums">{value}</td>)}<td className="p-4 tabular-nums">{row.responseRate === null ? '—' : `${row.responseRate.toLocaleString('pt-BR')}%`}</td><td className="p-4 tabular-nums">{row.inConversation}</td><td className="p-4 tabular-nums text-[var(--studio-accent)]">{row.interested}</td><td className="p-4 tabular-nums">{row.meetings}</td><td className="p-4"><button type="button" onClick={() => onOpenCampaign(row.campaignId)} aria-label={`Acompanhar ${row.name}`} className="dash-btn-secondary p-2"><ArrowUpRight size={16} /></button></td></tr>)}{!rows.length && <tr><td colSpan={9} className="p-8 text-center text-[var(--studio-muted)]">{loading ? 'Carregando resultados…' : !data ? 'Resultados indisponíveis. Use Atualizar resultados.' : query ? 'Nenhuma campanha encontrada com essa busca.' : 'Crie sua primeira campanha para começar o acompanhamento.'}</td></tr>}</tbody></table></div>
    <footer className="flex flex-wrap justify-between items-center gap-3 text-xs text-[var(--studio-muted)]"><span>{updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString('pt-BR')}` : 'Aguardando atualização'}</span>{rows.length > 10 && <div className="flex items-center gap-3"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="dash-btn-secondary px-3 py-2 disabled:opacity-30">Anterior</button><span>Página {currentPage + 1} de {Math.ceil(rows.length / 10)}</span><button type="button" disabled={(currentPage + 1) * 10 >= rows.length} onClick={() => setPage(currentPage + 1)} className="dash-btn-secondary px-3 py-2 disabled:opacity-30">Próxima</button></div>}</footer>
  </section>;
}
