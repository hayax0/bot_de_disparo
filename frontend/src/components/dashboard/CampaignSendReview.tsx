'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, Send, X } from 'lucide-react';
import { api } from '@/lib/api';

type ReviewLead = { id: string; title: string; phone: string; message: string; status: string; hasWebsite: boolean; aiGenerated: boolean };
type Review = { campaignName: string; token: string; expiresAt: number; eligibleCount: number; batchLimit: number; leads: ReviewLead[] };
export function CampaignSendReview({ campaignId, retryFailed, connected, onClose, onStarted, onReady }: {
  campaignId: string; retryFailed: boolean; connected: boolean; onClose: () => void; onStarted: (message: string) => void; onReady: () => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [stale, setStale] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const callbacks = useRef({ onReady, onStarted });
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const requestId = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { callbacks.current = { onReady, onStarted }; }, [onReady, onStarted]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const load = useCallback(async () => {
    const request = ++requestId.current;
    try {
      const { data } = await api.post<Review>(`/campaigns/${campaignId}/send-review`, { retryFailed });
      if (!mounted.current || request !== requestId.current) return;
      setReview(data); setStale(false); setEditing(null); setError(''); setConfirmed(false);
      setSelected(current => new Set(data.leads.filter(lead => current ? current.has(lead.id) : Boolean(lead.message)).map(lead => lead.id)));
      setPage(0); if (data.leads.some(lead => lead.message)) callbacks.current.onReady();
    } catch (cause) { if (mounted.current && request === requestId.current) setError(axios.isAxiosError(cause) ? cause.response?.data?.error || 'Não foi possível carregar a revisão.' : 'Não foi possível carregar a revisão.'); }
    finally { if (mounted.current && request === requestId.current) setLoading(false); }
  }, [campaignId, retryFailed]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  const save = async () => {
    if (!editing || !draft.trim() || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await api.put(`/campaigns/${campaignId}/leads/${editing}/message`, { messageContent: draft.trim() });
      setStale(true); await load();
    } catch (cause) { setError(axios.isAxiosError(cause) ? cause.response?.data?.error || 'Não foi possível salvar.' : 'Não foi possível salvar.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const start = async () => {
    if (!connected || !review || !selected?.size || !confirmed || stale || editing || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const { data } = await api.post(`/campaigns/${campaignId}/${retryFailed ? 'retry-failed' : 'start'}`, { token: review.token, leadIds: [...selected] });
      callbacks.current.onStarted(data.message || 'Campanha iniciada.');
    } catch (cause) {
      if (axios.isAxiosError(cause) && cause.response?.status === 409) { setStale(true); setConfirmed(false); }
      setError(axios.isAxiosError(cause) ? cause.response?.data?.error || 'Não foi possível iniciar. Confira a conexão e tente novamente.' : 'Não foi possível iniciar.');
    } finally { inFlight.current = false; setBusy(false); }
  };
  const rows = review?.leads.slice(page * 10, (page + 1) * 10) || [];
  const selectable = review?.leads.filter(lead => lead.message) || [];
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="send-review-title" className="m-auto w-[calc(100%_-_1.5rem)] max-w-3xl max-h-[92dvh] rounded-3xl border border-[var(--studio-line)] bg-[var(--studio-surface)] text-[var(--studio-ink)] p-0 backdrop:bg-black/80 backdrop:backdrop-blur-sm">
    <div className="p-5 sm:p-7 space-y-5">
      <header className="flex justify-between gap-4"><div><span className="studio-eyebrow">ANTES DO PRIMEIRO ENVIO</span><h2 id="send-review-title" className="text-2xl font-semibold mt-2">Revise. Escolha. Envie.</h2><p className="text-sm text-[var(--studio-muted)] mt-1">{review?.campaignName || 'Preparando sua campanha'}{retryFailed ? ' · Inclui falhas sem envio iniciado' : ''}</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Fechar revisão" className="self-start p-2"><X size={20} /></button></header>
      <div className="rounded-2xl border border-[var(--studio-line)] p-4 text-sm space-y-1"><p className="text-[var(--studio-accent)]">Revisão e edição manual: 0 créditos de IA.</p><p className="text-xs text-[var(--studio-muted)]">Estas são as mensagens finais, com variáveis e variações já resolvidas. O envio usa sua franquia de disparos. A IA só consome créditos quando você solicita geração ou regeneração.</p></div>
      {loading ? <p role="status" className="flex items-center gap-2 text-sm"><RefreshCw size={16} className="animate-spin" />Carregando destinatários e mensagens…</p> : review && <>
        <div className="flex flex-wrap justify-between gap-3 items-center text-sm"><strong>{selected?.size || 0} contatos selecionados</strong><button type="button" disabled={busy || Boolean(editing)} className="text-[var(--studio-accent)]" onClick={() => { setSelected(new Set(selected?.size === selectable.length ? [] : selectable.map(lead => lead.id))); setConfirmed(false); }}>{selected?.size === selectable.length ? 'Desmarcar todos' : 'Selecionar todos com mensagem'}</button></div>
        {review.eligibleCount > review.batchLimit && <p className="text-xs text-[var(--studio-muted)]">Exibindo os primeiros {review.batchLimit} de {review.eligibleCount} contatos elegíveis. Após este lote, os demais continuam pendentes para uma nova revisão.</p>}
        {review.leads.length === 0 && <p className="text-sm text-[var(--studio-muted)]">Não há contatos elegíveis. Envios já feitos, bloqueados ou sem confirmação não serão repetidos.</p>}
        <div className="space-y-3">{rows.map(lead => <article key={lead.id} className="rounded-2xl border border-[var(--studio-line)] p-4 space-y-3">
          <label className="flex items-start gap-3"><input type="checkbox" checked={selected?.has(lead.id) || false} disabled={busy || !lead.message || Boolean(editing)} onChange={event => { setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(lead.id); else next.delete(lead.id); return next; }); setConfirmed(false); }} className="mt-1 accent-[var(--studio-accent)]" /><span className="min-w-0"><strong className="block text-sm break-words">{lead.title}</strong><small className="text-[var(--studio-muted)]">{lead.phone} · {lead.hasWebsite ? 'Com site próprio' : 'Sem site próprio'} · {lead.aiGenerated ? 'Mensagem de IA / editada' : 'Mensagem da campanha / editada'}</small></span></label>
          {editing === lead.id ? <><textarea autoFocus aria-label={`Mensagem para ${lead.title}`} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={4} className="dash-input w-full p-3 text-sm" /><div className="flex gap-3"><button type="button" disabled={busy || !draft.trim()} onClick={save} className="dash-btn-primary px-4 py-2 text-xs">Salvar e atualizar revisão</button><button type="button" disabled={busy} onClick={() => setEditing(null)} className="dash-btn-secondary px-4 py-2 text-xs">Cancelar edição</button></div></> : <><p className="whitespace-pre-wrap break-words text-sm leading-relaxed bg-[var(--studio-bg)] rounded-xl p-3">{lead.message || 'Sem mensagem. Edite antes de selecionar este contato.'}</p>{lead.status === 'PENDING' && <button type="button" disabled={busy || Boolean(editing)} className="text-xs text-[var(--studio-accent)]" onClick={() => { setEditing(lead.id); setDraft(lead.message); setConfirmed(false); }}>Editar mensagem gratuitamente</button>}</>}
        </article>)}</div>
        {review.leads.length > 10 && <nav aria-label="Páginas da revisão" className="flex justify-between items-center text-xs"><button type="button" aria-label="Página anterior da revisão" disabled={page === 0 || busy || Boolean(editing)} onClick={() => setPage(page - 1)} className="dash-btn-secondary p-2 disabled:opacity-30"><ChevronLeft size={16} /></button><span>Página {page + 1} de {Math.ceil(review.leads.length / 10)}</span><button type="button" aria-label="Próxima página da revisão" disabled={(page + 1) * 10 >= review.leads.length || busy || Boolean(editing)} onClick={() => setPage(page + 1)} className="dash-btn-secondary p-2 disabled:opacity-30"><ChevronRight size={16} /></button></nav>}
        {review.leads.length > 0 && <label className="flex items-start gap-3 text-sm border-t border-[var(--studio-line)] pt-4"><input type="checkbox" checked={confirmed} disabled={busy || Boolean(editing) || stale} onChange={event => setConfirmed(event.target.checked)} className="mt-1 accent-[var(--studio-accent)]" /><span>Revisei as mensagens e quero enviar somente aos {selected?.size || 0} contatos selecionados.<small className="block text-[var(--studio-muted)] mt-1">Os não selecionados continuam pendentes. O envio só começa após a confirmação abaixo.</small></span></label>}
      </>}
      {!connected && <p role="status" className="text-sm text-amber-300">Você pode revisar agora. Para iniciar os envios, volte ao painel e conecte o WhatsApp.</p>}
      {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
      <footer className="flex flex-wrap justify-end gap-3 border-t border-[var(--studio-line)] pt-4"><button type="button" disabled={busy} onClick={onClose} className="dash-btn-secondary px-4 py-2.5 text-sm">Voltar à campanha</button><button type="button" disabled={busy || loading || Boolean(editing)} onClick={() => { setLoading(true); setConfirmed(false); void load(); }} className="dash-btn-secondary px-4 py-2.5 text-sm">Atualizar revisão</button><button type="button" disabled={!connected || busy || loading || stale || !confirmed || !selected?.size || Boolean(editing)} onClick={start} className="dash-btn-primary px-5 py-2.5 text-sm flex gap-2 items-center disabled:opacity-40">{busy ? <RefreshCw className="animate-spin" size={16} /> : <Send size={16} />}Confirmar e iniciar envios</button></footer>
      {!loading && !error && review && <p className="flex gap-2 items-center text-xs text-[var(--studio-muted)]"><CheckCircle2 size={14} />Revisão válida por 15 minutos. Alterações posteriores exigem uma nova conferência.</p>}
    </div>
  </dialog>;
}
