const steps = [
  { title: "Busque empresas", text: "Escolha o segmento e a região. A busca usa sua conta Apify, conectada à plataforma." },
  { title: "Prepare a abordagem", text: "Escreva sua mensagem ou peça ajuda à IA. Revise e escolha os contatos da campanha." },
  { title: "Acompanhe os envios", text: "Conecte o WhatsApp por QR Code, defina os intervalos e acompanhe o andamento no painel." },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-16 sm:py-20 border-t border-white/[0.06] scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Da busca à conversa, em três passos.</h2>
        <div className="grid md:grid-cols-3 gap-10 mt-10">
          {steps.map((step, i) => <div key={step.title}><span className="text-emerald-400 text-sm font-mono">0{i + 1}</span><h3 className="text-lg font-medium mt-4">{step.title}</h3><p className="text-sm leading-relaxed text-slate-400 mt-3 max-w-sm">{step.text}</p></div>)}
        </div>
      </div>
    </section>
  );
}
