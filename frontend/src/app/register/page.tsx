'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import axios from 'axios';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/store/useAuth';
import { api } from '@/lib/api';
import { LANDING_PLANS } from '@/lib/constants';
import { RegistrationChallenge } from './RegistrationChallenge';
import { RegistrationPreview } from './RegistrationPreview';

const fieldClass = 'dash-input min-w-0 w-full rounded-xl px-3.5 py-2.5 text-sm';

function RegisterForm() {
  const params = useSearchParams();
  const selectedPlan = LANDING_PLANS.find(plan => plan.id === params.get('plan')?.toUpperCase()) || LANDING_PLANS[1];
  const setAuth = useAuth(state => state.setAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loadingAction, setLoadingAction] = useState<'code' | 'register' | null>(null);
  const [config, setConfig] = useState<{ siteKey: string | null } | null>(null);
  const [configError, setConfigError] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [resetCount, setResetCount] = useState(0);
  const inFlight = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    api.get('/auth/register/config', { signal: abort.signal, timeout: 8000 }).then(({ data }) => {
      if (abort.signal.aborted) return;
      if (data?.turnstileSiteKey !== null && (typeof data?.turnstileSiteKey !== 'string' || !data.turnstileSiteKey)) {
        setConfigError(true);
        return;
      }
      setConfig({ siteKey: data.turnstileSiteKey });
    }).catch(() => { if (!abort.signal.aborted) setConfigError(true); });
    return () => abort.abort();
  }, [configAttempt]);

  useEffect(() => { if (confirming) codeInput.current?.focus(); }, [confirming]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const cleanEmail = email.trim().toLowerCase();
  const canSubmit = config !== null && (!config.siteKey || Boolean(turnstileToken)) && !loadingAction;

  async function submit(action: 'code' | 'register') {
    if (!canSubmit || inFlight.current) return;
    inFlight.current = true;
    setLoadingAction(action);
    setError('');
    setNotice('');
    setTurnstileToken('');
    const challenge = config?.siteKey ? { turnstileToken } : {};
    try {
      if (action === 'code') {
        await api.post('/auth/register/code', { email: cleanEmail, ...challenge });
        setCode('');
        setCooldown(60);
        setConfirming(true);
        setNotice('Código enviado. Confira também a pasta de spam.');
        return;
      }
      const { data } = await api.post('/auth/register', {
        email: cleanEmail, name: name.trim(), password, termsAccepted,
        verificationCode: code, planId: selectedPlan.id, ...challenge,
      });
      setAuth(data.token, data.user);
      localStorage.setItem('last_selected_plan', selectedPlan.id);
      const checkout = new URL(data.checkoutUrl || selectedPlan.checkoutUrl);
      checkout.searchParams.set('email', cleanEmail);
      checkout.searchParams.set('name', name.trim());
      window.location.assign(checkout.toString());
    } catch (cause) {
      const fallback = action === 'code' ? 'Não foi possível enviar o código.' : 'Não foi possível criar a conta.';
      setError(axios.isAxiosError(cause) ? cause.response?.data?.error || fallback : fallback);
    } finally {
      if (config?.siteKey) setResetCount(value => value + 1);
      inFlight.current = false;
      setLoadingAction(null);
    }
  }

  return <main className="min-h-dvh bg-[var(--studio-bg)] text-[var(--studio-ink)] lg:grid lg:grid-cols-2 lg:gap-3 lg:p-3">
    <section className="flex min-w-0 flex-col px-5 pb-8 pt-6 sm:px-10 lg:min-h-[calc(100dvh-1.5rem)] lg:px-12 lg:pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight"><Image src="/logo-abordai-v1.png" alt="" width={36} height={36} priority className="rounded-xl" />Abordai</Link>
        <Link href="/login" className="dash-btn-secondary inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold">Entrar <ArrowRight size={13} /></Link>
      </header>

      <div className="mx-auto w-full max-w-[28rem] py-9 sm:py-10 lg:my-auto lg:py-5">
        <ol aria-label="Etapas do cadastro" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium">
          <li aria-current={confirming ? undefined : 'step'} className={`flex items-center gap-2 ${confirming ? 'text-[var(--studio-muted)]' : 'text-[var(--studio-accent)]'}`}><span className="grid size-6 place-items-center rounded-full border border-[#3a5c49] bg-[#1a2d22] text-[var(--studio-accent)]">{confirming ? <Check size={13} /> : '1'}</span> Seus dados</li>
          <li aria-hidden="true" className="h-px w-5 bg-[var(--studio-line)]" />
          <li aria-current={confirming ? 'step' : undefined} className={`flex items-center gap-2 ${confirming ? 'text-[var(--studio-accent)]' : 'text-[var(--studio-muted)]'}`}><span className="grid size-6 place-items-center rounded-full border border-[var(--studio-line)]">2</span> Confirmar e-mail</li>
        </ol>

        <h1 className="text-[clamp(2rem,4.2vw,2.75rem)] font-semibold leading-[1.04] tracking-[-.055em]">{confirming ? 'Confirme seu e-mail' : 'Crie sua conta'}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--studio-muted)]">{confirming ? <>Digite o código de seis dígitos enviado para <strong className="break-all font-semibold text-[var(--studio-ink)]">{cleanEmail}</strong>.</> : 'Encontre empresas, prepare sua primeira abordagem e acompanhe cada oportunidade no Abordai.'}</p>

        <div className="my-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#2c4938] bg-[#132019] px-4 py-2.5">
          <div><p className="text-xs text-[#b0c6b8]">Plano {selectedPlan.name}</p><p className="mt-0.5 text-sm font-semibold text-[#b2f1ca]">{selectedPlan.currency} {selectedPlan.price}{selectedPlan.period}</p></div>
          <Link href="/#planos" className="text-xs font-medium text-[#b2f1ca] underline underline-offset-4">Ver planos</Link>
        </div>

        <form className="space-y-2.5" onSubmit={event => { event.preventDefault(); void submit(confirming ? 'register' : 'code'); }}>
          {confirming ? <>
            <label className="block space-y-1.5 text-sm font-medium" htmlFor="registration-code"><span>Código de confirmação</span><input id="registration-code" disabled={Boolean(loadingAction)} ref={codeInput} required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} placeholder="000000" className={`${fieldClass} text-center font-mono tracking-[.5em]`} /></label>
            <div className="flex flex-wrap justify-between gap-2">
              <button type="button" disabled={Boolean(loadingAction)} className="inline-flex items-center gap-1.5 text-xs text-[var(--studio-muted)] underline underline-offset-4 disabled:opacity-50" onClick={() => { setConfirming(false); setCode(''); setError(''); setNotice(''); }}><ArrowLeft size={13} /> Editar meus dados</button>
              <button type="button" disabled={!canSubmit || cooldown > 0} onClick={() => void submit('code')} className="text-xs font-semibold text-[var(--studio-accent)] underline underline-offset-4 disabled:opacity-50">{cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}</button>
            </div>
          </> : <>
            <label className="block space-y-1.5 text-sm font-medium" htmlFor="registration-name"><span>Seu nome</span><input id="registration-name" disabled={Boolean(loadingAction)} autoComplete="name" required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Como podemos chamar você?" className={fieldClass} /></label>
            <label className="block space-y-1.5 text-sm font-medium" htmlFor="registration-email"><span>E-mail de acesso</span><input id="registration-email" disabled={Boolean(loadingAction)} type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="nome@empresa.com.br" className={fieldClass} /></label>
            <div><label className="mb-1.5 block text-sm font-medium" htmlFor="registration-password">Senha</label><div className="relative"><input id="registration-password" disabled={Boolean(loadingAction)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={6} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} placeholder="Pelo menos 6 caracteres" className={`${fieldClass} pr-12`} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-xl text-[var(--studio-muted)]">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
            <div className="flex items-start gap-2.5 pt-1"><input id="registration-terms" disabled={Boolean(loadingAction)} type="checkbox" required checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#a1efbc]" /><label htmlFor="registration-terms" className="text-xs leading-relaxed text-[var(--studio-muted)]">Concordo com os <Link href="/termos" target="_blank" rel="noopener" className="text-[var(--studio-ink)] underline underline-offset-2">Termos de Uso</Link> e a <Link href="/privacidade" target="_blank" rel="noopener" className="text-[var(--studio-ink)] underline underline-offset-2">Política de Privacidade</Link>.</label></div>
          </>}

          {config?.siteKey && <RegistrationChallenge siteKey={config.siteKey} onToken={setTurnstileToken} resetCount={resetCount} />}
          {configError && <div role="alert" className="rounded-xl border border-amber-500/30 p-3 text-xs text-amber-200">Não foi possível carregar a configuração do cadastro. <button type="button" className="underline" onClick={() => { setConfigError(false); setConfigAttempt(value => value + 1); }}>Tentar novamente</button></div>}
          {!config && !configError && <p role="status" className="text-xs text-[var(--studio-muted)]">Preparando cadastro…</p>}
          {notice && <p role="status" className="text-xs text-[var(--studio-accent)]">{notice}</p>}
          {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200">{error}</p>}

          <button type="submit" disabled={!canSubmit} className="dash-btn-primary flex w-full items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold disabled:opacity-50">
            {loadingAction ? <><LoaderCircle size={16} className="animate-spin" />{loadingAction === 'code' ? 'Enviando código…' : 'Criando conta…'}</> : <>{confirming ? 'Confirmar e ir para pagamento' : 'Receber código por e-mail'}{confirming ? <ArrowRight size={16} /> : <Mail size={16} />}</>}
          </button>
        </form>
        <p className="mt-5 flex items-center gap-2 text-xs text-[var(--studio-muted)]"><ShieldCheck size={15} className="shrink-0 text-[var(--studio-accent)]" /> Seu e-mail é confirmado antes de criar a conta.</p>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--studio-line)] pt-4 text-xs text-[var(--studio-muted)]"><span>Abordai · Prospecção comercial</span><span className="flex items-center gap-1.5"><LockKeyhole size={12} /> Cadastro seguro</span></footer>
    </section>
    <RegistrationPreview />
  </main>;
}

export default function RegisterPage() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-[var(--studio-bg)] text-sm text-[var(--studio-muted)]">Carregando cadastro…</main>}><RegisterForm /></Suspense>;
}
