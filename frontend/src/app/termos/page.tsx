import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, FileText, AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Termos de Uso | Disparador de Mensagens",
  description: "Termos e condições gerais de uso da plataforma SaaS de prospecção e disparo de mensagens via WhatsApp.",
};

export default function TermosPage() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-[#050608] text-slate-200 selection:bg-purple-600/30 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-white/[0.08] bg-[#050608]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 group-hover:border-purple-500/50 transition-colors">
              <Image
                src="/logo.png"
                alt="Logo Disparador"
                width={32}
                height={32}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-bold text-white text-sm tracking-tight">
              Disparador de Mensagens
            </span>
          </Link>

          <Link
            href="/"
            className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Voltar ao Início</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
        <div className="space-y-4 mb-10 pb-8 border-b border-white/[0.08]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full badge-purple text-xs font-semibold">
            <FileText size={13} />
            <span>Documento Legal Oficial</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Termos de Uso e Condições de Serviço
          </h1>
          <p className="text-sm text-slate-400">
            Última atualização: Março de {currentYear} • Versão 1.0
          </p>
        </div>

        {/* Disclaimer de Destaque sobre o WhatsApp */}
        <div className="rounded-2xl p-6 bg-amber-500/10 border border-amber-500/30 mb-10 space-y-3">
          <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm">
            <AlertTriangle size={18} />
            <span>Aviso Fundamental sobre o WhatsApp e Bloqueios</span>
          </div>
          <p className="text-xs sm:text-sm text-amber-200/90 leading-relaxed">
            O WhatsApp® é uma marca registrada da Meta Platforms, Inc. Esta plataforma é uma ferramenta independente de automação e produtividade operacional e <strong>não possui nenhum vínculo societário, patrocínio ou afiliação oficial com a Meta</strong>.
          </p>
          <p className="text-xs sm:text-sm text-amber-200/90 leading-relaxed">
            <strong>Não prometemos nem garantimos imunidade contra restrições ou banimentos.</strong> A decisão sobre a suspensão ou bloqueio de qualquer conta ou chip de WhatsApp cabe exclusiva e soberanamente à Meta Platforms, Inc. O usuário é o único e integral responsável pela aquisição, maturação, configuração e uso ético de seus números.
          </p>
        </div>

        {/* Artigos dos Termos */}
        <div className="space-y-10 text-sm leading-relaxed text-slate-300">
          {/* Seção 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">1.</span> Objeto do Serviço
            </h2>
            <p>
              A plataforma disponibiliza um sistema SaaS (Software as a Service) para gestão operacional de prospecção, organização de listas de contatos (leads), parametrização de intervalos de tempo (delays), personalização contextual de mensagens com recurso de spintax e automação técnica de disparos.
            </p>
            <p>
              O serviço fornecido consiste estritamente nas ferramentas tecnológicas disponibilizadas no software. A plataforma não comercializa números de telefone, não fornece chips e não garante resultados comerciais ou respostas de destinatários.
            </p>
          </section>

          {/* Seção 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">2.</span> Uso Responsável do WhatsApp e Isenção de Responsabilidade
            </h2>
            <p>
              Ao utilizar a plataforma, o Usuário declara estar ciente e concordar expressamente com os seguintes preceitos:
            </p>
            <ul className="space-y-2 list-disc list-inside pl-2 text-slate-300">
              <li>
                <strong className="text-white">Autonomia da Meta:</strong> A Meta Platforms, Inc. possui termos próprios e mecanismos automatizados de monitoramento de comportamento. A plataforma não interfere nem possui controle sobre essas avaliações.
              </li>
              <li>
                <strong className="text-white">Ausência de Garantia &quot;Anti-Ban&quot;:</strong> Embora a plataforma ofereça recursos técnicos recomendados (como variações de spintax, pausas aleatórias por lote e cadência humanizada), esses mecanismos são instrumentos de mitigação de risco e <strong>não constituem garantia absoluta ou imunidade contra banimento</strong>.
              </li>
              <li>
                <strong className="text-white">Gestão dos Números:</strong> O Usuário é o único responsável pela compra de seus chips, pelo processo de aquecimento (&quot;maturação&quot;) dos aparelhos e pelas decisões operacionais de volume e velocidade de envio.
              </li>
              <li>
                <strong className="text-white">Isenção de Indenização:</strong> Eventual bloqueio, restrição de uso ou banimento de número aplicado pela Meta <strong>não gera direito a reembolso, compensação financeira ou indenização</strong> pela plataforma.
              </li>
            </ul>
          </section>

          {/* Seção 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">3.</span> Responsabilidade sobre Conteúdo e Legitimidade de Contatos
            </h2>
            <p>
              O Usuário é integral e exclusivamente responsável por todas as mensagens elaboradas, importadas e enviadas por meio de sua conta, bem como pela legitimidade jurídica da base de leads utilizada:
            </p>
            <ul className="space-y-2 list-disc list-inside pl-2 text-slate-300">
              <li>
                <strong className="text-white">Práticas Terminantemente Proibidas:</strong> É vedado o uso da plataforma para disseminar mensagens fraudulentas, golpes financeiros, pirâmides, esquemas de enriquecimento rápido, pornografia, assédio, ódio, discriminação, venda de produtos ilegais ou qualquer modalidade de spam abusivo e massivo sem consentimento ou pertinência de contato.
              </li>
              <li>
                <strong className="text-white">Legitimidade dos Dados:</strong> O Usuário declara possuir autorização, base legal ou legítimo interesse compatível com a Lei Geral de Proteção de Dados (LGPD) para contatar os destinatários incluídos em suas campanhas.
              </li>
              <li>
                <strong className="text-white">Direito de Rescisão:</strong> A plataforma reserva-se o direito de suspender ou encerrar imediatamente o acesso de qualquer conta flagrada violando estas diretrizes, sem prejuízo da comunicação às autoridades competentes.
              </li>
            </ul>
          </section>

          {/* Seção 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">4.</span> Planos, Assinaturas e Acesso ao Sistema
            </h2>
            <p>
              O acesso às funcionalidades produtivas da plataforma (criação de campanhas, conexão de instâncias de WhatsApp, importação de leads e processamento de disparos) é condicionado à manutenção de uma assinatura ativa e regular.
            </p>
            <ul className="space-y-2 list-disc list-inside pl-2 text-slate-300">
              <li>
                <strong className="text-white">Validação pelo Servidor:</strong> A validação da assinatura é executada diretamente pelo servidor e pelo motor de filas em cada operação e antes do envio de cada mensagem.
              </li>
              <li>
                <strong className="text-white">Expiração ou Inadimplência:</strong> Caso a assinatura expire ou fique inadimplente, novas ações e campanhas em andamento serão automaticamente pausadas pelo sistema para preservar a integridade da conta e dos dados, permanecendo o histórico disponível para consulta conforme a modalidade contratada.
              </li>
              <li>
                <strong className="text-white">Cancelamento:</strong> O cancelamento da assinatura pode ser solicitado a qualquer momento pelo canal oficial de pagamento, garantindo acesso às funcionalidades até o encerramento do período já faturado.
              </li>
            </ul>
          </section>

          {/* Seção 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">5.</span> Limitação de Responsabilidade
            </h2>
            <p>
              Nos limites autorizados pela legislação brasileira, a plataforma não responderá por lucros cessantes, perdas de oportunidade negocial, instabilidade temporária de servidores de terceiros ou indisponibilidades do serviço do WhatsApp decorrentes de atualizações promovidas pela Meta.
            </p>
          </section>

          {/* Seção 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">6.</span> Foro e Legislação Aplicável
            </h2>
            <p>
              Estes Termos de Uso são regidos pelas leis vigentes na República Federativa do Brasil, em especial pelo Marco Civil da Internet (Lei nº 12.965/2014) e pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
            </p>
          </section>

          {/* Seção 7 */}
          <section className="space-y-3 pt-4 border-t border-white/[0.08]">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">7.</span> Canal de Atendimento e Suporte
            </h2>
            <p>
              Para esclarecimentos, dúvidas operacionais ou reporte de condutas irregulares, entre em contato com nossa equipe através do e-mail oficial:
            </p>
            <p className="font-semibold text-purple-400">
              suporte@cmpx.tec.br
            </p>
          </section>
        </div>
      </main>

      {/* Footer Legal */}
      <footer className="border-t border-white/[0.08] py-8 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {currentYear} Disparador de Mensagens. Todos os direitos reservados.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacidade" className="hover:text-white transition-colors">
              Política de Privacidade (LGPD)
            </Link>
            <Link href="/login" className="hover:text-white transition-colors">
              Área do Cliente
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
