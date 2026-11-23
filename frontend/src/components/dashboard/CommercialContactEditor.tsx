'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { CalendarCheck, CalendarClock, Check, RefreshCw, Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { commercialDay, localCommercialDay, reminderLabel } from '@/lib/commercialDates';
import { FollowupSuggestion } from './FollowupSuggestion';

export const COMMERCIAL_STAGES = {
  UNCLASSIFIED: 'Não classificado', NO_RESPONSE: 'Não respondeu', IN_CONVERSATION: 'Em conversa', INTERESTED: 'Interessado', NOT_INTERESTED: 'Não tem interesse',
} as const;
export type CommercialStage = keyof typeof COMMERCIAL_STAGES;
export type CommercialRecord = { stage: CommercialStage; notes: string; meetingBooked: boolean; nextContactAt: string | null; saleAmount: string | null; saleDate: string | null; version: number; updatedAt: string | null };
const empty: CommercialRecord = { stage: 'UNCLASSIFIED', notes: '', meetingBooked: false, nextContactAt: null, saleAmount: null, saleDate: null, version: 0, updatedAt: null };

export function CommercialContactEditor({ campaignId, lead, onClose, onSaved, initialStage }: {
  campaignId: string; lead: { id: string; title: string; phone: string }; onClose: () => void; onSaved: () => void; initialStage?: CommercialStage | 'MEETING' | 'WON';
}) {
  const [current, setCurrent] = useState<CommercialRecord | null>(null);
  const [draft, setDraft] = useState<CommercialRecord>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [aiDirty, setAiDirty] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const aiBusyRef = useRef(false);
  const updateAiBusy = useCallback((busy: boolean) => { aiBusyRef.current = busy; setAiBusy(busy); }, []);
  const mounted = useRef(false);
  const savingRef = useRef(false);
  const request = useRef(0);
  const initialStageRef = useRef(initialStage);
  const dialog = useRef<HTMLDialogElement>(null);
  const callbacks = useRef({ onSaved });
  useEffect(() => { callbacks.current = { onSaved }; }, [onSaved]);
  useEffect(() => { mounted.current = true; dialog.current?.showModal(); return () => { mounted.current = false; }; }, []);
  const load = useCallback(async () => {
    const sequence = ++request.current;
    try {
      const { data } = await api.get(`/campaigns/${campaignId}/leads/${lead.id}/commercial`);
      if (!mounted.current || sequence !== request.current) return;
      const record: CommercialRecord = { ...empty, ...data.commercial, nextContactAt: commercialDay(data.commercial.nextContactAt), saleDate: commercialDay(data.commercial.saleDate) };
      const initialDraft = { ...record };
      if (initialStageRef.current === 'MEETING') initialDraft.meetingBooked = true;
      else if (initialStageRef.current === 'WON') initialDraft.saleDate ||= localCommercialDay();
      else if (initialStageRef.current) initialDraft.stage = initialStageRef.current;
      setCurrent(record); setDraft(initialDraft); setError(''); setConflict(false); setSaved(false); setDiscard(false);
    } catch (cause) { if (mounted.current && sequence === request.current) setError(axios.isAxiosError(cause) ? cause.response?.data?.error || 'Não foi possível carregar o acompanhamento.' : 'Não foi possível carregar o acompanhamento.'); }
    finally { if (mounted.current && sequence === request.current) setLoading(false); }
  }, [campaignId, lead.id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const dirty = Boolean(current && (draft.stage !== current.stage || draft.notes !== current.notes || draft.meetingBooked !== current.meetingBooked || draft.nextContactAt !== current.nextContactAt || draft.saleAmount !== current.saleAmount || draft.saleDate !== current.saleDate));
  const close = () => { if (savingRef.current || aiBusyRef.current) return; if (dirty || aiDirty) setDiscard(true); else onClose(); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!current || savingRef.current || aiBusyRef.current || conflict) return;
    const hasSale = draft.saleAmount !== null || draft.saleDate !== null;
    if (hasSale && (!draft.saleAmount || !Number.isFinite(Number(draft.saleAmount)) || Number(draft.saleAmount) <= 0 || !draft.saleDate)) {
      setError('Para registrar a venda, informe um valor maior que zero e a data da venda.');
      return;
    }
    savingRef.current = true; setSaving(true); setError(''); setSaved(false);
    try {
      const { data } = await api.put(`/campaigns/${campaignId}/leads/${lead.id}/commercial`, { stage: draft.stage, notes: draft.notes, meetingBooked: draft.meetingBooked, nextContactAt: draft.nextContactAt, saleAmount: hasSale ? draft.saleAmount : null, saleDate: hasSale ? draft.saleDate : null, version: current.version });
      if (!mounted.current) return;
      const record: CommercialRecord = { ...empty, ...data.commercial, nextContactAt: commercialDay(data.commercial.nextContactAt), saleDate: commercialDay(data.commercial.saleDate) };
      setCurrent(record); setDraft(record); setSaved(true);
      window.dispatchEvent(new Event('commercial:updated')); callbacks.current.onSaved();
    } catch (cause) {
      if (!mounted.current) return;
      if (axios.isAxiosError(cause) && cause.response?.status === 409) setConflict(true);
      setError(axios.isAxiosError(cause) ? cause.response?.data?.error || 'Não foi possível salvar. Seu rascunho continua aqui.' : 'Não foi possível salvar. Seu rascunho continua aqui.');
    } finally { savingRef.current = false; if (mounted.current) setSaving(false); }
  };
  return <dialog ref={dialog} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="commercial-editor-title" className="m-auto w-[calc(100%_-_1.5rem)] max-w-xl max-h-[92dvh] overflow-y-auto rounded-3xl border border-[var(--studio-line)] bg-[var(--studio-surface)] text-[var(--studio-ink)] p-0 backdrop:bg-black/80 backdrop:backdrop-blur-sm">
    <form onSubmit={save} className="p-5 sm:p-7 space-y-5">
      <header className="flex justify-between items-start gap-4"><div><span className="studio-eyebrow">ALÉM DO DISPARO</span><h2 id="commercial-editor-title" className="text-xl font-semibold mt-2">Acompanhar contato</h2><p className="text-sm mt-1 break-words">{lead.title}</p><p className="text-xs text-[var(--studio-muted)] mt-1">{lead.phone}</p></div><button type="button" aria-label="Fechar acompanhamento" disabled={saving || aiBusy} onClick={close} className="p-2"><X size={19} /></button></header>
      <p className="text-xs text-[var(--studio-muted)] leading-relaxed">Classificação e anotações são compartilhadas por este telefone entre suas campanhas. Registrar ou editar é grátis. Isso não altera mensagens, créditos nem o status do envio.</p>
      {loading ? <p role="status" className="flex gap-2 text-sm"><RefreshCw size={16} className="animate-spin" />Carregando acompanhamento…</p> : current && <>
        <label className="block space-y-2 text-sm"><span>Etapa comercial · preenchimento manual</span><select aria-label="Etapa comercial do contato" value={draft.stage} disabled={saving || conflict} onChange={event => { setDraft(value => ({ ...value, stage: event.target.value as CommercialStage })); setSaved(false); }} className="dash-input w-full p-3 rounded-xl">{Object.entries(COMMERCIAL_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <section aria-label="Registro de venda" className="rounded-2xl border border-[var(--studio-line)] p-4 space-y-3">
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={draft.saleAmount !== null || draft.saleDate !== null} disabled={saving || conflict} onChange={event => { setDraft(value => ({ ...value, saleAmount: event.target.checked ? (value.saleAmount ?? '') : null, saleDate: event.target.checked ? (value.saleDate || localCommercialDay()) : null })); setSaved(false); }} className="mt-1 accent-[var(--studio-accent)]" /><span><span className="font-medium">Registrar venda realizada</span><small className="mt-1 block text-xs text-[var(--studio-muted)]">O valor e a data entram no gráfico do seu workspace. Você pode corrigir ou remover o registro depois.</small></span></label>
          {(draft.saleAmount !== null || draft.saleDate !== null) && <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2 text-sm"><span>Valor vendido (R$)</span><input type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" required value={draft.saleAmount ?? ''} disabled={saving || conflict} onChange={event => { setDraft(value => ({ ...value, saleAmount: event.target.value })); setSaved(false); }} placeholder="Ex.: 850,00" className="dash-input w-full rounded-xl p-3 [color-scheme:dark]" /></label>
            <label className="block space-y-2 text-sm"><span>Data da venda</span><input type="date" required value={draft.saleDate || ''} disabled={saving || conflict} onChange={event => { setDraft(value => ({ ...value, saleDate: event.target.value || null })); setSaved(false); }} className="dash-input w-full rounded-xl p-3 [color-scheme:dark]" /></label>
          </div>}
        </section>
        <label className="flex items-start gap-3 rounded-2xl border border-[var(--studio-line)] p-4 text-sm"><input type="checkbox" checked={draft.meetingBooked} disabled={saving || conflict} onChange={event => { setDraft(value => ({ ...value, meetingBooked: event.target.checked })); setSaved(false); }} className="mt-1 accent-[var(--studio-accent)]" /><span className="flex-1"><span className="flex gap-2 items-center"><CalendarCheck size={16} className="text-[var(--studio-accent)]" />Reunião marcada com este contato</span><small className="block text-[var(--studio-muted)] mt-1">Marque somente depois de combinar a reunião. Esta opção não agenda nem envia convites.</small></span></label>
        <section aria-label="Lembrete de retorno" className="rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-accent)]/[0.03] p-4 space-y-3">
          <label className="block space-y-2 text-sm"><span className="flex items-center gap-2"><CalendarClock size={16} className="text-[var(--studio-accent)]" />Próximo contato</span><input type="date" aria-label="Data do próximo contato" value={draft.nextContactAt || ''} disabled={saving || conflict} onChange={event => { setDraft(value => ({ ...value, nextContactAt: event.target.value || null })); setSaved(false); }} className="dash-input w-full p-3 rounded-xl [color-scheme:dark]" /></label>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={saving || conflict} onClick={() => { setDraft(value => ({ ...value, nextContactAt: localCommercialDay() })); setSaved(false); }} className="dash-btn-secondary px-3 py-2 text-xs">Hoje</button><button type="button" disabled={saving || conflict} onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); setDraft(value => ({ ...value, nextContactAt: localCommercialDay(tomorrow) })); setSaved(false); }} className="dash-btn-secondary px-3 py-2 text-xs">Amanhã</button></div>
          <div className="flex items-center justify-between flex-wrap gap-3"><p className={`text-xs ${draft.nextContactAt && draft.nextContactAt < localCommercialDay() ? 'text-amber-300' : 'text-[var(--studio-muted)]'}`}>{reminderLabel(draft.nextContactAt, localCommercialDay())}</p>{draft.nextContactAt && <button type="button" disabled={saving || conflict} onClick={() => { setDraft(value => ({ ...value, nextContactAt: null })); setSaved(false); }} className="dash-btn-secondary px-3 py-2 text-xs flex items-center gap-2"><Check size={13} />Concluir / remover lembrete</button>}</div>
          <p className="text-xs text-[var(--studio-muted)] leading-relaxed">Escolha outro dia para remarcar. Salve o acompanhamento para confirmar. O dia segue seu calendário local; não há envio automático nem cobrança de créditos. Concluir remove o lembrete e não marca uma mensagem como enviada.</p>
        </section>
        <label className="block space-y-2 text-sm"><span>Anotações do contato</span><textarea aria-label="Anotações do contato" value={draft.notes} onChange={event => { setDraft(value => ({ ...value, notes: event.target.value })); setSaved(false); }} disabled={saving || aiBusy} maxLength={4000} rows={6} placeholder="Ex.: Pediu exemplos do serviço. Retomar a conversa na próxima semana." className="dash-input w-full p-3 rounded-xl text-sm" /><small className="block text-right text-[var(--studio-muted)]">{draft.notes.length}/4.000 caracteres</small></label>
        <p className="text-xs text-[var(--studio-muted)]">Leitura e entrega não classificam o contato automaticamente. “Não tem interesse” é uma anotação comercial; bloqueios e descadastros continuam sendo tratados pela lista de bloqueio.</p>
      </>}
      {current && <FollowupSuggestion campaignId={campaignId} leadId={lead.id} onDirtyChange={setAiDirty} onBusyChange={updateAiBusy} />}
      {aiBusy && <p role="status" className="text-xs text-[var(--studio-muted)]">Aguarde a sugestão de IA antes de fechar esta janela.</p>}
      {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
      {saved && <p role="status" className="text-sm text-[var(--studio-accent)]">Acompanhamento salvo. Disponível nas suas outras campanhas com este contato.</p>}
      {discard && <div className="rounded-xl border border-amber-500/30 p-4 space-y-3"><p className="text-sm">Existem alterações não salvas ou um rascunho local da IA.</p><div className="flex flex-wrap gap-3"><button type="button" onClick={() => setDiscard(false)} className="dash-btn-primary px-3 py-2 text-xs">Continuar editando</button><button type="button" disabled={saving || aiBusy} onClick={onClose} className="dash-btn-secondary px-3 py-2 text-xs">Descartar rascunho e fechar</button></div></div>}
      <footer className="flex flex-wrap gap-3 justify-end border-t border-[var(--studio-line)] pt-4"><button type="button" disabled={saving || aiBusy} onClick={close} className="dash-btn-secondary px-4 py-2.5 text-sm">Voltar</button>{(!current || conflict) && <button type="button" disabled={saving || loading || aiBusy} onClick={() => { setLoading(true); void load(); }} className="dash-btn-secondary px-4 py-2.5 text-sm">{conflict ? 'Descartar rascunho e carregar versão atual' : 'Tentar carregar novamente'}</button>}<button type="submit" disabled={loading || saving || aiBusy || !current || conflict || !dirty} className="dash-btn-primary px-4 py-2.5 text-sm inline-flex gap-2 items-center disabled:opacity-40">{saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}Salvar acompanhamento</button></footer>
    </form>
  </dialog>;
}
