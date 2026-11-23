'use client';

import Image from 'next/image';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Camera, Check, KeyRound, LoaderCircle, Mail, ShieldCheck, UserRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, type User } from '@/store/useAuth';

interface AccountDetails {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
}

function getMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
    ? error.response.data.error
    : fallback;
}

function initials(name: string | null | undefined, email: string | undefined) {
  const source = name?.trim() || email?.split('@')[0] || 'A';
  return source.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
}

const fieldClass = 'w-full rounded-xl border border-[var(--studio-line)] bg-[var(--studio-bg)] px-4 py-3 text-sm text-[var(--studio-ink)] placeholder:text-[var(--studio-muted)]/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)] disabled:opacity-60';
const buttonClass = 'dash-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]';
const secondaryButtonClass = 'dash-btn-secondary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]';

function SectionHeading({ icon, eyebrow, title, description }: { icon: ReactNode; eyebrow: string; title: string; description: string }) {
  return <div className="flex items-start gap-3">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--studio-accent)]/25 bg-[var(--studio-accent)]/10 text-[var(--studio-accent)]">{icon}</span>
    <div><p className="studio-eyebrow">{eyebrow}</p><h3 className="mt-1 text-base font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-relaxed text-[var(--studio-muted)]">{description}</p></div>
  </div>;
}

function Feedback({ error, notice }: { error: string; notice: string }) {
  if (error) return <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>;
  if (notice) return <p role="status" className="flex items-center gap-2 text-sm text-[var(--studio-accent)]"><Check size={15} />{notice}</p>;
  return null;
}

