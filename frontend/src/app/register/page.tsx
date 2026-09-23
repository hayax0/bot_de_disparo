"use client";

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/store/useAuth';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import { api } from '@/lib/api';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [codeMessage, setCodeMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<'code' | 'register' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const setAuth = useAuth(state => state.setAuth);
  const router = useRouter();

  // Contador de feedback de 60s (a restrição real é mantida no backend)
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const requestCode = async (): Promise<boolean> => {
    if (!email || !email.includes('@')) {
      setErrorMessage('Informe um e-mail válido para receber o código.');
      return false;
    }
    setLoading(true);
    setLoadingAction('code');
    setErrorMessage(null);
    try {
      const res = await api.post('/auth/register/code', { email: email.trim().toLowerCase() });
      setCodeMessage(res.data.message || 'Código enviado com sucesso! Confira sua caixa de entrada ou spam.');
      setCooldown(60);
      setVerificationRequired(true);
      setTimeout(() => codeInputRef.current?.focus(), 150);
      return true;
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error || 'Falha ao enviar código.' : 'Falha ao enviar código.';
      setErrorMessage(msg);
      return false;
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!termsAccepted) {
      setErrorMessage('É obrigatório ler e aceitar os Termos de Uso e a Política de Privacidade.');
      return;
    }

    // Se ainda não gerou o código de verificação
    if (!verificationRequired) {
      await requestCode();
      return;
    }

    // Se já gerou mas ainda não digitou os 6 dígitos
    if (!verificationCode || verificationCode.trim().length !== 6) {
      setErrorMessage('Por favor, digite o código de 6 dígitos enviado para seu e-mail.');
      codeInputRef.current?.focus();
      return;
    }

    setLoading(true);
    setLoadingAction('register');
    try {
      const res = await api.post('/auth/register', { 
        email: email.trim().toLowerCase(), 
        password, 
        name,
        termsAccepted: true,
        verificationCode: verificationCode.trim(),
      });
      setAuth(res.data.token, res.data.user);
      router.push('/dashboard');
    } catch (err: unknown) {
      let msg = 'Falha ao criar conta. Verifique os dados informados.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
        if (err.response.data.code === 'EMAIL_VERIFICATION_REQUIRED') {
          setVerificationRequired(true);
          if (cooldown <= 0) requestCode();
        }
      }
      setErrorMessage(msg);
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08090D] p-4 relative overflow-hidden">
      {/* Sutil iluminação neutra de profundidade */}
      <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-emerald-500/[0.02] blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md dash-card rounded-3xl p-6 sm:p-8 relative z-10 backdrop-blur-xl">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="w-13 h-13 rounded-2xl overflow-hidden mb-4 border border-white/[0.12] bg-[#0A0C12] p-0.5 hover:border-emerald-500/40 transition-colors">
            <Image src="/logo.png" alt="Logo Disparador" width={52} height={52} priority className="w-full h-full object-cover rounded-xl" />
          </Link>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
            Criar sua conta
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 text-center font-normal">
            Cadastre-se para iniciar sua prospecção automatizada via WhatsApp
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-xs text-rose-300 font-medium animate-in fade-in">
            <AlertCircle size={16} className="text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wider mb-1.5">Seu Nome</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <User size={15} />
              </div>
              <input 
                type="text" 
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="block w-full pl-10 pr-3.5 py-2.5 dash-input rounded-xl text-sm"
                placeholder="Ex: Seu Nome ou Empresa"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wider mb-1.5">E-mail</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Mail size={15} />
              </div>
              <input 
                type="email" 
                required
                value={email}
                onChange={e => { setEmail(e.target.value); setVerificationRequired(false); setVerificationCode(''); setCodeMessage(''); }}
                className="block w-full pl-10 pr-3.5 py-2.5 dash-input rounded-xl text-sm"
                placeholder="seu@email.com"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wider mb-1.5">Senha</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock size={15} />
              </div>
              <input 
                type="password" 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3.5 py-2.5 dash-input rounded-xl text-sm"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
          </div>

          {verificationRequired && (
            <div className="space-y-2.5 p-3.5 bg-emerald-500/[0.06] border border-emerald-500/25 rounded-2xl animate-in fade-in" aria-live="polite">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-200 leading-relaxed font-normal">
                  Enviamos um código de 6 dígitos para seu e-mail. Digite-o abaixo para concluir o cadastro.
                </p>
              </div>

              {codeMessage && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-medium">
                  {codeMessage}
                </div>
              )}

              <div className="pt-1">
                <label htmlFor="verification-code" className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Código de confirmação (6 dígitos)
                </label>
                <input 
                  id="verification-code" 
                  ref={codeInputRef}
                  inputMode="numeric" 
                  autoComplete="one-time-code" 
                  maxLength={6}
                  value={verificationCode} 
                  onChange={e => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="block w-full px-3.5 py-2.5 dash-input rounded-xl text-base font-mono tracking-widest text-center font-bold text-emerald-400" 
                  placeholder="000000" 
                />
              </div>

              <div className="flex items-center justify-end pt-1">
                <button 
                  type="button" 
                  disabled={loading || cooldown > 0} 
                  onClick={requestCode} 
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline disabled:opacity-50 disabled:no-underline cursor-pointer focus-visible:outline-none"
                >
                  {cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Reenviar código por e-mail'}
                </button>
              </div>
            </div>
          )}

          <div className="pt-2">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-white/20 bg-white/[0.05] text-emerald-500 focus:ring-emerald-400 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-xs text-slate-400 leading-relaxed font-normal">
                Li e concordo expressamente com os{' '}
                <Link 
                  href="/termos" 
                  target="_blank" 
                  className="text-emerald-400 font-medium hover:underline focus-visible:outline-none"
                >
                  Termos de Uso
                </Link>{' '}
                e a{' '}
                <Link 
                  href="/privacidade" 
                  target="_blank" 
                  className="text-emerald-400 font-medium hover:underline focus-visible:outline-none"
                >
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full dash-btn-primary py-3 mt-6 group cursor-pointer flex items-center justify-center text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {loadingAction === 'code' ? 'Enviando código...' : 'Criando conta...'}
              </span>
            ) : verificationRequired ? (
              <>
                <span>Confirmar Código e Criar Conta</span>
                <ArrowRight size={15} className="ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            ) : (
              <>
                <span>Enviar Código de Confirmação</span>
                <ArrowRight size={15} className="ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center pt-4 border-t border-white/[0.06]">
          <Link 
            href="/login"
            className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:underline"
          >
            Já tem uma conta?{' '}
            <span className="text-emerald-400 font-medium underline underline-offset-4">
              Entre aqui
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
