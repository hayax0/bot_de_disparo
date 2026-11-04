'use client';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

export type PersonalMessageTemplate = { id: string; title: string; service: string; content: string; version: number; updatedAt: string };
export function MessageTemplatePicker({ onSelect }: { onSelect: (content: string) => void }) {
  const [templates, setTemplates] = useState<PersonalMessageTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const selected = templates.find(template => template.id === selectedId);
  useEffect(() => {
    if (!open) return;
    const sequence = ++generation.current;
    let alive = true;
    void Promise.resolve().then(async () => {
      setLoading(true); setError('');
      try { const { data } = await api.get<{ templates: PersonalMessageTemplate[] }>('/templates'); if (alive && sequence === generation.current) setTemplates(data.templates); }
      catch { if (alive && sequence === generation.current) setError('Não foi possível carregar seus modelos. Abra novamente para tentar.'); }
      finally { if (alive && sequence === generation.current) setLoading(false); }
    });
    return () => { alive = false; };
  }, [open]);
  return <div className="rounded-xl border border-[var(--studio-line)] p-3 space-y-3">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="text-xs text-[var(--studio-accent)] inline-flex gap-2 items-center"><BookOpen size={15} />{open ? 'Fechar meus modelos' : 'Usar um dos meus modelos'}</button>
    {open && <>
      {loading && <p role="status" className="text-xs flex gap-2"><RefreshCw size={13} className="animate-spin" />Carregando modelos…</p>}
      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
      {!loading && !error && (templates.length ? <>
        <label className="block text-xs space-y-2"><span>Modelo pessoal</span><select aria-label="Escolher modelo pessoal" value={selectedId} onChange={event => setSelectedId(event.target.value)} className="dash-input w-full rounded-lg p-2"><option value="">Selecione um modelo</option>{templates.map(template => <option key={template.id} value={template.id}>{template.title}{template.service ? ` · ${template.service}` : ''}</option>)}</select></label>
        {selected && <><p className="whitespace-pre-wrap break-words text-xs max-h-48 overflow-y-auto rounded-lg bg-black/15 p-3">{selected.content}</p><button type="button" onClick={() => { onSelect(selected.content); setOpen(false); }} className="dash-btn-secondary px-3 py-2 text-xs">Usar modelo no rascunho</button><p className="text-[10px] text-[var(--studio-muted)]">Substitui o texto do rascunho. Você pode editar e revisar antes de salvar ou enviar. Não consome créditos.</p></>}
      </> : <p className="text-xs text-[var(--studio-muted)]">Você ainda não salvou modelos. Crie o primeiro na aba Meus modelos.</p>)}
    </>}
  </div>;
}
