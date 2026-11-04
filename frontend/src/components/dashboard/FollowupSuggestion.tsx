'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Copy, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';

/** Rascunho local: este componente nunca altera a mensagem do lead nem dispara WhatsApp. */
export function FollowupSuggestion({ campaignId, leadId, onDirtyChange, onBusyChange }: {
  campaignId: string; leadId: string; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [goal, setGoal] = useState('');
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [terminalFailure, setTerminalFailure] = useState(false);
  const mounted = useRef(false);
  const running = useRef(false);
  const operation = useRef<{ payload: string; key: string; completed: boolean } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirtyChange(Boolean(goal || message)); }, [goal, message, onDirtyChange]);
  const generate = async () => {
    if (running.current || !confirmed || goal.trim().length < 5) return;
    const payload = goal.trim();
    if (!operation.current || operation.current.payload !== payload || operation.current.completed) {
      operation.current = { payload, key: crypto.randomUUID(), completed: false };
    }
    // Falhas de rede mantêm a chave. Uma nova sugestão após sucesso é uma nova compra explícita.
    const current = operation.current;
    running.current = true; setTerminalFailure(false); setCompleted(false); setBusy(true); onBusyChange(true); setError(''); setCopied(false);
    try {
      const { data } = await api.post(`/campaigns/${campaignId}/leads/${leadId}/ai-regenerate`, { purpose: 'FOLLOW_UP', offerDescription: payload, toneStyle: 'DIRECT', idempotencyKey: current.key });
      if (!mounted.current) return;
      if (typeof data.messageContent !== 'string' || !data.messageContent.trim()) throw new Error('EMPTY_RESULT');
      current.completed = true; setCompleted(true);
      setMessage(data.messageContent); setConfirmed(false);
      window.dispatchEvent(new Event('credits:updated'));
    } catch (cause) {
      if (axios.isAxiosError(cause) && cause.response?.status === 422) {
        // A operação falhou de forma terminal. Repeti-la exige uma nova tentativa confirmada.
        current.completed = true;
        if (mounted.current) { setTerminalFailure(true); setConfirmed(false); }
      }
      if (mounted.current) setError(axios.isAxiosError(cause) ? cause.response?.data?.error || 'Não foi possível confirmar o resultado. Tente novamente com a mesma orientação para recuperar esta operação sem cobrança duplicada.' : 'Não foi possível recuperar a sugestão. Tente novamente com a mesma orientação.');
    } finally {
      running.current = false;
      if (mounted.current) { setBusy(false); onBusyChange(false); }
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); setError(''); }
    catch { setError('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.'); }
  };
  return <section aria-label="Sugestão de retorno com IA" className="rounded-2xl border border-[var(--studio-line)] p-4 space-y-3">
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="text-sm font-medium inline-flex gap-2 items-center text-[var(--studio-accent)]"><Sparkles size={16} />Preparar mensagem de retorno com IA</button>
    {expanded && <div className="space-y-3">
      <p className="text-xs text-[var(--studio-muted)] leading-relaxed">A IA sugere uma mensagem curta para retomar esta conversa. Uma geração concluída usa 1 crédito de IA; contas ilimitadas seguem sua condição. Editar e copiar é grátis. Nenhuma mensagem será enviada ou substituída na campanha.</p>
      <label className="block space-y-2 text-sm"><span>O que você quer retomar?</span><textarea aria-label="Orientação para a mensagem de retorno" value={goal} maxLength={1000} rows={3} disabled={busy} placeholder="Ex.: Retomar a proposta de criação de site e perguntar se posso enviar exemplos. Sem inventar que ele respondeu." onChange={event => { setGoal(event.target.value); setTerminalFailure(false); setCompleted(false); setConfirmed(false); setCopied(false); }} className="dash-input w-full rounded-xl p-3 text-sm" /><small className="block text-xs text-[var(--studio-muted)] text-right">{goal.length}/1.000</small></label>
      <label className="flex items-start gap-2 text-xs text-[var(--studio-muted)]"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5 accent-[var(--studio-accent)]" /><span>Confirmo gerar esta sugestão com custo de até 1 crédito de IA.</span></label>
      <button type="button" disabled={busy || !confirmed || goal.trim().length < 5} onClick={() => void generate()} className="dash-btn-primary px-3 py-2 text-xs inline-flex items-center gap-2 disabled:opacity-40">{busy ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}{busy ? 'Preparando sugestão…' : terminalFailure ? 'Tentar nova sugestão · 1 crédito' : completed ? 'Nova sugestão · 1 crédito' : 'Gerar retorno · 1 crédito'}</button>
      {message && <><label className="block space-y-2 text-sm"><span>Rascunho do retorno</span><textarea aria-label="Rascunho da mensagem de retorno" value={message} maxLength={2000} disabled={busy} rows={4} onChange={event => { setMessage(event.target.value); setCopied(false); }} className="dash-input w-full rounded-xl p-3 text-sm" /></label><button type="button" onClick={() => void copy()} disabled={!message.trim() || busy} className="dash-btn-secondary px-3 py-2 text-xs inline-flex items-center gap-2"><Copy size={14} />{copied ? 'Copiado' : 'Copiar mensagem'}</button><p className="text-xs text-[var(--studio-muted)]">Revise e use o texto na conversa de sua escolha. Copiar não envia. Este rascunho existe apenas nesta janela.</p></>}
      {(goal || message) && <button type="button" disabled={busy} onClick={() => { setGoal(''); setMessage(''); setTerminalFailure(false); setCompleted(false); setConfirmed(false); setError(''); setCopied(false); operation.current = null; }} className="block text-xs text-[var(--studio-muted)] underline">Descartar rascunho da IA</button>}
      {error && <p role="alert" className="text-xs text-amber-300">{error}{message ? ' O rascunho anterior continua disponível.' : ''}</p>}
    </div>}
  </section>;
}
