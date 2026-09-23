"use client";

import { useState } from 'react';
import { useAuth } from '@/store/useAuth';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Mail, Lock, ArrowRight, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [viewMode, setViewMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const setAuth = useAuth(state => state.setAuth);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setErrorCode(null);
    try {
      const res = await api.post('/auth/login', { email, password });
      setAuth(res.data.token, res.data.user);
      router.push('/dashboard');
    } catch (err: unknown) {
      let msg = 'Falha na autenticação. Verifique seus dados.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
        if (err.response.data.code) setErrorCode(err.response.data.code);
      }
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setForgotSuccess(true);
    } catch (err: unknown) {
      let msg = 'Erro ao processar a solicitação. Tente novamente.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08090D] p-4 relative overflow-hidden">
      {/* Sutil iluminação neutra de profundidade */}
      <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-emerald-500/[0.02] blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md dash-card rounded-3xl p-6 sm:p-8 relative z-10 backdrop-blur-xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-13 h-13 rounded-2xl overflow-hidden mb-4 border border-white/[0.12] bg-[#0A0C12] p-0.5">
            <Image src="/logo.png" alt="Logo" width={52} height={52} priority className="w-full h-full object-cover rounded-xl" />
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
            {viewMode === 'login' ? 'Bem-vindo de volta' : 'Recuperar Senha'}
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 text-center font-normal">
            {viewMode === 'login'
              ? 'Acesse o painel do Disparador de Mensagens'
              : 'Informe seu e-mail para receber as instruções de recuperação'}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex flex-col gap-2 text-xs text-rose-300 font-medium animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle size={16} className="text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            {errorCode === 'EMAIL_VERIFICATION_REQUIRED' && (
              <Link 
                href="/register" 
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline mt-1 pl-6 focus-visible:outline-none"
              >
                Clique aqui para regularizar sua conta no Cadastre-se →
              </Link>
            )}
          </div>
        )}

        {viewMode === 'forgot' && forgotSuccess ? (
          <div className="text-center space-y-4 animate-in fade-in zoom-in duration-300">
            <div className="w-13 h-13 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 size={26} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Verifique sua caixa de entrada</h2>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-normal">
                Se este e-mail estiver cadastrado, enviamos um link temporário para redefinição de senha (válido por 15 minutos).
              </p>
            </div>
            <button
              onClick={() => {
                setViewMode('login');
                setForgotSuccess(false);
                setErrorMessage(null);
              }}
              className="w-full dash-btn-secondary py-2.5 text-xs flex items-center justify-center gap-2 mt-4 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
            >
              <ArrowLeft size={14} />
              Voltar para o Login
            </button>
          </div>
        ) : viewMode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
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
                  onChange={e => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 dash-input rounded-xl text-sm"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wider">Senha</label>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('forgot');
                    setErrorMessage(null);
                  }}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
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

            <button
              type="submit"
              disabled={loading}
              className="w-full dash-btn-primary py-3 mt-6 group cursor-pointer flex items-center justify-center text-sm disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processando...
                </span>
              ) : (
                <>
                  Entrar na Plataforma
                  <ArrowRight size={15} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wider mb-1.5">E-mail Cadastrado</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail size={15} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 dash-input rounded-xl text-sm"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full dash-btn-primary py-3 mt-4 group cursor-pointer flex items-center justify-center text-sm disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enviando link...
                </span>
              ) : (
                <>
                  Enviar link de recuperação
                  <ArrowRight size={15} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('login');
                setErrorMessage(null);
              }}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition-colors py-2 cursor-pointer flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:underline"
            >
              <ArrowLeft size={12} />
              Voltar ao Login
            </button>
          </form>
        )}

        {viewMode === 'login' && (
          <div className="mt-6 text-center pt-4 border-t border-white/[0.06]">
            <button
              onClick={() => {
                router.push('/register');
              }}
              className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer focus-visible:outline-none focus-visible:underline"
            >
              Não tem conta?{' '}
              <span className="text-emerald-400 font-medium underline underline-offset-4">
                Registre-se na plataforma
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
