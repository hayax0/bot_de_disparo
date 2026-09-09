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

    // 1. Inicializa o Lenis Smooth Scroll
    let lenis: Lenis | null = null;
    if (!prefersReducedMotion) {
      lenis = new Lenis({
        duration: 1.1,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: "vertical",
        gestureOrientation: "vertical",
        smoothWheel: true,
        wheelMultiplier: 0.9,
      });

      lenis.on("scroll", ScrollTrigger.update);

      const updateTicker = (time: number) => {
        lenis?.raf(time * 1000);
      };

      gsap.ticker.add(updateTicker);
      gsap.ticker.lagSmoothing(0);
    }

    // 2. Animações com Contexto GSAP
    const ctx = gsap.context(() => {
      if (prefersReducedMotion) return;

      // Animação de revelação das seções
      const revealElements = gsap.utils.toArray<HTMLElement>(".gsap-reveal");
      revealElements.forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 35 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: "power3.out",
            scrollTrigger: {
              trigger: el,
              start: "top 85%",
              toggleActions: "play none none none",
            },
          }
        );
      });

      // Efeito de "Texto que vai surgindo/acendendo com o scroll" (Text Reveal Scrub)
      const textScrubElements = gsap.utils.toArray<HTMLElement>(".gsap-text-scrub span");
      if (textScrubElements.length > 0) {
        gsap.fromTo(
          textScrubElements,
          { opacity: 0.2, color: "#64748b" },
          {
            opacity: 1,
            color: "#f8fafc",
            stagger: 0.1,
            ease: "none",
            scrollTrigger: {
              trigger: ".gsap-text-scrub-trigger",
              start: "top 75%",
              end: "bottom 45%",
              scrub: 1,
            },
          }
        );
      }
    }, containerRef);

    return () => {
      ctx.revert();
      if (lenis) {
        lenis.destroy();
      }
    };
  }, []);

  return { containerRef };
}
