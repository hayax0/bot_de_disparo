'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Building2, Sparkles, X, ArrowRight, Check } from 'lucide-react';
import { api } from '@/lib/api';

type WorkMode = 'SELF_EMPLOYED' | 'BUSINESS_OWNER' | 'EMPLOYEE';
interface Profile {
  professionalName: string;
  workMode: WorkMode;
  companyName: string;
  services: string;
  targetAudience: string;
  objective: string;
  completedAt?: string | null;
  dismissedAt?: string | null;
}
const empty: Profile = { professionalName: '', workMode: 'SELF_EMPLOYED', companyName: '', services: '', targetAudience: '', objective: '' };
const steps = ['Quem é você', 'Seu trabalho', 'Seu objetivo'];

export function ProfessionalProfilePanel({ userId, name }: { userId: string; name?: string | null }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Profile>({ ...empty, professionalName: name || '' });
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    api.get('/profile').then(({ data }) => {
      if (!active) return;
      setProfile(data.profile);
      setDraft({ ...empty, ...data.profile, professionalName: data.profile?.professionalName || name || '' });
      setOpen(!data.profile?.completedAt && !data.profile?.dismissedAt);
    }).catch(() => { if (active) setFeedback('Não foi possível carregar seu perfil. Use “Meu negócio” para tentar novamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, name]);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);

  const edit = async () => {
    setError(''); setFeedback(''); setLoading(true);
    try {
      const { data } = await api.get('/profile');
      setProfile(data.profile);
      setDraft({ ...empty, ...data.profile, professionalName: data.profile?.professionalName || name || '' });
      setStep(0); setOpen(true);
    } catch { setFeedback('Não foi possível carregar seu perfil. Tente novamente.'); }
    finally { setLoading(false); }
  };
  const close = async () => {
    if (saving) return;
    if (profile?.completedAt) { setOpen(false); return; }
    setSaving(true); setError('');
    try {
      await api.post('/profile/defer');
      setProfile(previous => ({ ...(previous || empty), dismissedAt: new Date().toISOString() }));
      setOpen(false);
    } catch { setError('Não foi possível adiar. Tente novamente.'); }
    finally { setSaving(false); }
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < 2) { setStep(step + 1); setError(''); return; }
    setSaving(true); setError('');
    try {
      const { professionalName, workMode, companyName, services, targetAudience, objective } = draft;
      const { data } = await api.put('/profile', { professionalName, workMode, companyName, services, targetAudience, objective });
      setProfile(data.profile); setOpen(false);
      setFeedback('Perfil salvo. As próximas gerações de IA usarão seu contexto.');
      window.dispatchEvent(new Event('professional-profile:updated'));
    } catch (cause) {
      const fields = axios.isAxiosError(cause) ? cause.response?.data?.fields : undefined;
      setError(fields ? 'Confira os campos das etapas anteriores. Informe seu nome, serviço, público e objetivo.' : 'Não foi possível salvar. Tente novamente.');
    } finally { setSaving(false); }
  };
  const fieldClass = 'w-full rounded-xl border border-[var(--studio-line)] bg-[var(--studio-bg)] px-4 py-3 text-sm text-[var(--studio-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--studio-accent)]';
  const update = (key: keyof Profile, value: string) => setDraft(previous => ({ ...previous, [key]: value }));

  return <>
    <section className="rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-surface)] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3" aria-label="Meu negócio">
      <div className="flex items-start gap-3">
        <Building2 size={20} className="text-[var(--studio-accent)] mt-1 shrink-0" />
        <div><h2 className="text-sm font-semibold">Meu negócio</h2>
          <p className="text-xs text-[var(--studio-muted)] mt-1">{profile?.completedAt ? 'Seu perfil dá contexto às abordagens da IA. Você pode editar quando quiser.' : 'Conte o que você faz para receber abordagens mais alinhadas ao seu serviço.'}</p>
          {feedback && <p role="status" className="mt-2 text-xs text-[var(--studio-accent)]">{feedback}</p>}
        </div>
      </div>
      <button onClick={edit} disabled={loading} className="dash-btn-secondary px-4 py-2 text-xs disabled:opacity-50">{loading ? 'Carregando...' : profile?.completedAt ? 'Editar perfil' : 'Preencher perfil'}</button>
    </section>
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); void close(); }} aria-labelledby="professional-title" className="m-auto w-[calc(100%_-_2rem)] max-w-xl max-h-[90dvh] overflow-y-auto rounded-3xl border border-[var(--studio-line)] bg-[var(--studio-surface)] text-[var(--studio-ink)] p-0 backdrop:bg-black/75 backdrop:backdrop-blur-sm">
      <div className="p-6 sm:p-8">
        <div className="flex justify-between gap-3 items-start">
          <div><Sparkles className="text-[var(--studio-accent)] mb-3" size={24} /><h2 id="professional-title" className="text-2xl font-semibold tracking-tight">A IA precisa conhecer seu trabalho.</h2><p className="text-sm text-[var(--studio-muted)] mt-2">Três passos rápidos. Você pode preencher depois e editar quando quiser.</p></div>
          <button type="button" onClick={close} disabled={saving} aria-label="Fechar questionário" className="p-2 rounded-lg hover:bg-white/5"><X size={20} /></button>
        </div>
        <nav aria-label="Etapas do perfil" className="flex gap-2 my-6">{steps.map((label, index) => <button key={label} type="button" disabled={saving || index > step} onClick={() => setStep(index)} aria-current={index === step ? 'step' : undefined} className={`flex-1 text-left border-t-2 pt-2 text-xs ${index <= step ? 'border-[var(--studio-accent)] text-[var(--studio-accent)]' : 'border-[var(--studio-line)] text-[var(--studio-muted)]'}`}>{index + 1}. {label}</button>)}</nav>
        <form onSubmit={save} className="space-y-4">
          {step === 0 && <>
            <label className="block space-y-2 text-sm"><span>Como você quer se apresentar?</span><input autoFocus required minLength={2} maxLength={100} value={draft.professionalName} onChange={e => update('professionalName', e.target.value)} placeholder="Seu nome profissional" className={fieldClass} /></label>
            <label className="block space-y-2 text-sm"><span>Como você trabalha?</span><select value={draft.workMode} onChange={e => update('workMode', e.target.value)} className={fieldClass}><option value="SELF_EMPLOYED">Por conta própria / freelancer</option><option value="BUSINESS_OWNER">Tenho uma empresa</option><option value="EMPLOYEE">Trabalho em uma empresa</option></select></label>
            <label className="block space-y-2 text-sm"><span>{draft.workMode === 'SELF_EMPLOYED' ? 'Nome da marca ou empresa (opcional)' : 'Nome da empresa'}</span><input required={draft.workMode !== 'SELF_EMPLOYED'} minLength={draft.workMode !== 'SELF_EMPLOYED' ? 2 : undefined} maxLength={120} value={draft.companyName} onChange={e => update('companyName', e.target.value)} placeholder="Ex.: Estúdio Aurora" className={fieldClass} /></label>
          </>}
          {step === 1 && <>
            <label className="block space-y-2 text-sm"><span>Qual serviço ou produto você oferece?</span><textarea autoFocus required minLength={5} maxLength={1000} rows={4} value={draft.services} onChange={e => update('services', e.target.value)} placeholder="Ex.: Crio sites profissionais e lojas virtuais para pequenos negócios." className={fieldClass} /></label>
            <label className="block space-y-2 text-sm"><span>Quem você quer atender?</span><textarea required minLength={3} maxLength={500} rows={3} value={draft.targetAudience} onChange={e => update('targetAudience', e.target.value)} placeholder="Ex.: Clínicas e prestadores de serviço da minha região." className={fieldClass} /></label>
          </>}
          {step === 2 && <>
            <label className="block space-y-2 text-sm"><span>Qual é o objetivo das suas abordagens?</span><textarea autoFocus required minLength={3} maxLength={500} rows={4} value={draft.objective} onChange={e => update('objective', e.target.value)} placeholder="Ex.: Iniciar conversas e agendar uma demonstração do meu serviço." className={fieldClass} /></label>
            <div className="rounded-xl bg-[var(--studio-bg)] border border-[var(--studio-line)] p-4 text-xs text-[var(--studio-muted)] leading-relaxed">O perfil será enviado à IA junto com o contexto do lead. Uma orientação específica na geração tem prioridade. Salvar ou editar é gratuito e não altera plano, saldo, campanhas ou mensagens existentes.</div>
          </>}
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
            <button type="button" onClick={step ? () => setStep(step - 1) : close} disabled={saving} className="text-xs text-[var(--studio-muted)] px-2 py-2">{step ? 'Voltar' : profile?.completedAt ? 'Cancelar' : 'Preencher depois'}</button>
            <button disabled={saving} type="submit" className="dash-btn-primary px-5 py-3 text-sm flex items-center gap-2 disabled:opacity-50">{saving ? 'Salvando...' : step === 2 ? 'Salvar meu perfil' : 'Continuar'}{step === 2 ? <Check size={16} /> : <ArrowRight size={16} />}</button>
          </div>
        </form>
      </div>
    </dialog>
  </>;
}
