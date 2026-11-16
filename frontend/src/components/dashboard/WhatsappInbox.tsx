'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { ArrowLeft, CalendarClock, Check, Clock3, MessageSquare, Plus, Search, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { CommercialContactEditor } from './CommercialContactEditor';

const inbox = '/whatsapp/inbox/conversations';
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateAndTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const inputClass = 'dash-input min-w-0 w-full rounded-xl px-3 py-2.5 text-sm';
const muted = 'text-[var(--studio-muted)]';

interface Message {
  id: string;
  direction: 'IN' | 'OUT';
  status: 'RECEIVED' | 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'UNCERTAIN';
  text: string;
  error: string | null;
  createdAt: string;
}

interface Conversation {
  id: string;
  name: string | null;
  phone: string;
}

interface ListedConversation extends Conversation {
  lastMessageAt: string;
  messages: Pick<Message, 'text' | 'direction'>[];
}

interface InboxPage {
  accountId: string | null;
  conversations: ListedConversation[];
  hasMore: boolean;
}

interface Chat {
  conversation: Conversation;
  messages: Message[];
  hasOlder: boolean;
  lead: { id: string; title: string; phone: string; campaign: { id: string; name: string } } | null;
  nextContactAt: string | null;
  blocked: boolean;
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
    ? error.response.data.error
    : fallback;
}

