"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

export function useGsapScroll() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Registra o ScrollTrigger
    gsap.registerPlugin(ScrollTrigger);

    // Respeita preferência do usuário de redução de movimento
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Detecta se é dispositivo desktop com mouse/pointer fino
    const isDesktop = window.matchMedia("(min-width: 768px) and (hover: hover)").matches;

    // 1. Inicializa o Lenis Smooth Scroll APENAS no Desktop
    let lenis: Lenis | null = null;
    let updateTicker: ((time: number) => void) | null = null;

    if (!prefersReducedMotion && isDesktop) {
      lenis = new Lenis({
        duration: 1.1,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: "vertical",
        gestureOrientation: "vertical",
        smoothWheel: true,
        wheelMultiplier: 0.9,
        syncTouch: false,
      });

      lenis.on("scroll", ScrollTrigger.update);

      updateTicker = (time: number) => {
        lenis?.raf(time * 1000);
      };

      gsap.ticker.add(updateTicker);
      gsap.ticker.lagSmoothing(0);
    }

    // 2. Animações com Contexto GSAP
    const ctx = gsap.context(() => {
      // No mobile ou com preferência de redução de movimento:
      // Mantém todos os elementos 100% visíveis e com layout original imediatamente
      if (prefersReducedMotion || !isDesktop) {
        gsap.set(".gsap-reveal, .manifesto-stagger", {
          opacity: 1,
          y: 0,
          scale: 1,
          clearProps: "all",
        });
        return;
      }

      // No desktop: executa as revelações suaves com ScrollTrigger
      const revealElements = gsap.utils.toArray<HTMLElement>(".gsap-reveal");
      revealElements.forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: "power2.out",
            scrollTrigger: {
              trigger: el,
              start: "top 85%",
              toggleActions: "play none none none",
            },
          }
        );
      });

      // Animação de entrada dos cards do manifesto
      const manifestoElements = gsap.utils.toArray<HTMLElement>(".manifesto-stagger");
      if (manifestoElements.length > 0) {
        gsap.fromTo(
          manifestoElements,
          { opacity: 0, y: 25, scale: 0.98 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.7,
            stagger: 0.12,
            ease: "power2.out",
            scrollTrigger: {
              trigger: ".manifesto-trigger",
              start: "top 80%",
              toggleActions: "play none none none",
            },
          }
        );
      }
    }, containerRef);

    return () => {
      ctx.revert();
      if (updateTicker) {
        gsap.ticker.remove(updateTicker);
      }
      if (lenis) {
        lenis.destroy();
      }
    };
  }, []);

  return { containerRef };
}
