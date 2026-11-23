'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CalendarCheck, CalendarClock, ChevronLeft, ChevronRight, Columns3, GripVertical, List, Pencil, RefreshCw, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { commercialDay, localCommercialDay, reminderLabel } from '@/lib/commercialDates';
import { CommercialContactEditor, type CommercialRecord, type CommercialStage } from './CommercialContactEditor';
import { SalesChart } from './SalesChart';

export type OpportunityContact = { campaignId: string; campaignName: string; leadId: string; title: string; phone: string; commercial: CommercialRecord };
type ContactPage = { contacts: OpportunityContact[]; total: number; page: number; pageSize: number; counts: { today: number; overdue: number; scheduled: number } };
type ReminderFilter = 'ALL' | 'TODAY' | 'OVERDUE' | 'UPCOMING' | 'UNSCHEDULED';
const REMINDERS: Array<{ value: ReminderFilter; label: string }> = [
  { value: 'ALL', label: 'Todos os contatos' }, { value: 'TODAY', label: 'Retomar hoje' }, { value: 'OVERDUE', label: 'Atrasados' }, { value: 'UPCOMING', label: 'Próximos dias' }, { value: 'UNSCHEDULED', label: 'Sem lembrete' },
];
type BoardStage = CommercialStage | 'MEETING' | 'WON';
type EditableContact = OpportunityContact & { initialStage?: BoardStage };
const COLUMNS: Array<{ id: BoardStage; label: string }> = [
  { id: 'UNCLASSIFIED', label: 'Não classificado' }, { id: 'NO_RESPONSE', label: 'Não respondeu' }, { id: 'IN_CONVERSATION', label: 'Em conversa' },
  { id: 'INTERESTED', label: 'Interessado' }, { id: 'MEETING', label: 'Reunião marcada' }, { id: 'WON', label: 'Venda realizada' }, { id: 'NOT_INTERESTED', label: 'Não tem interesse' },
];
const STAGE_ACCENTS: Record<BoardStage, string> = {
  UNCLASSIFIED: 'border-l-slate-400/60', NO_RESPONSE: 'border-l-sky-400/60', IN_CONVERSATION: 'border-l-violet-400/70',
  INTERESTED: 'border-l-emerald-400/70', MEETING: 'border-l-emerald-300', WON: 'border-l-amber-300', NOT_INTERESTED: 'border-l-rose-400/60',
};

function contactBoardStage(contact: OpportunityContact): BoardStage {
  if (contact.commercial.saleAmount !== null && contact.commercial.saleDate !== null) return 'WON';
  return contact.commercial.meetingBooked ? 'MEETING' : contact.commercial.stage;
}

function editableContact(contact: OpportunityContact, initialStage?: BoardStage): EditableContact {
  return { ...contact, initialStage };
}