function mergeMessages(previous: Message[], next: Message[]) {
  const byId = new Map([...previous, ...next].map(message => [message.id, message]));
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function ConversationThread({ id, connected, onBack, onCampaign }: {
  id: string; connected: boolean; onBack: () => void; onCampaign: (id: string) => void;
}) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<{ before: string; hasOlder: boolean } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [issue, setIssue] = useState('');
  const [actionError, setActionError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [editing, setEditing] = useState(false);
  const pending = useRef<{ text: string; requestId: string } | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const firstMessage = useRef(true);
  const followLatest = useRef(true);
  const latestSignature = messages.at(-1)?.id;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const { data } = await api.get<Chat>(`${inbox}/${id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setChat(data);
        setMessages(previous => mergeMessages(previous, data.messages));
        setIssue('');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          setChat(null);
          setMessages([]);
        }
        setIssue(errorMessage(error, 'A conversa não pôde ser atualizada.'));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 4000);
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, refresh]);

  useEffect(() => {
    if (!latestSignature || !scrollArea.current) return;
    if (firstMessage.current || followLatest.current) {
      scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
      firstMessage.current = false;
    }
  }, [latestSignature]);

  async function loadOlder() {
    const before = history?.before || chat?.messages[0]?.id;
    if (!before || loadingOlder) return;
    setLoadingOlder(true);
    setActionError('');
    try {
      const { data } = await api.get<Chat>(`${inbox}/${id}`, { params: { before } });
      setMessages(previous => mergeMessages(data.messages, previous));
      setHistory({ before: data.messages[0]?.id || before, hasOlder: data.hasOlder });
    } catch (error) {
      setActionError(errorMessage(error, 'Não foi possível carregar as mensagens anteriores.'));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || !connected || chat?.blocked) return;
    const attempt = pending.current?.text === text ? pending.current : { text, requestId: window.crypto.randomUUID() };
    pending.current = attempt;
    setSending(true);
    setActionError('');
    try {
      const { data } = await api.post<Message>(`${inbox}/${id}/messages`, attempt);
      followLatest.current = true;
      setMessages(previous => mergeMessages(previous, [data]));
      setDraft('');
      pending.current = null;
      setRefresh(value => value + 1);
    } catch (error) {
      setActionError(errorMessage(error, 'Não foi possível confirmar o envio. Tente novamente com o mesmo texto.'));
    } finally {
      setSending(false);
    }
  }

  if (!chat) return <div className="flex flex-col gap-3 p-5">
    <button type="button" onClick={onBack} className="flex items-center gap-2 self-start text-sm md:hidden"><ArrowLeft size={16} />Conversas</button>
    <p role={issue ? 'alert' : 'status'} className={muted}>{issue || 'Carregando conversa…'}</p>
  </div>;

  return <div className="flex min-h-0 min-w-0 flex-col">
    <header className="flex flex-wrap items-center gap-3 border-b border-[var(--studio-line)] px-4 py-3">
      <button type="button" onClick={onBack} aria-label="Voltar para conversas" className="dash-btn-secondary p-2 md:hidden"><ArrowLeft size={16} /></button>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold">{chat.conversation.name || chat.conversation.phone}</h3>
        <p className={`truncate text-xs ${muted}`}>+{chat.conversation.phone}</p>
      </div>
      {chat.lead && <button type="button" onClick={() => setEditing(true)} className="dash-btn-secondary flex items-center gap-2 px-3 py-2 text-xs"><CalendarClock size={15} />Retorno</button>}
    </header>

    {(chat.lead || chat.nextContactAt) && <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--studio-line)] px-4 py-2.5 text-xs">
      {chat.lead && <button type="button" onClick={() => onCampaign(chat.lead!.campaign.id)} className="max-w-full truncate text-[var(--studio-accent)] hover:underline">Campanha · {chat.lead.campaign.name}</button>}
      <span className={muted}>{chat.nextContactAt ? `Próximo retorno · ${chat.nextContactAt.split('-').reverse().join('/')}` : 'Sem retorno agendado'}</span>
    </div>}

    <div ref={scrollArea} aria-label="Histórico da conversa" role="log" aria-live="off" onScroll={event => {
      const area = event.currentTarget;
      followLatest.current = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
    }} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-black/10 p-4 sm:p-5">
      {(history?.hasOlder ?? chat.hasOlder) && <button type="button" disabled={loadingOlder} onClick={() => void loadOlder()} className="dash-btn-secondary mx-auto block px-3 py-2 text-xs">{loadingOlder ? 'Carregando…' : 'Ver mensagens anteriores'}</button>}
      {messages.length === 0 && <p className={`my-10 text-center text-sm ${muted}`}>As novas mensagens aparecerão aqui.</p>}
      {messages.map(message => <article key={message.id} className={`w-fit max-w-[90%] rounded-2xl border px-3.5 py-2.5 sm:max-w-[75%] ${message.direction === 'OUT' ? 'ml-auto rounded-br-sm border-emerald-400/20 bg-emerald-400/10' : 'rounded-bl-sm border-[var(--studio-line)] bg-white/[0.04]'}`}>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
        <p className={`mt-1.5 flex flex-wrap items-center justify-end gap-1.5 text-[11px] ${muted}`}>
          <time dateTime={message.createdAt} title={dateAndTime.format(new Date(message.createdAt))}>{dateAndTime.format(new Date(message.createdAt))}</time>
          {message.status === 'SENT' && <span className="inline-flex items-center gap-1"><Check size={12} />Enviado</span>}
          {(message.status === 'QUEUED' || message.status === 'SENDING') && <span className="inline-flex items-center gap-1"><Clock3 size={12} />{message.status === 'QUEUED' ? 'Na fila' : 'Enviando'}</span>}
        </p>
        {message.error && <p className="mt-1 text-xs text-amber-300">{message.error}</p>}
      </article>)}
    </div>

    <form onSubmit={send} className="space-y-2 border-t border-[var(--studio-line)] p-3 sm:p-4">
      {(issue || actionError || chat.blocked || !connected) && <p role="status" className="text-xs text-amber-300">{actionError || issue || (chat.blocked ? 'Contato na lista de bloqueio.' : 'Reconecte o WhatsApp para responder.')}</p>}
      <div className="flex items-end gap-2">
        <textarea className={`${inputClass} max-h-32 resize-y`} aria-label="Mensagem ao cliente" rows={2} maxLength={4000} placeholder="Escreva para o cliente…" value={draft} onChange={event => setDraft(event.target.value)} disabled={sending || chat.blocked} />
        <button type="submit" disabled={!connected || !draft.trim() || sending || chat.blocked} className="dash-btn-primary flex items-center gap-2 px-4 py-3 text-sm disabled:opacity-45"><Send size={16} />Enviar</button>
      </div>
    </form>

    {editing && chat.lead && <CommercialContactEditor campaignId={chat.lead.campaign.id} lead={chat.lead} onClose={() => setEditing(false)} onSaved={() => setRefresh(value => value + 1)} />}
  </div>;
}

export function WhatsappInbox({ connected, onCampaign }: { connected: boolean; onCampaign: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [inboxPage, setInboxPage] = useState<InboxPage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState('');
  const [addError, setAddError] = useState('');
  const lastAccount = useRef<string | null>(null);
  const accountId = inboxPage?.accountId;

  useEffect(() => {
    const controller = new AbortController();
    let timer = setTimeout(load, search ? 250 : 0);
    async function load() {
      try {
        const { data } = await api.get<InboxPage>(inbox, { params: { search, page }, signal: controller.signal });
        if (controller.signal.aborted) return;
        if (lastAccount.current && lastAccount.current !== data.accountId) {
          setSelected(null);
          setPage(1);
          setName('');
          setPhone('');
          setAdding(false);
        }
        lastAccount.current = data.accountId;
        setInboxPage(data);
        setListError('');
      } catch (error) {
        if (!controller.signal.aborted) setListError(errorMessage(error, 'Não foi possível atualizar a caixa de entrada.'));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 6000);
      }
    }
    return () => { controller.abort(); clearTimeout(timer); };
  }, [search, page, connected, refresh]);

  async function addContact(event: FormEvent) {
    event.preventDefault();
    if (saving || !accountId || !connected) return;
    setSaving(true);
    setAddError('');
    try {
      const { data } = await api.post<{ id: string }>(inbox, { name, phone, accountId });
      if (lastAccount.current !== accountId) return;
      setSelected(data.id);
      setAdding(false);
      setName('');
      setPhone('');
      setSearch('');
      setPage(1);
      setRefresh(value => value + 1);
    } catch (error) {
      setAddError(errorMessage(error, 'Não foi possível adicionar a conversa.'));
    } finally {
      setSaving(false);
    }
  }

  return <section aria-label="Caixa de entrada do WhatsApp" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Conversas</h2>
      {accountId && <span className={`text-xs ${muted}`}>+{accountId}{connected ? ' · Conectado' : ' · Desconectado'}</span>}
    </div>

    <div className="dash-card grid h-[clamp(28rem,68dvh,50rem)] overflow-hidden rounded-2xl md:grid-cols-[minmax(230px,34%)_minmax(0,1fr)]">
      <aside className={`${selected ? 'hidden md:flex' : 'flex'} min-h-0 min-w-0 flex-col border-[var(--studio-line)] md:border-r`}>
        <div className="space-y-3 border-b border-[var(--studio-line)] p-3">
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1"><Search size={15} className={`absolute left-3 top-3 ${muted}`} /><input aria-label="Buscar conversas" placeholder="Nome ou número" className={`${inputClass} pl-9`} value={search} maxLength={100} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
            <button type="button" aria-label="Adicionar conversa" aria-expanded={adding} disabled={!connected || !accountId} onClick={() => { setAdding(value => !value); setAddError(''); }} className="dash-btn-secondary p-2.5 disabled:opacity-45"><Plus size={18} /></button>
          </div>
          {adding && <form onSubmit={addContact} className="space-y-2">
            <label className="block text-xs">Nome (opcional)<input value={name} onChange={event => setName(event.target.value)} maxLength={100} disabled={saving} className={`${inputClass} mt-1`} /></label>
            <label className="block text-xs">Número do cliente<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} maxLength={30} required disabled={saving} placeholder="DDD + número" className={`${inputClass} mt-1`} /></label>
            <button type="submit" disabled={saving || !connected} className="dash-btn-primary px-3 py-2 text-xs disabled:opacity-45">Adicionar conversa</button>
            {addError && <p role="alert" className="text-xs text-amber-300">{addError}</p>}
          </form>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {listError && <p role="alert" className="p-4 text-sm text-amber-300">{listError}</p>}
          {!inboxPage && !listError && <p className={`p-4 text-sm ${muted}`}>Carregando conversas…</p>}
          {inboxPage?.conversations.length === 0 && <p className={`p-4 text-sm ${muted}`}>{!accountId ? 'Conecte seu WhatsApp para acompanhar conversas.' : search ? 'Nenhuma conversa encontrada.' : 'As conversas das campanhas aparecerão aqui. Use + para acompanhar outro cliente.'}</p>}
          {inboxPage?.conversations.map(item => <button key={item.id} type="button" aria-current={selected === item.id ? 'true' : undefined} onClick={() => setSelected(item.id)} className={`flex w-full min-w-0 items-center gap-3 border-b border-[var(--studio-line)] px-4 py-3 text-left hover:bg-white/[0.05] ${selected === item.id ? 'bg-emerald-400/10' : ''}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-sm font-semibold text-[var(--studio-accent)]">{item.name?.trim().charAt(0).toUpperCase() || <MessageSquare size={15} />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.name || `+${item.phone}`}</span><span className={`block truncate text-xs ${muted}`}>{item.messages[0] ? `${item.messages[0].direction === 'OUT' ? 'Você: ' : ''}${item.messages[0].text}` : 'Conversa adicionada'}</span></span>
            <span className={`text-[11px] ${muted}`}>{item.messages.length ? time.format(new Date(item.lastMessageAt)) : ''}</span>
          </button>)}
        </div>
        {(page > 1 || inboxPage?.hasMore) && <div className="flex justify-between border-t border-[var(--studio-line)] p-3 text-xs"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="dash-btn-secondary px-3 py-2 disabled:opacity-40">Anterior</button><button type="button" disabled={!inboxPage?.hasMore} onClick={() => setPage(value => value + 1)} className="dash-btn-secondary px-3 py-2 disabled:opacity-40">Próxima</button></div>}
      </aside>

      {selected ? <ConversationThread key={selected} id={selected} connected={connected} onBack={() => setSelected(null)} onCampaign={onCampaign} /> : <div className="hidden flex-col items-center justify-center gap-3 p-8 text-center md:flex">
        <span className="grid size-12 place-items-center rounded-2xl bg-emerald-400/10 text-[var(--studio-accent)]"><MessageSquare size={22} /></span>
        <p className="font-medium">Selecione uma conversa</p>
        <p className={`text-sm ${muted}`}>Leia as mensagens e responda aos seus clientes pelo Abordai.</p>
      </div>}
    </div>
  </section>;
}
