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
    <div className="w-full max-w-md dash-card rounded-3xl p-6 sm:p-8 relative z-10 backdrop-blur-xl">
      <div className="flex flex-col items-center mb-8">
        <div className="w-13 h-13 rounded-2xl overflow-hidden mb-4 border border-white/[0.12] bg-[#0A0C12] p-0.5">
          <Image src="/logo.png" alt="Logo" width={52} height={52} priority className="w-full h-full object-cover rounded-xl" />
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
          Redefinir Senha
        </h1>
        <p className="text-xs text-slate-400 mt-1.5 text-center font-normal">
          Crie uma nova senha segura para acessar sua conta
        </p>
      </div>

      {success ? (
        <div className="text-center space-y-4 animate-in fade-in zoom-in duration-300">
          <div className="w-13 h-13 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 size={26} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Senha alterada com sucesso!</h2>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-normal">
              Todas as sessões anteriores foram encerradas por segurança. Você já pode fazer login com sua nova senha.
            </p>
          </div>

          <button
            onClick={() => router.push('/login')}
            className="w-full dash-btn-primary py-3 rounded-xl mt-4 flex items-center justify-center text-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
          >
            Ir para o Login
            <ArrowRight size={15} className="ml-2" />
          </button>
        </div>
      ) : (
        <>
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-xs text-rose-300 font-medium animate-in fade-in">
              <AlertCircle size={16} className="text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                Nova Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock size={15} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 dash-input rounded-xl text-sm"
                  placeholder="Mínimo de 8 caracteres"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer focus-visible:outline-none"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                Confirmar Nova Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock size={15} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 dash-input rounded-xl text-sm"
                  placeholder="Repita sua nova senha"
                  minLength={8}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.05]">
              <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
              <span>A troca de senha desconectará todos os dispositivos ativos.</span>
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full dash-btn-primary py-3 mt-4 group cursor-pointer flex items-center justify-center text-sm disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Redefinindo senha...
                </span>
              ) : (
                <>
                  Confirmar Nova Senha
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
              Lembrou a senha? <span className="text-emerald-400 font-medium underline underline-offset-4">Voltar ao Login</span>
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
      {/* Sutil iluminação neutra de profundidade */}
      <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-emerald-500/[0.02] blur-[140px] pointer-events-none" />

      <Suspense fallback={
        <div className="w-full max-w-md dash-card rounded-3xl p-8 text-center text-slate-400 text-sm">
          Carregando formulário seguro...
        </div>
      }>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}

