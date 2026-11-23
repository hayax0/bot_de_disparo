'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AdminTab } from '@/components/dashboard/AdminTab';
import { useAuth } from '@/store/useAuth';

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { token, user, isHydrated, hydrate } = useAuth();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => {
    if (!isHydrated) return;
    if (!token || !user) router.replace('/login');
    else if (user.role !== 'ADMIN') router.replace('/dashboard');
  }, [isHydrated, token, user, router]);

  const addToast = useCallback((type: ToastItem['type'], message: string) => {
    const id = crypto.randomUUID();
    setToasts(previous => [...previous, { id, type, message }]);
    window.setTimeout(() => setToasts(previous => previous.filter(toast => toast.id !== id)), 5000);
  }, []);

  if (!isHydrated || !token || user?.role !== 'ADMIN') {
    return <main className="grid min-h-screen place-items-center bg-[#080b09] px-6 text-center text-sm text-[var(--studio-muted)]">Verificando acesso administrativo…</main>;
  }

  return (
    <main className="min-h-screen bg-[#080b09] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--studio-muted)] transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]">
            <ArrowLeft size={16} />Voltar ao dashboard
          </Link>
          <div className="flex items-center gap-2.5">
            <Image src="/logo-abordai-v1.png" alt="Abordai" width={32} height={32} priority className="rounded-lg border border-white/10" />
            <span className="text-sm font-semibold tracking-tight">Abordai</span>
          </div>
        </header>

        <AdminTab userRole={user.role} currentUserId={user.id} addToast={addToast} />
      </div>

      <div className="fixed bottom-5 right-5 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map(toast => <div key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${toast.type === 'error' ? 'border-rose-400/25 bg-[#241519] text-rose-100' : toast.type === 'success' ? 'border-emerald-400/25 bg-[#11211a] text-emerald-100' : 'border-white/10 bg-[#151917] text-white'}`}>{toast.message}</div>)}
      </div>
    </main>
  );
}
