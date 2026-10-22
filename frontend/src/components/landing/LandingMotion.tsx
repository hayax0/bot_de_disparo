"use client";

import type { ReactNode } from "react";
import { useGsapScroll } from "./hooks/useGsapScroll";

export function LandingMotion({ children }: { children: ReactNode }) {
  const { containerRef } = useGsapScroll();

  return (
    <div ref={containerRef} className="landing-page min-h-screen bg-[var(--studio-bg)] text-[var(--studio-ink)] selection:bg-emerald-500/20 selection:text-emerald-200 overflow-x-hidden">
      {children}
    </div>
  );
}
