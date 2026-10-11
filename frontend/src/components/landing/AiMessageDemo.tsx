"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, Sparkles } from "lucide-react";
import gsap from "gsap";

const examples = [
  { label: "Abrir uma conversa", text: "Olá, Ana! Vi a Clínica Aurora e pensei em uma ideia para os agendamentos. Posso te mostrar em dois minutos?" },
  { label: "Despertar curiosidade", text: "Olá, equipe Villa Gourmet! Como vocês recebem reservas hoje? Tenho uma sugestão que pode fazer sentido para o restaurante." },
  { label: "Retomar o contato", text: "Oi, Bruno! Conseguiu olhar a ideia que comentei? Se fizer sentido, posso te enviar um exemplo aplicado ao seu negócio." },
];

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function AiMessageDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<gsap.core.Timeline | null>(null);
  const visibleRef = useRef(false);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true);

  useEffect(() => {
    const root = rootRef.current;
    const text = textRef.current;
    const label = labelRef.current;
    if (!root || !text || !label) return;
    text.textContent = examples[0].text;
    label.textContent = examples[0].label;
    if (reducedMotion) return;

    // Demonstração local: nenhum texto é enviado a um provedor de IA.
    const timeline = gsap.timeline({ repeat: -1, paused: true });
    examples.forEach(example => {
      const cursor = { length: 0 };
      timeline.call(() => {
        text.textContent = "";
        label.textContent = example.label;
      });
      timeline.to(cursor, {
        length: example.text.length,
        duration: example.text.length * 0.025,
        ease: "none",
        onUpdate: () => { text.textContent = example.text.slice(0, Math.floor(cursor.length)); },
      });
      timeline.to({}, { duration: 2.5 });
    });
    animationRef.current = timeline;
    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      timeline.paused(!entry.isIntersecting || pausedRef.current);
    }, { threshold: 0.2 });
    observer.observe(root);
    return () => {
      observer.disconnect();
      timeline.kill();
      animationRef.current = null;
    };
  }, [reducedMotion]);

  useEffect(() => {
    pausedRef.current = paused;
    animationRef.current?.paused(paused || !visibleRef.current);
  }, [paused]);

  return (
    <div ref={rootRef} className="studio-ai-demo">
      <div className="studio-ai-demo-heading">
        <span><Sparkles size={12} /> PRÉVIA DA IA</span>
        {!reducedMotion && (
          <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "Retomar animação das mensagens" : "Pausar animação das mensagens"} aria-pressed={paused}>
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
        )}
      </div>
      <div aria-hidden="true">
        <span ref={labelRef} className="studio-ai-demo-label">{examples[0].label}</span>
        <p className="studio-ai-demo-message"><span ref={textRef}>{examples[0].text}</span><span className={`studio-ai-cursor ${paused || reducedMotion ? "is-paused" : ""}`} /></p>
      </div>
      <span className="sr-only">Exemplo de mensagem: {examples[0].text}</span>
      <span className="studio-ai-demo-note">Exemplos ilustrativos. Sua mensagem, sua decisão.</span>
    </div>
  );
}
