import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ShieldCheck, Lock, Database, UserCheck, Mail } from "lucide-react";

export const metadata = {
  title: "Política de Privacidade e Proteção de Dados (LGPD) | Disparador de Mensagens",
  description: "Entenda como a plataforma trata seus dados pessoais e dados de leads em estrita conformidade com a LGPD (Lei nº 13.709/2018).",
};

export default function PrivacidadePage() {
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
            <ShieldCheck size={13} />
            <span>Conformidade com a Lei nº 13.709/2018 (LGPD)</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Política de Privacidade e Proteção de Dados
          </h1>
          <p className="text-sm text-slate-400">
            Última atualização: Março de {currentYear} • Versão 1.0
          </p>
        </div>

        {/* Resumo da Governança de Dados */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="tech-card rounded-xl p-4 border border-white/[0.08] space-y-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <UserCheck size={18} />
            </div>
            <h2 className="font-bold text-white text-sm">Papéis Claros</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Você é o <strong>Controlador</strong> dos seus leads. Nós atuamos como <strong>Operadores</strong> das automações técnicas.
            </p>
          </div>

          <div className="tech-card rounded-xl p-4 border border-white/[0.08] space-y-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Lock size={18} />
            </div>
            <h2 className="font-bold text-white text-sm">Segurança Ativa</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Senhas criptografadas com bcrypt, conexões TLS/HTTPS e isolamento estrito entre workspaces.
            </p>
          </div>

          <div className="tech-card rounded-xl p-4 border border-white/[0.08] space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Database size={18} />
            </div>
            <h2 className="font-bold text-white text-sm">Seus Direitos</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Acesso, correção, portabilidade e exclusão de dados garantidos conforme o Art. 18 da LGPD.
            </p>
          </div>
        </div>

        {/* Artigos da Política */}
        <div className="space-y-10 text-sm leading-relaxed text-slate-300">
          {/* Seção 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">1.</span> Dados Pessoais Coletados e Tratados
            </h2>
            <p>
              Tratamos exclusivamente as categorias de dados estritamente necessárias para a prestação dos serviços contratados:
            </p>
            <ul className="space-y-2 list-disc list-inside pl-2 text-slate-300">
              <li>
                <strong className="text-white">Dados Cadastrais do Usuário:</strong> Nome, endereço de e-mail e credenciais de acesso protegidas por algoritmo irreversível de hash (<code className="text-xs bg-white/[0.06] px-1.5 py-0.5 rounded text-purple-300">bcrypt</code>).
              </li>
              <li>
                <strong className="text-white">Dados de Faturamento e Assinatura:</strong> Identificador de cliente no gateway oficial de pagamentos, status da assinatura (ACTIVE, PAST_DUE, CANCELED), ciclo de faturamento e datas de renovação/expiração. Os dados de cartão de crédito não são armazenados em nossos servidores, sendo processados diretamente pelo gateway certificado PCI-DSS.
              </li>
              <li>
                <strong className="text-white">Dados de Leads Inseridos pelo Usuário:</strong> Números de telefone, nomes de empresas, websites e bairros que o Usuário faz upload para realização de suas campanhas.
              </li>
              <li>
                <strong className="text-white">Registros Técnicos e de Segurança:</strong> Endereço IP de acesso, data e hora de login, registros de requisições às APIs para prevenção de fraudes e cumprimento do Marco Civil da Internet (Lei nº 12.965/2014).
              </li>
            </ul>
            <p className="text-xs text-slate-400">
              * A plataforma não coleta nem trata dados pessoais sensíveis (como dados de saúde, convicções religiosas ou dados biométricos).
            </p>
          </section>

          {/* Seção 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">2.</span> Distinção dos Papéis sob a LGPD: Controlador vs. Operador
            </h2>
            <p>
              Em conformidade com as diretrizes da Autoridade Nacional de Proteção de Dados (ANPD) e a Lei Geral de Proteção de Dados (Lei nº 13.709/2018):
            </p>
            <div className="rounded-xl p-5 bg-white/[0.03] border border-white/[0.08] space-y-4">
              <div>
                <h3 className="text-white font-bold text-sm">O Usuário como CONTROLADOR dos Leads:</h3>
                <p className="text-xs text-slate-300 mt-1">
                  O Usuário é o único responsável pela origem, obtenção legal, base legal aplicável (como legítimo interesse ou consentimento prévio) e decisão de envio de mensagens para os números cadastrados em sua conta.
                </p>
              </div>
              <div className="border-t border-white/[0.06] pt-3">
                <h3 className="text-white font-bold text-sm">A Plataforma como OPERADORA Técnica:</h3>
                <p className="text-xs text-slate-300 mt-1">
                  A plataforma atua estritamente como agente técnico terceirizado, processando a fila de mensagens e efetuando os disparos em segundo plano conforme as configurações parametrizadas pelo Usuário, sem utilizar os leads para finalidades comerciais próprias.
                </p>
              </div>
            </div>
          </section>

          {/* Seção 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">3.</span> Finalidades do Tratamento
            </h2>
            <p>Os dados coletados são tratados para as seguintes finalidades legítimas:</p>
            <ul className="space-y-1.5 list-disc list-inside pl-2 text-slate-300">
              <li>Criar, autenticar e gerenciar o workspace do usuário;</li>
              <li>Validar a regularidade da assinatura antes do processamento de campanhas;</li>
              <li>Executar tecnicamente a fila de disparos de mensagens solicitada pelo cliente;</li>
              <li>Enviar comunicações transacionais essenciais (como avisos de vencimento de plano e recuperação de acesso);</li>
              <li>Garantir a segurança dos sistemas, prevenir abusos, ataques DDoS e tentativas de invasão;</li>
              <li>Atender a requisições judiciais ou determinações de autoridades competentes.</li>
            </ul>
          </section>

          {/* Seção 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">4.</span> Compartilhamento de Dados com Terceiros
            </h2>
            <p>
              Não comercializamos, alugamos nem repassamos dados de usuários ou de leads para terceiros. O compartilhamento ocorre exclusivamente com prestadores de infraestrutura essenciais para a operação da plataforma:
            </p>
            <ul className="space-y-1.5 list-disc list-inside pl-2 text-slate-300">
              <li>
                <strong className="text-white">Processamento de Pagamentos:</strong> Gateway de pagamentos homologado e certificado PCI-DSS (para liquidação de assinaturas e gestão de cobrança);
              </li>
              <li>
                <strong className="text-white">Disparo de E-mails Transacionais:</strong> Resend (exclusivamente para confirmações e notificações de conta);
              </li>
              <li>
                <strong className="text-white">Servidores em Nuvem:</strong> Servidores dedicados protegidos por firewall, com banco de dados PostgreSQL isolado.
              </li>
            </ul>
          </section>

          {/* Seção 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">5.</span> Direitos do Titular dos Dados (Art. 18 da LGPD)
            </h2>
            <p>
              Você, como titular de seus dados cadastrais, possui os seguintes direitos garantidos por lei:
            </p>
            <ul className="space-y-1.5 list-disc list-inside pl-2 text-slate-300">
              <li>Confirmação da existência de tratamento e acesso aos dados;</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;</li>
              <li>Revogação do consentimento, quando esta for a base legal aplicada;</li>
              <li>Eliminação dos dados pessoais tratados mediante consentimento, respeitados os prazos legais de guarda.</li>
            </ul>
            <p className="text-xs text-slate-400 mt-2">
              * Caso você seja um lead (destinatário de mensagem) e deseje exercer seus direitos em relação a uma campanha específica, solicitamos que entre em contato diretamente com a empresa que originou o contato (Controladora), ou nos envie o número para inclusão na lista de bloqueio de envios.
            </p>
          </section>

          {/* Seção 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">6.</span> Retenção e Descarte de Informações
            </h2>
            <p>
              Os dados dos usuários são mantidos enquanto o cadastro estiver ativo na plataforma. Após o encerramento da conta, os dados poderão ser conservados pelo período determinado por lei (como registros de conexão por 6 meses conforme o Art. 15 do Marco Civil da Internet) ou para defesa em processos administrativos e judiciais.
            </p>
          </section>

          {/* Seção 7 */}
          <section className="space-y-3 pt-4 border-t border-white/[0.08]">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">7.</span> Canal de Privacidade e Encarregado de Dados (DPO)
            </h2>
            <p>
              Para solicitações sobre a LGPD, dúvidas sobre esta política ou requisições de titulares, nosso canal oficial de comunicação é:
            </p>
            <div className="flex items-center gap-2 text-purple-400 font-semibold">
              <Mail size={16} />
              <span>suporte@cmpx.tec.br</span>
            </div>
            <p className="text-xs text-slate-500">
              Prazo de resposta conforme as diretrizes regulamentares da ANPD.
            </p>
          </section>
        </div>
      </main>

      {/* Footer Legal */}
      <footer className="border-t border-white/[0.08] py-8 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {currentYear} Disparador de Mensagens. Todos os direitos reservados.</p>
          <div className="flex items-center gap-6">
            <Link href="/termos" className="hover:text-white transition-colors">
              Termos de Uso
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
