"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/useAuth';

export default function Home() {
  const router = useRouter();
  const { token, isHydrated, hydrate } = useAuth();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isHydrated) return;
    if (token) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [token, isHydrated, router]);

  return <div className="min-h-screen bg-slate-50 flex items-center justify-center"></div>;
}