export function AccountSettingsPanel() {
  const router = useRouter();
  const { token, user, setAuth, logout } = useAuth();
  const [account, setAccount] = useState<AccountDetails | null>(null);
  const [name, setName] = useState(user?.name || '');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [passwordCurrent, setPasswordCurrent] = useState('');
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [emailNotice, setEmailNotice] = useState('');
  const [securityNotice, setSecurityNotice] = useState('');
  const [profileError, setProfileError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [securityError, setSecurityError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/account/me').then(({ data }) => {
      if (!active) return;
      setAccount(data.user);
      setName(data.user.name || '');
      setPendingEmail(data.pendingEmail || null);
      setNewEmail(data.pendingEmail || '');
    }).catch(error => {
      if (active) setProfileError(getMessage(error, 'Não foi possível carregar os dados da conta.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const updateAuthUser = (updated: Partial<AccountDetails>) => {
    if (!token || !user) return;
    const nextUser: User = { ...user, ...updated };
    setAuth(token, nextUser);
  };

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving('name'); setProfileError(''); setProfileNotice('');
    try {
      const { data } = await api.put('/account/profile', { name });
      setAccount(previous => previous ? { ...previous, ...data.user } : data.user);
      updateAuthUser(data.user);
      setProfileNotice('Nome do perfil atualizado.');
    } catch (error) {
      setProfileError(getMessage(error, 'Não foi possível salvar seu nome.'));
    } finally { setSaving(''); }
  };

  const saveAvatar = async () => {
    if (!avatarFile) return;
    setSaving('avatar'); setProfileError(''); setProfileNotice('');
    try {
      const body = new FormData();
      body.append('avatar', avatarFile);
      const { data } = await api.post('/account/avatar', body);
      setAccount(previous => previous ? { ...previous, ...data.user } : data.user);
      updateAuthUser(data.user);
      setAvatarFile(null);
      setAvatarPreview(null);
      setProfileNotice('Foto de perfil atualizada.');
    } catch (error) {
      setProfileError(getMessage(error, 'Não foi possível salvar sua foto.'));
    } finally { setSaving(''); }
  };

  const requestEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving('email'); setEmailError(''); setEmailNotice('');
    try {
      const { data } = await api.post('/account/email/request', { email: newEmail });
      setPendingEmail(newEmail.trim().toLowerCase());
      setEmailCode('');
      setEmailNotice(data.message || 'Código enviado ao novo endereço.');
    } catch (error) {
      setEmailError(getMessage(error, 'Não foi possível enviar o código de confirmação.'));
    } finally { setSaving(''); }
  };

  const confirmEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving('email'); setEmailError(''); setEmailNotice('');
    try {
      await api.post('/account/email/confirm', { code: emailCode });
      sessionStorage.setItem('account-change-notice', 'E-mail atualizado. Entre com o novo endereço para continuar.');
      logout();
      router.replace('/login');
    } catch (error) {
      setEmailError(getMessage(error, 'Não foi possível confirmar o novo e-mail.'));
    } finally { setSaving(''); }
  };

  const cancelEmailChange = async () => {
    setSaving('email'); setEmailError(''); setEmailNotice('');
    try {
      await api.delete('/account/email/pending');
      setPendingEmail(null); setNewEmail(''); setEmailCode('');
      setEmailNotice('Alteração pendente cancelada. Seu e-mail atual continua ativo.');
    } catch (error) {
      setEmailError(getMessage(error, 'Não foi possível cancelar a alteração pendente.'));
    } finally { setSaving(''); }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSecurityError(''); setSecurityNotice('');
    if (passwordNew !== passwordConfirm) {
      setSecurityError('A confirmação não corresponde à nova senha.');
      return;
    }
    setSaving('password');
    try {
      await api.put('/account/password', { currentPassword: passwordCurrent, newPassword: passwordNew });
      sessionStorage.setItem('account-change-notice', 'Senha atualizada. Entre novamente com a nova senha.');
      logout();
      router.replace('/login');
    } catch (error) {
      setSecurityError(getMessage(error, 'Não foi possível alterar sua senha.'));
    } finally { setSaving(''); }
  };

  const avatarSource = avatarPreview || account?.avatarUrl || user?.avatarUrl || null;

  return (
    <div className="space-y-5">
      <section data-dashboard-reveal className="dash-card space-y-5 rounded-2xl p-5 sm:p-6">
        <SectionHeading icon={<UserRound size={18} />} eyebrow="SUA CONTA" title="Perfil e identificação" description="Atualize como seu perfil aparece no Abordai. As alterações são salvas na sua conta." />
        <div className="flex flex-col gap-5 border-t border-[var(--studio-line)] pt-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--studio-line)] bg-[var(--studio-bg)] text-xl font-semibold text-[var(--studio-accent)]">
              {avatarSource ? <Image src={avatarSource} alt="Foto de perfil" width={80} height={80} unoptimized className="h-full w-full object-cover" /> : initials(account?.name || user?.name, account?.email || user?.email)}
            </div>
            <div><p className="text-sm font-semibold text-white">Foto de perfil</p><p className="mt-1 text-xs text-[var(--studio-muted)]">PNG, JPG ou WebP · até 2 MB</p></div>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <label className={`${secondaryButtonClass} cursor-pointer`}>
              <Camera size={15} />Escolher foto
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => {
                const file = event.target.files?.[0];
                if (!file) return;
                setProfileError(''); setProfileNotice('');
                if (file.size > 2 * 1024 * 1024) { setProfileError('A foto deve ter no máximo 2 MB.'); return; }
                setAvatarFile(file); setAvatarPreview(URL.createObjectURL(file));
              }} />
            </label>
            {avatarFile && <button type="button" className={buttonClass} disabled={Boolean(saving)} onClick={() => void saveAvatar()}>{saving === 'avatar' ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}Salvar foto</button>}
          </div>
        </div>
        <form onSubmit={saveName} className="grid gap-3 border-t border-[var(--studio-line)] pt-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block space-y-2 text-sm"><span className="font-medium text-white">Nome do perfil</span><input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)} className={fieldClass} placeholder="Como devemos chamar você?" disabled={loading || Boolean(saving)} /></label>
          <button type="submit" className={buttonClass} disabled={loading || Boolean(saving) || name.trim() === (account?.name || '')}>{saving === 'name' ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}Salvar nome</button>
        </form>
        <Feedback error={profileError} notice={profileNotice} />
      </section>

      <section data-dashboard-reveal className="dash-card space-y-5 rounded-2xl p-5 sm:p-6">
        <SectionHeading icon={<Mail size={18} />} eyebrow="ACESSO" title="Endereço de e-mail" description="O novo endereço só passa a valer depois que você confirmar o código recebido nele." />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--studio-line)] bg-[var(--studio-bg)]/60 p-4">
          <div><p className="text-[11px] uppercase tracking-wider text-[var(--studio-muted)]">E-mail atual</p><p className="mt-1 break-all text-sm font-medium text-white">{account?.email || user?.email || 'Carregando...'}</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--studio-accent)]/20 bg-[var(--studio-accent)]/10 px-2.5 py-1 text-xs text-[var(--studio-accent)]"><ShieldCheck size={13} />{account?.emailVerifiedAt ? 'Confirmado' : 'Verificação necessária'}</span>
        </div>
        {pendingEmail ? (
          <form onSubmit={confirmEmailChange} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3"><p className="text-sm text-[var(--studio-muted)]">Código enviado para <strong className="break-all text-white">{pendingEmail}</strong>. O e-mail atual segue ativo até confirmar.</p><button type="button" onClick={() => void cancelEmailChange()} disabled={Boolean(saving)} className="inline-flex items-center gap-1 text-xs text-[var(--studio-muted)] hover:text-white disabled:opacity-50"><X size={13} />Cancelar</button></div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block space-y-2 text-sm"><span className="font-medium text-white">Código de confirmação</span><input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={emailCode} onChange={event => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className={`${fieldClass} font-mono tracking-[0.35em]`} placeholder="000000" disabled={Boolean(saving)} /></label>
              <button type="submit" className={buttonClass} disabled={Boolean(saving) || emailCode.length !== 6}>{saving === 'email' ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}Confirmar e-mail</button>
            </div>
          </form>
        ) : (
          <form onSubmit={requestEmailChange} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block space-y-2 text-sm"><span className="font-medium text-white">Novo e-mail</span><input required type="email" autoComplete="email" maxLength={254} value={newEmail} onChange={event => setNewEmail(event.target.value)} className={fieldClass} placeholder="voce@empresa.com" disabled={Boolean(saving)} /></label>
            <button type="submit" className={buttonClass} disabled={Boolean(saving) || !newEmail.trim()}>{saving === 'email' ? <LoaderCircle size={15} className="animate-spin" /> : <Mail size={15} />}Enviar código</button>
          </form>
        )}
        <Feedback error={emailError} notice={emailNotice} />
      </section>

      <section data-dashboard-reveal className="dash-card space-y-5 rounded-2xl p-5 sm:p-6">
        <SectionHeading icon={<KeyRound size={18} />} eyebrow="SEGURANÇA" title="Alterar senha" description="A senha atual é necessária. Ao salvar, as outras sessões da conta serão encerradas." />
        <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-2 text-sm sm:col-span-2"><span className="font-medium text-white">Senha atual</span><input required type="password" autoComplete="current-password" value={passwordCurrent} onChange={event => setPasswordCurrent(event.target.value)} className={fieldClass} disabled={Boolean(saving)} /></label>
          <label className="block space-y-2 text-sm"><span className="font-medium text-white">Nova senha</span><input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={passwordNew} onChange={event => setPasswordNew(event.target.value)} className={fieldClass} disabled={Boolean(saving)} /><span className="block text-xs text-[var(--studio-muted)]">Use pelo menos 8 caracteres.</span></label>
          <label className="block space-y-2 text-sm"><span className="font-medium text-white">Confirmar nova senha</span><input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={passwordConfirm} onChange={event => setPasswordConfirm(event.target.value)} className={fieldClass} disabled={Boolean(saving)} /></label>
          <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between"><Feedback error={securityError} notice={securityNotice} /><button type="submit" className={`${buttonClass} sm:ml-auto`} disabled={Boolean(saving) || !passwordCurrent || !passwordNew || !passwordConfirm}>{saving === 'password' ? <LoaderCircle size={15} className="animate-spin" /> : <KeyRound size={15} />}Atualizar senha</button></div>
        </form>
      </section>
    </div>
  );
}
