'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { BookOpen, Check, Copy, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { PersonalMessageTemplate } from './MessageTemplatePicker';

type Draft = { title: string; service: string; content: string };
const blank: Draft = { title: '', service: '', content: '' };
function errorMessage(cause: unknown, fallback: string) { return axios.isAxiosError(cause) ? cause.response?.data?.error || fallback : fallback; }
function TemplateEditor({ template, onClose, onSaved }: { template: PersonalMessageTemplate | null; onClose: () => void; onSaved: () => void }) {
  const [current, setCurrent] = useState(template);
  const [draft, setDraft] = useState<Draft>(template || blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [reloading, setReloading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  useEffect(() => { mounted.current = true; dialog.current?.showModal(); return () => { mounted.current = false; }; }, []);
  const initial = current || blank;
  const dirty = draft.title !== initial.title || draft.service !== initial.service || draft.content !== initial.content;
  const close = () => { if (busy.current) return; if (dirty) setDiscard(true); else onClose(); };
  const reload = async () => {
    if (!current || busy.current) return;
    busy.current = true; setReloading(true); setError('');
    try {
      const { data } = await api.get<{ templates: PersonalMessageTemplate[] }>('/templates');
      if (!mounted.current) return;
      const latest = data.templates.find(value => value.id === current.id);
      if (!latest) { setError('Este modelo foi excluído em outra janela. Seu texto continua aqui; copie-o antes de fechar.'); return; }
      setCurrent(latest); setDraft(latest); setConflict(false); setDiscard(false);
    } catch (cause) { if (mounted.current) setError(errorMessage(cause, 'Não foi possível carregar a versão atual.')); }
    finally { busy.current = false; if (mounted.current) setReloading(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy.current || conflict) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const body = { title: draft.title, service: draft.service, content: draft.content };
      if (current) await api.put(`/templates/${current.id}`, { ...body, version: current.version }); else await api.post('/templates', body);
      if (mounted.current) { onSaved(); onClose(); }
    } catch (cause) {
      if (!mounted.current) return;
      if (current && axios.isAxiosError(cause) && cause.response?.status === 409) setConflict(true);
      setError(errorMessage(cause, 'Não foi possível salvar. Seu rascunho continua aqui.'));
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  const change = (key: keyof Draft, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  return <dialog ref={dialog} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="template-editor-title" className="m-auto w-[calc(100%_-_1.5rem)] max-w-xl max-h-[92dvh] overflow-y-auto rounded-3xl border border-[var(--studio-line)] bg-[var(--studio-surface)] text-[var(--studio-ink)] p-0 backdrop:bg-black/80 backdrop:backdrop-blur-sm">
    <form onSubmit={submit} className="p-5 sm:p-7 space-y-5">
      <header className="flex justify-between gap-3"><div><span className="studio-eyebrow">SUA BIBLIOTECA</span><h2 id="template-editor-title" className="text-xl font-semibold mt-2">{current ? 'Editar modelo' : 'Novo modelo pessoal'}</h2></div><button type="button" aria-label="Fechar modelo" disabled={saving || reloading} onClick={close} className="p-2 self-start"><X size={18} /></button></header>
      <p className="text-xs text-[var(--studio-muted)]">Salvar, editar e reutilizar modelos não consome créditos de IA. Alterações aqui não modificam campanhas ou mensagens já salvas.</p>
      <label className="block text-sm space-y-2"><span>Nome do modelo</span><input autoFocus required maxLength={80} value={draft.title} onChange={event => change('title', event.target.value)} disabled={saving || reloading} className="dash-input w-full p-3 rounded-xl" placeholder="Ex.: Retorno após apresentação" /></label>
      <label className="block text-sm space-y-2"><span>Serviço ou categoria · opcional</span><input maxLength={80} value={draft.service} onChange={event => change('service', event.target.value)} disabled={saving || reloading} className="dash-input w-full p-3 rounded-xl" placeholder="Ex.: Criação de sites" /></label>
      <label className="block text-sm space-y-2"><span>Mensagem</span><textarea required maxLength={2000} rows={7} value={draft.content} onChange={event => change('content', event.target.value)} disabled={saving || reloading} className="dash-input w-full p-3 rounded-xl text-sm" placeholder="Olá {nome}, conseguiu olhar os exemplos que combinamos?" /><span className="block text-right text-xs text-[var(--studio-muted)]">{draft.content.length}/2.000 caracteres</span></label>
      <p className="text-xs text-[var(--studio-muted)]">Você pode usar {'{nome}'}, {'{bairro}'}, {'{website}'}, {'{meuNome}'} e {'{minhaEmpresa}'} nas campanhas. Prefira uma ideia e uma pergunta curta.</p>
      {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
      {discard && <div className="border border-amber-500/30 rounded-xl p-3 space-y-3"><p className="text-sm">Existem alterações não salvas.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setDiscard(false)} className="dash-btn-primary px-3 py-2 text-xs">Continuar editando</button><button type="button" onClick={onClose} className="dash-btn-secondary px-3 py-2 text-xs">Descartar rascunho e fechar</button></div></div>}
      <footer className="flex flex-wrap justify-end gap-3 border-t border-[var(--studio-line)] pt-4"><button type="button" onClick={close} disabled={saving || reloading} className="dash-btn-secondary px-4 py-2 text-sm">Voltar</button>{conflict && <button type="button" disabled={saving || reloading} onClick={() => void reload()} className="dash-btn-secondary px-4 py-2 text-xs">Descartar rascunho e carregar versão atual</button>}<button type="submit" disabled={saving || reloading || conflict || !dirty || !draft.title.trim() || !draft.content.trim()} className="dash-btn-primary px-4 py-2 text-sm inline-flex gap-2 items-center disabled:opacity-40">{saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}Salvar modelo</button></footer>
    </form>
  </dialog>;
}

export function MessageTemplates() {
  const [templates, setTemplates] = useState<PersonalMessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [service, setService] = useState('');
  const [editor, setEditor] = useState<{ template: PersonalMessageTemplate | null } | null>(null);
  const [deleting, setDeleting] = useState<PersonalMessageTemplate | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConflict, setDeleteConflict] = useState(false);
  const generation = useRef(0);
  const alive = useRef(false);
  const deletingRef = useRef(false);
  const refresh = useCallback(async () => {
    const sequence = ++generation.current; setLoading(true); setError('');
    try { const { data } = await api.get<{ templates: PersonalMessageTemplate[] }>('/templates'); if (alive.current && sequence === generation.current) setTemplates(data.templates); }
    catch (cause) { if (alive.current && sequence === generation.current) setError(errorMessage(cause, 'Não foi possível carregar seus modelos.')); }
    finally { if (alive.current && sequence === generation.current) setLoading(false); }
  }, []);
  useEffect(() => { alive.current = true; void Promise.resolve().then(refresh); return () => { alive.current = false; }; }, [refresh]);
  const services = useMemo(() => [...new Set(templates.map(template => template.service).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [templates]);
  const filtered = useMemo(() => templates.filter(template => (!service || template.service === service) && `${template.title} ${template.service} ${template.content}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))), [templates, query, service]);
  const remove = async () => {
    if (!deleting || deletingRef.current || deleteConflict) return;
    deletingRef.current = true; setDeleteBusy(true); setError('');
    try { await api.delete(`/templates/${deleting.id}`, { data: { version: deleting.version } }); if (!alive.current) return; setDeleting(null); setNotice('Modelo excluído. Mensagens nas campanhas foram preservadas.'); await refresh(); }
    catch (cause) { if (alive.current) { if (axios.isAxiosError(cause) && cause.response?.status === 409) setDeleteConflict(true); setError(errorMessage(cause, 'Não foi possível excluir o modelo.')); } }
    finally { deletingRef.current = false; if (alive.current) setDeleteBusy(false); }
  };
  return <section className="space-y-6" aria-labelledby="personal-templates-title">
    <header className="flex flex-wrap justify-between items-start gap-4"><div><span className="studio-eyebrow">O QUE FUNCIONA, VOCÊ GUARDA</span><h2 id="personal-templates-title" className="text-2xl font-semibold mt-2">Meus modelos</h2><p className="text-sm text-[var(--studio-muted)] mt-2">Suas abordagens por serviço. Reutilize, ajuste e revise sem gastar créditos.</p></div><button type="button" onClick={() => setEditor({ template: null })} className="dash-btn-primary px-4 py-2.5 text-sm inline-flex gap-2 items-center"><Plus size={16} />Novo modelo</button></header>
    <div className="flex flex-wrap items-center gap-3"><label className="flex-1 min-w-48"><span className="sr-only">Buscar meus modelos</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nome, serviço ou mensagem…" className="dash-input rounded-xl p-3 text-sm w-full" /></label><label><span className="sr-only">Filtrar serviço do modelo</span><select value={service} onChange={event => setService(event.target.value)} className="dash-input rounded-xl p-3 text-sm max-w-64"><option value="">Todos os serviços</option>{services.map(value => <option key={value} value={value}>{value}</option>)}</select></label><button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Atualizar meus modelos" className="dash-btn-secondary p-3"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></div>
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}{notice && <p role="status" className="text-sm text-[var(--studio-accent)] flex gap-2"><Check size={16} />{notice}</p>}
    {deleting && <div className="rounded-2xl border border-amber-500/30 p-4 space-y-3"><p className="text-sm">Excluir o modelo “{deleting.title}”? Isso não altera campanhas ou mensagens já salvas.</p><div className="flex flex-wrap gap-3"><button type="button" onClick={() => { setDeleting(null); setDeleteConflict(false); if (deleteConflict) void refresh(); }} disabled={deleteBusy} className="dash-btn-secondary px-3 py-2 text-xs">{deleteConflict ? 'Fechar e atualizar lista' : 'Cancelar exclusão'}</button><button type="button" disabled={deleteBusy || deleteConflict} onClick={() => void remove()} className="dash-btn-secondary px-3 py-2 text-xs disabled:opacity-40">{deleteBusy ? 'Excluindo…' : 'Confirmar exclusão'}</button>{deleteConflict && <button type="button" onClick={() => { setDeleting(null); setDeleteConflict(false); void refresh(); }} className="dash-btn-secondary px-3 py-2 text-xs">Carregar lista atual</button>}</div></div>}
    <p className="text-xs text-[var(--studio-muted)]">{templates.length}/200 modelos salvos · {filtered.length} nesta seleção</p>
    {loading && !templates.length ? <p role="status" className="text-sm">Carregando sua biblioteca…</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(template => <article key={template.id} className="rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-surface)] p-5 flex flex-col gap-3 min-w-0"><header className="flex gap-3"><BookOpen size={18} className="text-[var(--studio-accent)] shrink-0 mt-1" /><div className="min-w-0"><h3 className="font-medium break-words">{template.title}</h3><p className="text-xs text-[var(--studio-muted)] mt-1 break-words">{template.service || 'Sem categoria'}</p></div></header><p className="text-sm whitespace-pre-wrap break-words line-clamp-5 text-[var(--studio-muted)]">{template.content}</p><footer className="flex flex-wrap gap-2 mt-auto pt-2"><button type="button" onClick={() => setEditor({ template })} className="dash-btn-secondary px-3 py-2 text-xs inline-flex gap-2 items-center" aria-label={`Editar modelo ${template.title}`}><Pencil size={13} />Editar</button><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(template.content); if (alive.current) setNotice('Mensagem copiada. Cole no rascunho e revise antes de enviar.'); } catch { if (alive.current) setError('Não foi possível copiar. Abra Editar para selecionar o texto.'); } }} className="dash-btn-secondary px-3 py-2 text-xs inline-flex gap-2 items-center" aria-label={`Copiar modelo ${template.title}`}><Copy size={13} />Copiar</button><button type="button" onClick={() => { setDeleting(template); setDeleteConflict(false); setError(''); }} className="dash-btn-secondary p-2 text-xs" aria-label={`Excluir modelo ${template.title}`}><Trash2 size={13} /></button></footer></article>)}</div>}
    {!loading && !filtered.length && <div className="rounded-2xl border border-dashed border-[var(--studio-line)] p-8 text-center"><BookOpen size={26} className="mx-auto text-[var(--studio-accent)] mb-3" /><p className="text-sm">{templates.length ? 'Nenhum modelo corresponde à busca.' : 'Guarde sua primeira abordagem.'}</p><p className="text-xs text-[var(--studio-muted)] mt-2">Na criação de campanha ou edição da mensagem, clique em “Usar um dos meus modelos”. O texto entra como rascunho para você revisar.</p></div>}
    {editor && <TemplateEditor key={editor.template?.id || 'new'} template={editor.template} onClose={() => setEditor(null)} onSaved={() => { setNotice('Modelo salvo na sua biblioteca.'); void refresh(); }} />}
  </section>;
}
