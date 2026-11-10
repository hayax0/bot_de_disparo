'use client';

import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Building2, Check, ChevronLeft, ChevronRight, Globe2, MessageSquare, Search, Sparkles, Users } from 'lucide-react';

const previews = [
  { label: 'Busca de empresas', title: 'Encontre as empresas certas.', copy: 'Escolha o segmento e a região, veja os contatos encontrados e selecione quem faz sentido abordar.', Icon: Search },
  { label: 'Abordagem com IA', title: 'Comece com uma boa mensagem.', copy: 'Use o seu perfil para preparar uma abordagem curta e revise o texto antes do envio.', Icon: Sparkles },
  { label: 'Acompanhamento', title: 'Saiba quando voltar à conversa.', copy: 'Organize oportunidades e lembretes de retorno em um só lugar.', Icon: Users },
];

export function RegistrationPreview() {
  const [step, setStep] = useState(0);
  const preview = previews[step];
  const move = (offset: number) => setStep(current => (current + offset + previews.length) % previews.length);

  return <aside aria-label="Conheça o Abordai" className="relative hidden overflow-hidden rounded-[2rem] border border-[#31443c] bg-[#101a16] lg:flex lg:flex-col lg:justify-center lg:px-9 lg:py-10 xl:px-14">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_55%_14%,#284d3a_0%,transparent_62%)]" />
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(#7ba58d_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(black,transparent_78%)]" />
    <div className="relative mx-auto w-full max-w-lg">
      <div className="mb-5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.22em] text-[#b5c9bd]">
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#9ef0bd] shadow-[0_0_15px_#9ef0bd]" /> Por dentro do Abordai</span><span>0{step + 1} / 03</span>
      </div>
      <div className="relative rounded-3xl border border-[#436051] bg-[#0d1511] p-4 shadow-[0_22px_65px_#0008] xl:p-5">
        <div className="flex items-center gap-2 border-b border-[#2c4035] pb-3.5">
          <span className="flex gap-1.5" aria-hidden="true"><i className="h-1.5 w-1.5 rounded-full bg-[#6a8575]" /><i className="h-1.5 w-1.5 rounded-full bg-[#52695c]" /><i className="h-1.5 w-1.5 rounded-full bg-[#385042]" /></span>
          <span className="ml-auto rounded-full bg-[#20332a] px-2.5 py-1 text-[10px] font-medium text-[#c0d6c8]">Demonstração</span>
        </div>
        <div className="flex items-center gap-3 py-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#223e30] text-[#a4f4c4]"><preview.Icon size={19} /></span><div><p className="text-sm font-semibold text-[#f1f8f3]">{preview.label}</p><p className="mt-0.5 text-xs text-[#a5baae]">Workspace de exemplo</p></div></div>
        {step === 0 && <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-[#3b5145] bg-[#18251d] px-3 py-2.5 text-xs text-[#d5e6dc]"><Search size={14} /><span>Clínicas odontológicas</span><span className="ml-auto text-[#a5baae]">São Paulo</span></div>
          {['Clínica Aurora', 'Odonto Jardim', 'Clínica Horizonte'].map((name, index) => <div key={name} className="flex items-center gap-2.5 rounded-xl border border-[#2b4034] px-3 py-2.5"><Building2 size={15} className="shrink-0 text-[#9cc6ac]" /><span className="text-xs font-medium text-[#e4f0e8]">{name}</span><span className="ml-auto flex items-center gap-1 whitespace-nowrap rounded-md bg-[#1b3528] px-2 py-1 text-[10px] text-[#a4e8bd]">{index === 1 ? <Check size={11} /> : <Globe2 size={11} />}{index === 1 ? 'Sem site' : 'Com site'}</span></div>)}
        </div>}
        {step === 1 && <div className="space-y-3 rounded-2xl border border-[#365344] bg-[#14241b] p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-[#a4f4c4]"><Sparkles size={14} /> Rascunho sugerido</div>
          <p className="rounded-xl rounded-bl-sm bg-[#253f31] p-3.5 text-sm leading-relaxed text-[#e1f3e8]">Oi, equipe da Clínica Aurora! Posso mostrar uma ideia de página para apresentar seus tratamentos e facilitar o agendamento?</p>
          <span className="inline-flex items-center gap-1.5 text-xs text-[#b5c9bd]"><MessageSquare size={13} /> Pronta para você revisar</span>
        </div>}
        {step === 2 && <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-[#365344] bg-[#14241b] p-3"><p className="text-[11px] text-[#b5c9bd]">Em conversa</p><div className="mt-3 rounded-xl bg-[#233b2e] p-2.5 text-xs text-[#e3f2e8]">Clínica Aurora<span className="mt-1 block text-[10px] text-[#a5c6b3]">Enviou uma resposta</span></div></div>
          <div className="rounded-2xl border border-[#365344] bg-[#14241b] p-3"><p className="text-[11px] text-[#b5c9bd]">Retomar hoje</p><div className="mt-3 rounded-xl bg-[#233b2e] p-2.5 text-xs text-[#e3f2e8]">Odonto Jardim<span className="mt-1 block text-[10px] text-[#a5c6b3]">Retorno combinado</span></div></div>
        </div>}
      </div>
      <div className="mt-8 flex gap-3" aria-live="polite"><ArrowDownRight size={25} className="mt-1 shrink-0 text-[#9ef0bd]" /><div><h2 className="text-[clamp(1.85rem,3vw,2.8rem)] font-semibold leading-[1.02] tracking-[-.05em] text-[#f1f8f3]">{preview.title}</h2><p className="mt-3 max-w-sm text-sm leading-relaxed text-[#b5c9bd]">{preview.copy}</p></div></div>
      <div className="mt-7 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" aria-label="Etapas da demonstração">{previews.map(({ label }, index) => <button key={label} type="button" onClick={() => setStep(index)} aria-label={label} aria-current={step === index ? 'true' : undefined} className="flex h-8 min-w-8 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a4f4c4]"><span className={step === index ? 'h-2 w-7 rounded-full bg-[#a4f4c4]' : 'h-2 w-2 rounded-full bg-[#748b7d]'} /></button>)}</div>
        <div className="flex gap-2"><button type="button" aria-label="Prévia anterior" onClick={() => move(-1)} className="dash-btn-secondary p-2.5"><ChevronLeft size={16} /></button><button type="button" aria-label="Próxima prévia" onClick={() => move(1)} className="dash-btn-secondary p-2.5"><ChevronRight size={16} /></button></div>
      </div>
      <p className="mt-6 flex items-center gap-2 border-t border-[#32463a] pt-4 text-xs text-[#a5baae]"><ArrowUpRight size={14} /> Da lista de empresas ao próximo retorno.</p>
    </div>
  </aside>;
}
