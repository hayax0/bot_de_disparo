"use client";

import { useState } from 'react';
import { useAuth } from '@/store/useAuth';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Mail, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const setAuth = useAuth(state => state.setAuth);
  const router = useRouter();

  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister ? { email, password, name } : { email, password };
      const res = await api.post(endpoint, payload);
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
            {isRegister ? 'Criar sua conta' : 'Bem-vindo de volta'}
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 text-center">
            {isRegister ? 'Inicie sua prospecção automatizada via WhatsApp' : 'Acesse o painel do Disparador de Mensagens'}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2.5 text-xs text-red-400 font-medium animate-in fade-in">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isRegister && (
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
                  placeholder="Ex: Caio Campos"
                />
              </div>
            </div>
          )}
          
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
                {isRegister ? 'Registrar Conta' : 'Entrar na Plataforma'}
                <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center pt-4 border-t border-white/[0.06]">
          <button 
            onClick={() => {
              setIsRegister(!isRegister);
              setErrorMessage(null);
            }} 
            className="text-xs font-medium text-slate-400 hover:text-purple-300 transition-colors cursor-pointer"
          >
            {isRegister ? 'Já tem uma conta? ' : 'Não tem conta? '}
            <span className="text-purple-400 font-semibold underline underline-offset-4">
              {isRegister ? 'Entre aqui' : 'Registre-se gratuitamente'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

