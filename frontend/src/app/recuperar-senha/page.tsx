"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Lock, ArrowRight, AlertCircle, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import { api } from '@/lib/api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tokenFromUrl = searchParams.get('token');
  const [token, setToken] = useState<string | null>(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    !tokenFromUrl ? 'Link de recuperação inválido ou ausente. Solicite um novo link.' : null
  );
  const [success, setSuccess] = useState(false);

  // Remove o token da barra de endereços sem recarregar a página para evitar exposição em histórico
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('token=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage('Token de recuperação não encontrado. Por favor, solicite um novo link.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('A nova senha deve conter pelo menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('As senhas digitadas não coincidem.');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/reset-password', {
        token,
        password,
      });

      setSuccess(true);
      // Invalida o token em memória por segurança
      setToken(null);
    } catch (err: unknown) {
      let msg = 'Não foi possível redefinir sua senha. Verifique o link e tente novamente.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 relative z-10 border border-white/[0.08] shadow-2xl backdrop-blur-2xl">
      <div className="flex flex-col items-center mb-8">
        <div className="w-14 h-14 rounded-2xl overflow-hidden mb-4 shadow-xl shadow-purple-500/30 border border-purple-500/30">
          <Image src="/logo.png" alt="Logo" width={56} height={56} priority className="w-full h-full object-cover" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          Redefinir Senha
        </h1>
        <p className="text-xs text-slate-400 mt-1.5 text-center">
          Crie uma nova senha segura para acessar sua conta
        </p>
      </div>

      {success ? (
        <div className="text-center space-y-4 animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-500/20">
            <CheckCircle2 size={32} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Senha alterada com sucesso!</h2>
            <p className="text-xs text-slate-400 mt-1">
              Todas as sessões anteriores foram encerradas por segurança. Você já pode fazer login com sua nova senha.
            </p>
          </div>

          <button
            onClick={() => router.push('/login')}
            className="w-full btn-primary-dark py-3 rounded-xl mt-4 flex items-center justify-center text-sm cursor-pointer"
          >
            Ir para o Login
            <ArrowRight size={16} className="ml-2" />
          </button>
        </div>
      ) : (
        <>
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2.5 text-xs text-red-400 font-medium animate-in fade-in">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Nova Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 glass-input rounded-xl text-sm"
                  placeholder="Mínimo de 8 caracteres"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Confirmar Nova Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 glass-input rounded-xl text-sm"
                  placeholder="Repita sua nova senha"
                  minLength={8}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.05]">
              <ShieldCheck size={14} className="text-purple-400 shrink-0" />
              <span>A troca de senha desconectará todos os dispositivos ativos.</span>
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full btn-primary-dark py-3 rounded-xl mt-4 group cursor-pointer flex items-center justify-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Redefinindo senha...
                </span>
              ) : (
                <>
                  Confirmar Nova Senha
                  <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center pt-4 border-t border-white/[0.06]">
            <Link
              href="/login"
              className="text-xs font-medium text-slate-400 hover:text-purple-300 transition-colors"
            >
              Lembrou a senha? <span className="text-purple-400 font-semibold underline underline-offset-4">Voltar ao Login</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08090D] p-4 relative overflow-hidden">
      <div className="glow-ambient" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <Suspense fallback={
        <div className="w-full max-w-md glass-panel rounded-3xl p-8 text-center text-slate-400 text-sm">
          Carregando formulário seguro...
        </div>
      }>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
