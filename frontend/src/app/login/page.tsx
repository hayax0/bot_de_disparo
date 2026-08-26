"use client";

import { useState } from 'react';
import { useAuth } from '@/store/useAuth';
import { useRouter } from 'next/navigation';
import { Bot, Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md card-premium">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-3">
            <Bot size={24} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isRegister ? 'Criar sua conta' : 'Bem-vindo de volta'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isRegister ? 'Inicie sua prospecção automatizada' : 'Acesse o painel do Disparador de Mensagens'}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700 font-medium animate-in fade-in">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Seu Nome</label>
              <input 
                type="text" 
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow text-sm"
                placeholder="Ex: Carlos Silva"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">E-mail</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail size={16} />
              </div>
              <input 
                type="email" 
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="block w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow text-sm"
                placeholder="seu@email.com"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Senha</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock size={16} />
              </div>
              <input 
                type="password" 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow text-sm"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full btn-premium mt-6 group cursor-pointer"
          >
            {loading ? 'Aguarde...' : (
              <>
                {isRegister ? 'Registrar Conta' : 'Entrar na Plataforma'}
                <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
        <div className="mt-5 text-center">
          <button 
            onClick={() => {
              setIsRegister(!isRegister);
              setErrorMessage(null);
            }} 
            className="text-xs font-semibold text-brand-600 hover:underline cursor-pointer"
          >
            {isRegister ? 'Já tem uma conta? Entre aqui.' : 'Não tem conta? Registre-se gratuitamente.'}
          </button>
        </div>
      </div>
    </div>
  );
}
