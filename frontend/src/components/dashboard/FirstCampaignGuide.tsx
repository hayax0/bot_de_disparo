'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Route } from 'lucide-react';

export function FirstCampaignGuide({ userId, loaded, connected, hasContacts, reviewed, sent, canSearch, onConnect, onSearch, onCreate, onReview }: {
  userId: string; loaded: boolean; connected: boolean; hasContacts: boolean; reviewed: boolean; sent: boolean; canSearch: boolean;
  onConnect: () => void; onSearch: () => void; onCreate: () => void; onReview: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { try { setCollapsed(localStorage.getItem(`abordai:guide:${userId}`) === 'hidden'); } catch {} }, 0); return () => clearTimeout(timer); }, [userId]);
  const toggle = () => { setCollapsed(current => !current); try { localStorage.setItem(`abordai:guide:${userId}`, collapsed ? 'open' : 'hidden'); } catch {} };
  const steps = [
    { title: 'Conecte seu WhatsApp', description: 'Faça o pareamento no painel de conexão.', done: connected, action: onConnect, label: connected ? 'Ver conexão' : 'Conectar' },
    { title: canSearch ? 'Escolha seu público' : 'Adicione seus contatos', description: canSearch ? 'Use as sugestões do perfil, ajuste a região e selecione empresas.' : 'Importe sua lista ao criar uma campanha.', done: hasContacts, action: canSearch ? onSearch : onCreate, label: canSearch ? 'Encontrar empresas' : 'Importar contatos' },
    { title: 'Prepare sua abordagem', description: 'Crie uma campanha e revise o texto de cada contato. IA é opcional.', done: reviewed || sent, action: hasContacts ? onReview : onCreate, label: hasContacts ? 'Revisar mensagens' : 'Criar campanha' },
    { title: 'Confirme o envio', description: 'Escolha os destinatários na revisão e confirme para iniciar.', done: sent, action: onReview, label: sent ? 'Ver campanhas' : 'Revisar e iniciar' },
  ];
  return <section aria-label="Guia da primeira campanha" className="dash-card p-5 sm:p-6 space-y-5">
    <header className="flex justify-between gap-3 items-start"><div className="flex gap-3"><Route size={21} className="text-[var(--studio-accent)] shrink-0 mt-1" /><div><span className="studio-eyebrow">DO PERFIL À PRIMEIRA CONVERSA</span><h2 className="text-lg font-semibold mt-1">Seu caminho para começar.</h2><p className="text-xs text-[var(--studio-muted)] mt-1">{loaded ? 'Avance no seu ritmo. Nenhuma busca ou mensagem é enviada automaticamente.' : 'Sincronizando o progresso da sua conta…'}</p></div></div><button type="button" onClick={toggle} aria-expanded={!collapsed} className="text-xs text-[var(--studio-muted)] whitespace-nowrap">{collapsed ? 'Mostrar guia' : 'Recolher guia'}</button></header>
    {!collapsed && <><ol className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{steps.map((step, index) => <li key={step.title} className="rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-bg)] p-4 flex flex-col items-start gap-3"><span className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs ${loaded && step.done ? 'border-[var(--studio-accent)] text-[var(--studio-accent)]' : 'border-[var(--studio-line)] text-[var(--studio-muted)]'}`}>{loaded && step.done ? <Check size={15} aria-label="Concluído" /> : index + 1}</span><h3 className="text-sm font-semibold">{step.title}</h3><p className="text-xs text-[var(--studio-muted)] leading-relaxed flex-1">{step.description}</p><button type="button" disabled={!loaded} onClick={step.action} className="text-xs text-[var(--studio-accent)] flex gap-2 items-center disabled:opacity-40">{step.label}<ArrowUpRight size={14} /></button></li>)}</ol><p className="text-xs text-[var(--studio-muted)]">Busca: consumo na sua conta do provedor. IA: 1 crédito por mensagem gerada e salva. Revisar e editar manualmente é grátis. Disparos seguem a franquia do seu plano.</p></>}
  </section>;
}
