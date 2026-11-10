'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

export function RegistrationChallenge({ siteKey, resetCount, onToken }: {
  siteKey: string;
  resetCount: number;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string>(null);
  const [api, setApi] = useState<Turnstile>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'retry' | 'script-error'>('loading');

  useEffect(() => {
    if (!api || !container.current) return;
    let active = true;
    const retry = () => {
      if (!active) return;
      onToken('');
      setStatus('retry');
    };
    const id = api.render(container.current, {
      sitekey: siteKey,
      action: 'register',
      theme: 'dark',
      language: 'pt-br',
      size: window.matchMedia('(max-width: 370px)').matches ? 'compact' : 'flexible',
      callback: (token: string) => {
        if (!active) return;
        onToken(token);
        setStatus('ready');
      },
      'expired-callback': retry,
      'timeout-callback': retry,
      'error-callback': retry,
    });
    widget.current = id;
    return () => {
      active = false;
      widget.current = null;
      api.remove(id);
    };
  }, [api, onToken, siteKey]);

  useEffect(() => {
    if (resetCount > 0 && widget.current !== null) api?.reset(widget.current);
  }, [api, resetCount]);

  return <div className="space-y-2">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      onReady={() => {
        const turnstile = (window as Window & { turnstile?: Turnstile }).turnstile;
        if (turnstile) setApi(turnstile);
        else setStatus('script-error');
      }}
      onError={() => { onToken(''); setStatus('script-error'); }}
    />
    <div ref={container} aria-label="Verificação de segurança Cloudflare" />
    {status === 'loading' && <p role="status" className="text-xs text-[var(--studio-muted)]">Aguardando a verificação de segurança…</p>}
    {status === 'retry' && <button type="button" className="text-xs font-semibold text-[var(--studio-accent)] underline underline-offset-4" onClick={() => {
      if (widget.current === null) return;
      setStatus('loading');
      api?.reset(widget.current);
    }}>Refazer verificação de segurança</button>}
    {status === 'script-error' && <p role="alert" className="text-xs text-amber-200">A verificação de segurança não carregou. Recarregue a página para tentar novamente.</p>}
  </div>;
}
