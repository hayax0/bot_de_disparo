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
      platform: "Histórico permanente por workspace para consultar contatos e envios anteriores",
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
    <section className="py-24 bg-[#08090D] border-t border-white/[0.06] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-medium">
            <span>Análise Comparativa</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-white tracking-tight">
            Processo Manual vs. Plataforma Automatizada
          </h2>
          <p className="text-sm text-slate-400 font-normal">
            Veja a diferença de controle, cadência de envio e produtividade entre abordar contatos manualmente ou utilizar a esteira inteligente.
          </p>
        </div>

        {/* Tabela / Grid Comparativo */}
        <div className="max-w-4xl mx-auto rounded-2xl border border-white/[0.08] bg-[#0E1017]/80 backdrop-blur-md overflow-hidden">
          {/* Header da Tabela */}
          <div className="grid grid-cols-1 md:grid-cols-12 bg-white/[0.02] border-b border-white/[0.08] text-xs font-semibold uppercase tracking-wider">
            <div className="md:col-span-4 p-4 text-slate-400 hidden md:block">Aspecto Operacional</div>
            <div className="md:col-span-4 p-4 text-slate-400 border-x border-white/[0.06] flex items-center gap-1.5">
              <XCircle size={14} className="text-rose-400" />
              <span>Prospecção Manual</span>
            </div>
            <div className="md:col-span-4 p-4 text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span>Plataforma SaaS</span>
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
                <div className="md:col-span-4 p-4 text-xs font-semibold text-slate-200 flex items-center">
                  {row.feature}
                </div>

                {/* Coluna Manual */}
                <div className="md:col-span-4 p-4 text-xs text-slate-400 md:border-x border-white/[0.06] flex items-start gap-2">
                  <XCircle size={14} className="text-rose-400/80 shrink-0 mt-0.5" />
                  <span>{row.manual}</span>
                </div>

                {/* Coluna Plataforma */}
                <div className="md:col-span-4 p-4 text-xs text-slate-200 flex items-start gap-2 font-medium">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>{row.platform}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Rodapé da Tabela */}
          <div className="p-4 bg-white/[0.01] border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <span className="text-xs text-slate-400">
              Mais reuniões e contatos qualificados com uma fração do esforço operacional diário.
            </span>
            <Link
              href="/register"
              className="landing-btn-primary px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090D] focus-visible:outline-none"
            >
              <span>Criar Conta & Começar</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