export function CommercialOpportunities({ onOpenCampaign }: { onOpenCampaign?: (campaignId: string) => void }) {
  const [data, setData] = useState<ContactPage | null>(null);
  const [view, setView] = useState<'board' | 'reminders'>('board');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('ALL');
  const [reminder, setReminder] = useState<ReminderFilter>('ALL');
  const [page, setPage] = useState(1);
  const [today, setToday] = useState(localCommercialDay);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [editing, setEditing] = useState<EditableContact | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<BoardStage | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const request = useRef(0);
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const updateDay = () => { if (document.visibilityState === 'visible') setToday(localCommercialDay()); };
    const timer = setInterval(updateDay, 30000);
    document.addEventListener('visibilitychange', updateDay);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', updateDay); };
  }, []);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const sequence = ++request.current;
      setLoading(true);
      try {
        const response = await api.get<ContactPage>('/campaigns/commercial-contacts', { params: { search, stage: stage === 'MEETING' ? 'ALL' : stage, meeting: stage === 'MEETING' ? 'YES' : 'ALL', reminder, today, page, limit: 30 } });
        if (!mounted || sequence !== request.current) return;
        const lastPage = Math.max(1, Math.ceil(response.data.total / response.data.pageSize));
        if (page > lastPage) { setPage(lastPage); return; }
        setData(response.data); setUpdatedAt(new Date()); setError('');
      } catch { if (mounted && sequence === request.current) setError('Não foi possível atualizar as oportunidades. Tente novamente.'); }
      finally { if (mounted && sequence === request.current) setLoading(false); }
    };
    refresh.current = () => { void load(); };
    void Promise.resolve().then(load);
    const update = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = setInterval(update, 30000);
    window.addEventListener('commercial:updated', update);
    document.addEventListener('visibilitychange', update);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('commercial:updated', update); document.removeEventListener('visibilitychange', update); };
  }, [search, stage, reminder, today, page]);
  const columns = useMemo(() => COLUMNS.map(column => ({ ...column, contacts: (data?.contacts || []).filter(contact => contactBoardStage(contact) === column.id) })), [data]);
  const moveContact = async (contact: OpportunityContact, target: BoardStage) => {
    if (target === 'WON') {
      setEditing(editableContact(contact, 'WON'));
      return;
    }
    if (contact.commercial.saleAmount !== null || contact.commercial.saleDate !== null) {
      setError('Este contato já tem uma venda registrada. Edite ou remova o registro de venda antes de mudar a etapa.');
      return;
    }
    const key = `${contact.campaignId}:${contact.leadId}`;
    setMoving(key); setError('');
    try {
      const { data: response } = await api.put(`/campaigns/${contact.campaignId}/leads/${contact.leadId}/commercial`, {
        stage: target === 'MEETING' ? contact.commercial.stage : target,
        notes: contact.commercial.notes,
        meetingBooked: target === 'MEETING',
        nextContactAt: contact.commercial.nextContactAt,
        saleAmount: contact.commercial.saleAmount,
        saleDate: contact.commercial.saleDate,
        version: contact.commercial.version,
      });
      setData(current => current ? { ...current, contacts: current.contacts.map(item => item.phone === contact.phone ? { ...item, commercial: { ...item.commercial, ...response.commercial } } : item) } : current);
      window.dispatchEvent(new Event('commercial:updated'));
    } catch (cause) {
      const message = typeof cause === 'object' && cause !== null && 'response' in cause
        ? (cause as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      setError(message || 'Não foi possível mover este contato. A etapa anterior foi mantida.');
    } finally { setMoving(null); }
  };
  const chooseReminder = (value: ReminderFilter) => { setReminder(value); setPage(1); setView('reminders'); };
  const card = (contact: OpportunityContact) => {
    const date = commercialDay(contact.commercial.nextContactAt);
    const stageId = contactBoardStage(contact);
    const stageLabel = COLUMNS.find(column => column.id === stageId)?.label || 'Não classificado';
    const key = `${contact.campaignId}:${contact.leadId}`;
    const sold = stageId === 'WON';
    const canDrag = view === 'board' && !sold && moving !== key;
    return <article key={contact.phone} draggable={canDrag} onDragStart={event => { if (!canDrag) return; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', key); setDragging(key); }} onDragEnd={() => { setDragging(null); setDragTarget(null); }} className={`group rounded-2xl border border-[var(--studio-line)] border-l-2 ${STAGE_ACCENTS[stageId]} ${dragging === key ? 'opacity-45' : ''} bg-[var(--studio-bg)] p-4 space-y-3 min-w-0 transition-[background,border-color,transform,opacity] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.025] hover:border-[var(--studio-accent)]/40 ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <div className="flex gap-3 items-start justify-between"><div className="flex min-w-0 items-start gap-2"><GripVertical size={15} aria-hidden="true" className={`mt-0.5 shrink-0 text-[var(--studio-muted)] ${canDrag ? '' : 'opacity-30'}`} /><div className="min-w-0"><h4 className="text-sm font-semibold break-words">{contact.title}</h4><p className="text-xs text-[var(--studio-muted)] mt-1 break-all">{contact.phone}</p></div></div><button type="button" aria-label={`Editar acompanhamento de ${contact.title}`} onClick={() => setEditing(editableContact(contact))} className="dash-btn-secondary p-2 shrink-0"><Pencil size={14} /></button></div>
      <span className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[10px] text-[var(--studio-muted)]">{stageLabel}</span>
      {sold && <p className="text-xs font-medium text-amber-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(contact.commercial.saleAmount))} · venda em {commercialDay(contact.commercial.saleDate)}</p>}
      <p className="text-xs text-[var(--studio-muted)] break-words">{contact.campaignName}</p>
      <div className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${date && date < today ? 'text-amber-300 bg-amber-400/10' : date === today ? 'text-[var(--studio-accent)] bg-[var(--studio-accent)]/10' : 'text-[var(--studio-muted)] bg-white/[0.03]'}`}><CalendarClock size={12} />{reminderLabel(date, today)}</div>
      {contact.commercial.notes && <p className="text-xs text-[var(--studio-muted)] line-clamp-2 whitespace-pre-wrap break-words">{contact.commercial.notes}</p>}
      <div className="flex flex-wrap gap-2 items-center pt-1"><button type="button" onClick={() => setEditing(editableContact(contact))} className="dash-btn-secondary px-3 py-2 text-xs">{date ? 'Retomar / remarcar' : 'Acompanhar contato'}</button>{view === 'board' && <label className="sr-only" htmlFor={`move-${key}`}>Mover {contact.title} para outra etapa</label>}{view === 'board' && <select id={`move-${key}`} aria-label={`Mover ${contact.title} para outra etapa`} value="" disabled={sold || moving === key} onChange={event => { if (event.target.value) void moveContact(contact, event.target.value as BoardStage); }} title={sold ? 'Edite ou remova a venda registrada antes de mover este contato.' : 'Mover para outra etapa'} className="dash-input max-w-full rounded-xl px-2 py-2 text-xs disabled:opacity-50"><option value="" disabled>{sold ? 'Venda registrada' : 'Mover para…'}</option>{COLUMNS.filter(column => column.id !== 'WON' && column.id !== stageId).map(column => <option key={column.id} value={column.id}>{column.label}</option>)}<option value="WON">Venda realizada…</option></select>}{onOpenCampaign && <button type="button" onClick={() => onOpenCampaign(contact.campaignId)} className="text-xs text-[var(--studio-muted)] inline-flex gap-1 items-center hover:text-[var(--studio-ink)]">Campanha<ArrowUpRight size={12} /></button>}</div>
    </article>;
  };
  return <section aria-label="Oportunidades e retornos" className="space-y-5 min-w-0">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><span className="studio-eyebrow">CADA CONVERSA TEM UM PRÓXIMO PASSO</span><h2 className="text-2xl font-semibold tracking-tight mt-2">Oportunidades e retornos</h2><p className="text-sm text-[var(--studio-muted)] mt-2 max-w-2xl">Organize seus contatos, acompanhe as conversas e lembre de voltar no momento certo.</p></div><button type="button" disabled={loading} onClick={() => refresh.current()} className="dash-btn-secondary px-4 py-2.5 text-xs inline-flex gap-2 items-center disabled:opacity-40"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Atualizar oportunidades</button></header>
    <div className="grid sm:grid-cols-3 gap-3">{[
      { label: 'Retomar hoje', value: data?.counts.today, icon: CalendarClock, filter: 'TODAY' as const, hint: 'Lembretes para o dia de hoje' },
      { label: 'Atrasados', value: data?.counts.overdue, icon: CalendarCheck, filter: 'OVERDUE' as const, hint: 'Retornos que você ainda não concluiu' },
      { label: 'Lembretes agendados', value: data?.counts.scheduled, icon: CalendarClock, filter: 'ALL' as const, hint: 'Total com data, incluindo hoje e atrasados' },
    ].map(stat => <button key={stat.label} type="button" onClick={() => chooseReminder(stat.filter)} className="dash-card p-5 text-left space-y-2 hover:border-[var(--studio-accent)]/50"><span className="flex justify-between gap-3 text-xs text-[var(--studio-muted)]">{stat.label}<stat.icon size={17} className={stat.filter === 'OVERDUE' ? 'text-amber-300' : 'text-[var(--studio-accent)]'} /></span><strong className="block text-3xl font-semibold tabular-nums">{stat.value?.toLocaleString('pt-BR') ?? '—'}</strong><span className="block text-xs text-[var(--studio-muted)]">{stat.hint}</span></button>)}</div>
    <SalesChart />
    <div className="flex flex-wrap gap-2 items-center justify-between"><div className="flex gap-2" role="group" aria-label="Visualização comercial"><button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')} className={`${view === 'board' ? 'dash-btn-primary' : 'dash-btn-secondary'} px-3 py-2 text-xs inline-flex items-center gap-2`}><Columns3 size={14} />Quadro</button><button type="button" aria-pressed={view === 'reminders'} onClick={() => setView('reminders')} className={`${view === 'reminders' ? 'dash-btn-primary' : 'dash-btn-secondary'} px-3 py-2 text-xs inline-flex items-center gap-2`}><List size={14} />Retornos</button></div><span className="text-xs text-[var(--studio-muted)]">Dias no seu calendário local · sem envio automático</span></div>
    <div className="dash-card p-4 flex flex-wrap gap-3 items-end"><label className="flex-1 min-w-0 space-y-2 text-xs"><span className="text-[var(--studio-muted)]">Buscar contato</span><span className="relative block"><Search size={14} className="absolute left-3 top-3.5 text-[var(--studio-muted)]" /><input aria-label="Buscar oportunidades por nome ou telefone" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Nome ou telefone…" className="dash-input w-full rounded-xl py-3 pl-9 pr-3 text-sm" /></span></label><label className="space-y-2 text-xs max-w-full"><span className="block text-[var(--studio-muted)]">Etapa comercial</span><select aria-label="Filtrar oportunidades por etapa" value={stage} onChange={event => { setStage(event.target.value); setPage(1); }} className="dash-input rounded-xl p-3 text-sm max-w-full"><option value="ALL">Todas as etapas</option>{COLUMNS.filter(column => column.id !== 'WON').map(column => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label><label className="space-y-2 text-xs max-w-full"><span className="block text-[var(--studio-muted)]">Data de retorno</span><select aria-label="Filtrar lembretes de retorno" value={reminder} onChange={event => { setReminder(event.target.value as ReminderFilter); setPage(1); }} className="dash-input rounded-xl p-3 text-sm max-w-full">{REMINDERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
    {error && <p role="alert" className="rounded-xl border border-amber-500/30 p-4 text-sm text-amber-300">{error}{data ? ' Os contatos exibidos são da última atualização.' : ''}</p>}
    <p role="status" className="text-xs text-[var(--studio-muted)]">{loading ? 'Atualizando contatos…' : data ? `${data.total.toLocaleString('pt-BR')} contatos encontrados · ${data.contacts.length} nesta página.` : 'Contatos indisponíveis.'} Cada telefone aparece uma vez no workspace. Contagens dos lembretes incluem todos os seus contatos, independentemente dos filtros.</p>
    {view === 'board' && <div role="region" aria-label="Quadro Kanban; deslize horizontalmente para ver todas as etapas" tabIndex={0} className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)] rounded-2xl">
      <div className="flex w-max min-w-full snap-x snap-mandatory items-start gap-4">
      {columns.map(column => {
      const visibleCount = data?.contacts.length || 0;
      const share = visibleCount ? Math.round(column.contacts.length / visibleCount * 100) : 0;
      const highlighted = dragTarget === column.id;
      return <section key={column.id} aria-label={`Etapa ${column.label}`} onDragOver={event => { if (!dragging || column.id === 'WON') return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragTarget(column.id); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragTarget(null); }} onDrop={event => { event.preventDefault(); const key = event.dataTransfer.getData('text/plain'); const contact = data?.contacts.find(item => `${item.campaignId}:${item.leadId}` === key); setDragging(null); setDragTarget(null); if (contact) void moveContact(contact, column.id); }} className={`flex h-[min(68vh,42rem)] min-h-[22rem] w-[min(20rem,calc(100vw-6rem))] shrink-0 snap-start flex-col rounded-2xl border bg-white/[0.02] p-3 transition-colors ${highlighted ? 'border-[var(--studio-accent)] bg-[var(--studio-accent)]/[0.05]' : 'border-[var(--studio-line)] hover:border-white/[0.12]'}`}><header className="mb-3 flex-none p-1"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{column.label}</h3><span className="text-xs tabular-nums text-[var(--studio-muted)]" title="Contatos desta etapa na página atual">{column.contacts.length}</span></div><div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true"><div className="h-full rounded-full bg-[var(--studio-accent)] transition-[width] duration-500" style={{ width: `${share}%` }} /></div><p className="mt-1 text-[10px] text-[var(--studio-muted)]">Da página atual · {share}%</p></header><div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain pr-1">{column.contacts.map(card)}{!column.contacts.length && <p className="text-xs text-[var(--studio-muted)] p-4 border border-dashed border-[var(--studio-line)] rounded-xl">{column.id === 'WON' ? 'Registre uma venda em um contato para aparecer aqui.' : 'Solte o contato nesta etapa para movê-lo.'}</p>}</div></section>;
    })}
      </div>
    </div>}
    {view === 'reminders' && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{data?.contacts.map(card)}{!data?.contacts.length && <div className="dash-card p-8 md:col-span-2 xl:col-span-3 text-center text-sm text-[var(--studio-muted)]">{loading ? 'Carregando retornos…' : data ? 'Nenhum contato com estes filtros. Ajuste a busca ou agende um retorno no acompanhamento.' : 'Atualize para tentar carregar os contatos.'}</div>}</div>}
    <div className="dash-card p-4 text-xs leading-relaxed text-[var(--studio-muted)] space-y-1.5"><p>As etapas são preenchidas manualmente. “Reunião marcada” mostra contatos com a opção de reunião ativada e tem prioridade na posição do quadro; a etapa original continua salva.</p><p>Use Acompanhar contato para mudar a etapa, editar anotações e concluir ou remarcar um lembrete. Nenhuma dessas ações envia mensagens, muda o status do WhatsApp ou consome créditos.</p><p>Não ter interesse é uma classificação comercial. Os bloqueios e descadastros continuam valendo no fluxo de envio.</p></div>
    <footer className="flex flex-wrap gap-3 justify-between items-center text-xs text-[var(--studio-muted)]"><span>{updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString('pt-BR')}` : 'Aguardando atualização'}</span><div className="flex gap-3 items-center"><button type="button" aria-label="Página anterior de oportunidades" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)} className="dash-btn-secondary px-3 py-2 disabled:opacity-30"><ChevronLeft size={15} /></button><span>Página {data?.page || page} de {Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 30)))}</span><button type="button" aria-label="Próxima página de oportunidades" disabled={loading || !data || page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)} className="dash-btn-secondary px-3 py-2 disabled:opacity-30"><ChevronRight size={15} /></button></div></footer>
    {editing && <CommercialContactEditor key={`${editing.campaignId}-${editing.leadId}-${editing.initialStage || ''}`} campaignId={editing.campaignId} lead={{ id: editing.leadId, title: editing.title, phone: editing.phone }} initialStage={editing.initialStage} onClose={() => setEditing(null)} onSaved={() => { /* Evento commercial:updated atualiza a lista sem substituir o rascunho aberto. */ }} />}
  </section>;
}
