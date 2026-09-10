"use client";

import { useState } from 'react';
import { useAuth } from '@/store/useAuth';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Mail, Lock, ArrowRight, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [viewMode, setViewMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const setAuth = useAuth(state => state.setAuth);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.post('/auth/login', { email, password });
      setAuth(res.data.token, res.data.user);
      router.push('/dashboard');
    } catch (err: unknown) {
      let msg = 'Falha na autenticação. Verifique seus dados.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
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
      {/* Luz ambiente difusa de fundo */}
      <div className="glow-ambient" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 relative z-10 border border-white/[0.08] shadow-2xl backdrop-blur-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl overflow-hidden mb-4 shadow-xl shadow-purple-500/30 border border-purple-500/30">
            <Image src="/logo.png" alt="Logo" width={56} height={56} priority className="w-full h-full object-cover" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            {viewMode === 'login' ? 'Bem-vindo de volta' : 'Recuperar Senha'}
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 text-center">
            {viewMode === 'login'
              ? 'Acesse o painel do Disparador de Mensagens'
              : 'Informe seu e-mail para receber as instruções de recuperação'}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2.5 text-xs text-red-400 font-medium animate-in fade-in">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {viewMode === 'forgot' && forgotSuccess ? (
          <div className="text-center space-y-4 animate-in fade-in zoom-in duration-300">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Verifique sua caixa de entrada</h2>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Se este e-mail estiver cadastrado, enviamos um link temporário para redefinição de senha (válido por 15 minutos).
              </p>
            </div>
            <button
              onClick={() => {
                setViewMode('login');
                setForgotSuccess(false);
                setErrorMessage(null);
              }}
              className="w-full btn-primary-dark py-2.5 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-2 mt-4"
            >
              <ArrowLeft size={14} />
              Voltar para o Login
            </button>
          </div>
        ) : viewMode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">E-mail</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 glass-input rounded-xl text-sm"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Senha</label>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('forgot');
                    setErrorMessage(null);
                  }}
                  className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock size={16} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 glass-input rounded-xl text-sm"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary-dark py-3 rounded-xl mt-6 group cursor-pointer flex items-center justify-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processando...
                </span>
              ) : (
                <>
                  Entrar na Plataforma
                  <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">E-mail Cadastrado</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 glass-input rounded-xl text-sm"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary-dark py-3 rounded-xl mt-4 group cursor-pointer flex items-center justify-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enviando link...
                </span>
              ) : (
                <>
                  Enviar link de recuperação
                  <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('login');
                setErrorMessage(null);
              }}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition-colors py-2 cursor-pointer flex items-center justify-center gap-1"
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
              className="text-xs font-medium text-slate-400 hover:text-purple-300 transition-colors cursor-pointer"
            >
              Não tem conta?{' '}
              <span className="text-purple-400 font-semibold underline underline-offset-4">
                Registre-se gratuitamente
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
