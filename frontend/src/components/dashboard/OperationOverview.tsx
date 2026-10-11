"use client";

import { ArrowUpRight, Layers, Send, Users } from "lucide-react";

type Props = {
  campaigns: number;
  running: number;
  paused: number;
  leads: number;
  sent: number;
  pending: number;
  loaded: boolean;
  loading: boolean;
  connected: boolean;
  canSearch: boolean;
  onSearch: () => void;
  onCreate: () => void;
};

export function OperationOverview(p: Props) {
  const metrics = [
    { label: "Campanhas", value: p.campaigns, description: `${p.running} em execução`, icon: Layers },
    { label: "Contatos", value: p.leads, description: "Nas suas campanhas", icon: Users },
    { label: "Envios realizados", value: p.sent, description: "Inclui entregues, lidos e respondidos", icon: Send },
  ];

  return (
    <section className="operation-grid" aria-label="Resumo da operação">
      <div className="operation-main">
        <div className="operation-heading">
          <span className="studio-eyebrow">SUA OPERAÇÃO</span>
          <span className="operation-live">
            {p.loaded ? "Dados das campanhas" : p.loading ? "Carregando dados…" : "Dados indisponíveis"}
          </span>
        </div>
        <div className="operation-metrics">
          {metrics.map(m => (
            <div key={m.label}>
              <m.icon size={18} strokeWidth={1.5} />
              <span>{m.label}</span>
              <strong>{p.loaded ? m.value.toLocaleString("pt-BR") : "—"}</strong>
              <small>{p.loaded ? m.description : "Aguardando sincronização"}</small>
            </div>
          ))}
        </div>
        <div className="operation-bottom">
          <span>{p.loaded ? `${p.pending.toLocaleString("pt-BR")} contatos aguardando envio` : "Aguardando dados dos contatos"}</span>
          {p.loaded && <span>{p.paused} campanhas pausadas</span>}
        </div>
      </div>
      <div className="operation-next">
        <span className="studio-eyebrow">PRÓXIMO MOVIMENTO</span>
        <h2>{p.campaigns ? "Mantenha as conversas em movimento." : "Sua primeira campanha começa com um contato."}</h2>
        <p>
          {!p.connected
            ? "Conecte seu WhatsApp no painel de conexão para liberar os envios."
            : p.campaigns
              ? "Acompanhe os pendentes ou prepare uma nova abordagem."
              : "Escolha seu público, prepare a mensagem e defina o ritmo."}
        </p>
        <button type="button" onClick={p.canSearch ? p.onSearch : p.onCreate}>
          {p.canSearch ? "Encontrar empresas" : "Criar campanha"}<ArrowUpRight size={18} />
        </button>
      </div>
    </section>
  );
}
