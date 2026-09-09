"use client";

import { useState } from 'react';
import { useAuth } from '@/store/useAuth';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Mail, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { api } from '@/lib/api';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const setAuth = useAuth(state => state.setAuth);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAccepted) {
      setErrorMessage('É obrigatório ler e aceitar os Termos de Uso e a Política de Privacidade.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.post('/auth/register', { 
        email, 
        password, 
        name,
        termsAccepted: true 
      });
      setAuth(res.data.token, res.data.user);
      router.push('/dashboard');
    } catch (err: unknown) {
      let msg = 'Falha ao criar conta. Verifique os dados informados.';
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
      {/* Luz ambiente difusa de fundo em tons de roxo e índigo */}
      <div className="glow-ambient" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 relative z-10 border border-white/[0.08] shadow-2xl backdrop-blur-2xl">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="w-14 h-14 rounded-2xl overflow-hidden mb-4 shadow-xl shadow-purple-500/30 border border-purple-500/30 hover:scale-105 transition-transform">
            <Image src="/logo.png" alt="Logo Disparador" width={56} height={56} priority className="w-full h-full object-cover" />
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Criar sua conta
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 text-center">
            Cadastre-se para iniciar sua prospecção automatizada via WhatsApp
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2.5 text-xs text-red-400 font-medium animate-in fade-in">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Seu Nome</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <User size={16} />
              </div>
              <input 
                type="text" 
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="block w-full pl-10 pr-3.5 py-2.5 glass-input rounded-xl text-sm"
                placeholder="Ex: Seu Nome ou Empresa"
              />
            </div>
          </div>
          
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
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Senha</label>
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

          <div className="pt-2">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-white/20 bg-white/[0.05] text-purple-600 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-xs text-slate-400 leading-relaxed">
                Li e concordo expressamente com os{' '}
                <Link 
                  href="/termos" 
                  target="_blank" 
                  className="text-purple-400 font-semibold hover:underline"
                >
                  Termos de Uso
                </Link>{' '}
                e a{' '}
                <Link 
                  href="/privacidade" 
                  target="_blank" 
                  className="text-purple-400 font-semibold hover:underline"
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
            className="w-full btn-tech-primary py-3 rounded-xl mt-6 group cursor-pointer flex items-center justify-center text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-600/25"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Criando conta...
              </span>
            ) : (
              <>
                <span>Criar Minha Conta</span>
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
            Já tem uma conta?{' '}
            <span className="text-purple-400 font-semibold underline underline-offset-4">
              Entre aqui
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
