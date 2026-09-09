import { XCircle, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";

export function ComparisonSection() {
  const comparisonRows = [
    {
      feature: "Execução dos Disparos",
      manual: "Exige ficar horas na frente do PC copiando, colando e enviando um por um",
      platform: "100% automatizado em nuvem via fila BullMQ com servidor dedicado",
    },
    {
      feature: "Cadência & Intervalos",
      manual: "Envios manuais irregulares ou rajadas rápidas que chamam a atenção do WhatsApp",
      platform: "Delays aleatórios inteligentes configuráveis (ex: 45s a 120s) simulando ritmo humano",
    },
    {
      feature: "Personalização de Mensagem",
      manual: "Troca manual de nomes e empresas suscetível a erros de digitação e confusão",
      platform: "Variáveis automáticas ({nome}, {empresa}) e Spintax ({Olá|Oi}) em cada envio",
    },
    {
      feature: "Histórico & Prevenção de Erros",
      manual: "Planilhas dispersas com risco alto de abordar o mesmo contato duas vezes",
      platform: "Histórico permanente por Workspace que alerta e previne recontato acidental",
    },
    {
      feature: "Necessidade de Hardware",
      manual: "Seu computador ou telefone precisam ficar ligados e com a tela aberta o tempo todo",
      platform: "Servidor em nuvem 24/7: você pode fechar o navegador e desligar o PC",
    },
    {
      feature: "Acompanhamento em Tempo Real",
      manual: "Sem controle consolidado de quantas mensagens foram enviadas ou falharam",
      platform: "Dashboard ao vivo com métricas de entregas, pendentes e histórico de tentativas",
    },
  ];

  return (
    <section className="py-20 bg-[#0A0C13] border-t border-white/[0.06] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
            Processo Manual vs. Plataforma Automatizada
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Veja a diferença de controle, segurança de envio e produtividade entre abordar contatos manualmente ou utilizar a esteira inteligente.
          </p>
        </div>

        {/* Tabela / Grid Comparativo */}
        <div className="max-w-4xl mx-auto tech-card rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl">
          {/* Header da Tabela */}
          <div className="grid grid-cols-1 md:grid-cols-12 bg-black/50 border-b border-white/[0.08] text-xs font-bold uppercase tracking-wider">
            <div className="md:col-span-4 p-4 text-slate-400 hidden md:block">Aspecto Operacional</div>
            <div className="md:col-span-4 p-4 text-rose-400 bg-rose-500/[0.04] border-x border-white/[0.06] flex items-center gap-1.5">
              <XCircle size={15} />
              <span>Prospecção Manual</span>
            </div>
            <div className="md:col-span-4 p-4 text-purple-300 bg-purple-500/[0.08] flex items-center gap-1.5">
              <CheckCircle2 size={15} className="text-purple-400" />
              <span>Disparador de Mensagens</span>
            </div>
          </div>

          {/* Linhas da Tabela */}
          <div className="divide-y divide-white/[0.06]">
            {comparisonRows.map((row, index) => (
              <div
                key={index}
                className="grid grid-cols-1 md:grid-cols-12 hover:bg-white/[0.015] transition-colors"
              >
                {/* Título do Aspecto */}
                <div className="md:col-span-4 p-4 text-xs font-bold text-slate-200 flex items-center">
                  {row.feature}
                </div>

                {/* Coluna Manual */}
                <div className="md:col-span-4 p-4 text-xs text-slate-400 bg-rose-500/[0.02] md:border-x border-white/[0.06] flex items-start gap-2">
                  <XCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                  <span>{row.manual}</span>
                </div>

                {/* Coluna Plataforma */}
                <div className="md:col-span-4 p-4 text-xs text-slate-200 bg-purple-500/[0.03] flex items-start gap-2 font-medium">
                  <CheckCircle2 size={14} className="text-purple-400 shrink-0 mt-0.5" />
                  <span>{row.platform}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Rodapé da Tabela */}
          <div className="p-4 bg-black/40 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <span className="text-xs text-slate-400">
              Mais reuniões e contatos qualificados com uma fração do esforço manual diário.
            </span>
            <Link
              href="/register"
              className="btn-tech-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0"
            >
              <span>Criar Conta & Começar</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
