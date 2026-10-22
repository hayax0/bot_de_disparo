"use client";

const presets = [
  { name: "Abrir conversa", text: "Olá, {nome}! Sou {meuNome}, da {minhaEmpresa}. Quem cuida das parcerias comerciais por aí?" },
  { name: "Pedir permissão", text: "Oi, {nome}! Sou {meuNome}, da {minhaEmpresa}. Posso te apresentar uma ideia para o seu negócio em duas linhas?" },
  { name: "Entender a necessidade", text: "Olá, {nome}! Como vocês buscam novos clientes hoje? Sou {meuNome}, da {minhaEmpresa}, e gostaria de entender se podemos ajudar." },
  { name: "Apresentar serviço", text: "Oi, {nome}! Sou {meuNome}, da {minhaEmpresa}. Trabalhamos com [seu serviço] para [benefício real]. Faz sentido te enviar um exemplo?" },
  { name: "Criação de site", text: "Olá, {nome}! Sou {meuNome}, da {minhaEmpresa}. Criamos sites para apresentar serviços e facilitar o contato com a empresa. Quer ver um exemplo?" },
  { name: "Empresa com site", text: "Oi, {nome}! Sou {meuNome}, da {minhaEmpresa}. Vocês têm interesse em conversar sobre melhorias no site? Posso mostrar como trabalhamos." },
  { name: "Parceria local", text: "Olá, {nome}! Sou {meuNome}, da {minhaEmpresa}. Buscamos parceiros em {bairro} para [proposta de parceria]. Quem seria a pessoa certa para conversar?" },
  { name: "Retomar conversa", text: "Oi, {nome}! Passando para retomar nossa conversa sobre [assunto]. Ainda faz sentido para vocês ou prefere deixar para outro momento?" },
];

export function CopyPresets({ onSelect }: { onSelect: (text: string) => void }) {
  return <div className="space-y-2">
    <label htmlFor="campaign-copy-preset" className="block text-xs text-[var(--studio-muted)]">Comece com uma abordagem curta</label>
    <select id="campaign-copy-preset" defaultValue="" className="dash-input w-full rounded-xl px-3 py-2.5 text-sm"
      onChange={event => { const preset = presets.find(item => item.name === event.target.value); if (preset) onSelect(preset.text); event.target.value = ""; }}>
      <option value="" disabled>Escolher entre 8 modelos gratuitos</option>
      {presets.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
    </select>
    <p className="text-xs text-[var(--studio-muted)]">Adapte o serviço e os trechos entre colchetes antes de enviar. Use a retomada apenas com quem já conversou com você.</p>
  </div>;
}
