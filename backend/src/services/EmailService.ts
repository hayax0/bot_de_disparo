import { Resend } from 'resend';
import { ENV } from '../config/env';

interface EmailSendResult {
  success: boolean;
  id?: string | undefined;
  error?: string | undefined;
}

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!ENV.RESEND_API_KEY) {
    console.warn('[EMAIL SERVICE WARN] RESEND_API_KEY não configurada. E-mails transacionais não serão despachados.');
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(ENV.RESEND_API_KEY);
  }
  return resendClient;
}

function formatDatePtBr(date: Date | string | null | undefined): string {
  if (!date) return 'Data não disponível';
  try {
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo'
    });
  } catch {
    return String(date);
  }
}

function getBaseEmailTemplate(contentHtml: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Disparador • Prospector SaaS</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #080c14;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #080c14;
      padding: 40px 10px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #111827;
      border: 1px solid rgba(168, 85, 247, 0.2);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(168, 85, 247, 0.08);
    }
    .header {
      padding: 30px 24px;
      background: linear-gradient(180deg, rgba(168, 85, 247, 0.12) 0%, rgba(17, 24, 39, 0) 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      text-align: center;
    }
    .content {
      padding: 32px 28px;
      font-size: 15px;
      line-height: 1.65;
      color: #cbd5e1;
    }
    .content h2 {
      font-size: 21px;
      font-weight: 700;
      color: #ffffff;
      margin-top: 0;
      margin-bottom: 16px;
      letter-spacing: -0.3px;
    }
    .highlight-box {
      background-color: #0b1120;
      border-left: 4px solid #a855f7;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      border-right: 1px solid rgba(255, 255, 255, 0.04);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      padding: 18px;
      border-radius: 10px;
      margin: 22px 0;
      font-size: 14px;
    }
    .feature-card {
      background-color: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 12px;
    }
    .feature-title {
      font-weight: 700;
      color: #f1f5f9;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .feature-desc {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
      margin: 0;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0 20px 0;
    }
    .btn {
      display: inline-block;
      padding: 16px 36px;
      background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      border-radius: 12px;
      box-shadow: 0 6px 20px rgba(168, 85, 247, 0.45);
      letter-spacing: 0.3px;
    }
    .footer {
      padding: 24px 28px;
      background-color: #0b0f19;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      text-align: center;
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }
    .footer a {
      color: #a855f7;
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${previewText}
  </div>
  <table class="wrapper" role="presentation" border="0" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table class="container" role="presentation" border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td class="header">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td style="vertical-align: middle; padding-right: 14px;">
                    <img src="${ENV.PLATFORM_URL}/logo.png" alt="Disparador" width="42" height="42" style="display: block; border-radius: 12px; border: 1px solid rgba(168, 85, 247, 0.4); box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3);" />
                  </td>
                  <td style="vertical-align: middle; text-align: left;">
                    <div style="font-size: 21px; font-weight: 800; color: #ffffff; line-height: 1.1; letter-spacing: -0.4px;">Disparador</div>
                    <div style="font-size: 10px; font-weight: 700; color: #c084fc; letter-spacing: 1.6px; font-family: monospace; margin-top: 3px;">PROSPECTOR SAAS</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="content">
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td class="footer">
              <p style="margin: 0 0 6px 0;"><strong>Disparador</strong> • Prospector SaaS</p>
              <p style="margin: 0 0 8px 0; font-size: 11px; color: #475569;">Desenvolvido por CMPX Tecnologia. Todos os direitos reservados.</p>
              <p style="margin: 0;">Precisa de suporte? Fale com nossa equipe: <a href="mailto:${ENV.RESEND_REPLY_TO}">${ENV.RESEND_REPLY_TO}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export class EmailService {
  /**
   * Envia o e-mail de Convite para Assinatura imediatamente após o cadastro na plataforma
   */
  static async sendRegistrationInvitationEmail(params: {
    email: string;
    name?: string | null;
    checkoutUrl?: string;
  }): Promise<EmailSendResult> {
    const { email, name, checkoutUrl } = params;
    const client = getResendClient();
    if (!client) {
      return { success: false, error: 'RESEND_API_KEY não configurada' };
    }

    const cleanName = name ? String(name).trim() : 'Parceiro';
    const targetCheckout = checkoutUrl || ENV.CAKTO_CHECKOUT_URL;

    const htmlContent = `
      <h2>Sua conta foi criada no Disparador! 🚀</h2>
      <p>Olá, <strong>${cleanName}</strong>!</p>
      <p>Parabéns pelo seu cadastro. Sua conta na plataforma <strong>Disparador</strong> está pronta para ser ativada.</p>
      
      <p>O <strong>Disparador (Prospector SaaS)</strong> foi desenvolvido para transformar o seu WhatsApp em uma máquina de prospecção e vendas automatizada, gerando novos leads e oportunidades todos os dias no piloto automático.</p>

      <div style="margin: 24px 0 20px 0;">
        <div class="feature-card">
          <div class="feature-title">⚡ Disparos em Massa Humanizados</div>
          <p class="feature-desc">Envie mensagens com inteligência anti-bloqueio, spintax dinâmico e intervalos seguros para proteger seu número.</p>
        </div>
        <div class="feature-card">
          <div class="feature-title">📱 Conexão Instantânea via QR Code</div>
          <p class="feature-desc">Conecte qualquer número de WhatsApp em menos de 10 segundos direto no painel web, sem complicações.</p>
        </div>
        <div class="feature-card">
          <div class="feature-title">🎯 Segmentação & Extração de Leads</div>
          <p class="feature-desc">Suba listas do Google Maps ou planilhas e personalize nome, nicho e endereço de cada contato automaticamente.</p>
        </div>
        <div class="feature-card">
          <div class="feature-title">📊 Relatórios em Tempo Real</div>
          <p class="feature-desc">Monitore envios, respostas e taxa de sucesso dos seus disparos através de um dashboard intuitivo.</p>
        </div>
      </div>

      <div class="highlight-box">
        <p style="margin: 0 0 8px 0; color: #ffffff; font-weight: 700;">🔓 Próximo passo para começar a prospectar:</p>
        <p style="margin: 0; color: #cbd5e1;">Para liberar todas as ferramentas e iniciar suas campanhas imediatamente, clique no botão abaixo e ative sua assinatura na Cakto:</p>
      </div>

      <div class="btn-container">
        <a href="${targetCheckout}" class="btn" target="_blank">ATIVAR MEU ACESSO AGORA 🚀</a>
      </div>

      <p style="font-size: 13px; color: #94a3b8; text-align: center; margin-top: 14px;">
        ⚡ <strong>Liberação Automática:</strong> Assim que a assinatura for confirmada, seu acesso ao painel é liberado na hora!
      </p>
    `;

    const fullHtml = getBaseEmailTemplate(
      htmlContent,
      'Sua conta foi criada! Ative sua assinatura no Disparador para liberar seus disparos automáticos no WhatsApp.'
    );

    try {
      const response = await client.emails.send({
        from: ENV.RESEND_FROM_EMAIL,
        replyTo: ENV.RESEND_REPLY_TO,
        to: [email],
        subject: 'Conta criada no Disparador! Ative seu acesso para começar 🚀',
        html: fullHtml,
      });

      if (response.error) {
        console.warn(`[EMAIL RESEND ERROR] Falha ao enviar Convite de Cadastro para ${email}:`, response.error.message);
        return { success: false, error: response.error.message };
      }

      console.log(`[EMAIL RESEND SUCCESS] Convite de Cadastro enviado com sucesso para ${email} (ID: ${response.data?.id})`);
      return { success: true, id: response.data?.id };
    } catch (err: any) {
      console.error(`[EMAIL RESEND EXCEPTION] Erro ao enviar Convite de Cadastro para ${email}:`, err.message || err);
      return { success: false, error: err.message || String(err) };
    }
  }

  /**
   * Envia o e-mail de Boas-vindas / Confirmação de Acesso
   */
  static async sendWelcomeEmail(params: {
    email: string;
    name?: string | null;
    expiresAt?: Date | null;
  }): Promise<EmailSendResult> {
    const { email, name, expiresAt } = params;
    const client = getResendClient();
    if (!client) {
      return { success: false, error: 'RESEND_API_KEY não configurada' };
    }

    const cleanName = name ? String(name).trim() : 'Cliente';
    const expiresFormatted = formatDatePtBr(expiresAt);
    const loginUrl = `${ENV.PLATFORM_URL}/login`;

    const htmlContent = `
      <h2>Bem-vindo ao Disparador! Seu acesso está liberado 🚀</h2>
      <p>Olá, <strong>${cleanName}</strong>!</p>
      <p>Seu pagamento foi confirmado com sucesso e seu acesso à plataforma <strong>Disparador (Prospector SaaS)</strong> já está 100% disponível.</p>
      
      <div class="highlight-box">
        <p style="margin: 0 0 8px 0;"><strong>Status da Assinatura:</strong> Ativa</p>
        <p style="margin: 0;"><strong>Próxima Renovação / Validade:</strong> ${expiresFormatted}</p>
      </div>

      <p>Agora você já pode se conectar e começar a criar suas campanhas automatizadas de prospecção e disparo pelo WhatsApp.</p>

      <div class="btn-container">
        <a href="${loginUrl}" class="btn" target="_blank">ACESSAR O DISPARADOR</a>
      </div>

      <p style="font-size: 13px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px;">
        💡 <strong>Primeiro acesso?</strong> Caso ainda não tenha cadastrado sua senha de login, basta clicar no botão acima, selecionar a aba <em>"Cadastre-se"</em> com este mesmo e-mail (<strong>${email}</strong>) e definir sua senha pessoal.
      </p>
    `;

    const fullHtml = getBaseEmailTemplate(
      htmlContent,
      'Seu pagamento foi confirmado com sucesso e seu acesso ao Disparador está liberado!'
    );

    try {
      const response = await client.emails.send({
        from: ENV.RESEND_FROM_EMAIL,
        replyTo: ENV.RESEND_REPLY_TO,
        to: [email],
        subject: 'Bem-vindo ao Disparador! Seu acesso está liberado 🚀',
        html: fullHtml,
      });

      if (response.error) {
        console.warn(`[EMAIL RESEND ERROR] Falha ao enviar Welcome Email para ${email}:`, response.error.message);
        return { success: false, error: response.error.message };
      }

      console.log(`[EMAIL RESEND SUCCESS] Welcome Email enviado com sucesso para ${email} (ID: ${response.data?.id})`);
      return { success: true, id: response.data?.id };
    } catch (err: any) {
      console.error(`[EMAIL RESEND EXCEPTION] Erro de conexão ao enviar Welcome Email para ${email}:`, err.message || err);
      return { success: false, error: err.message || String(err) };
    }
  }

  /**
   * Envia os avisos de proximidade de vencimento (5 dias ou 1 dia)
   */
  static async sendExpirationReminderEmail(params: {
    email: string;
    name?: string | null;
    expiresAt: Date;
    daysRemaining: 5 | 1;
  }): Promise<EmailSendResult> {
    const { email, name, expiresAt, daysRemaining } = params;
    const client = getResendClient();
    if (!client) {
      return { success: false, error: 'RESEND_API_KEY não configurada' };
    }

    const cleanName = name ? String(name).trim() : 'Cliente';
    const expiresFormatted = formatDatePtBr(expiresAt);
    const platformUrl = ENV.PLATFORM_URL;

    const isFiveDays = daysRemaining === 5;
    const subject = isFiveDays
      ? 'Sua assinatura do Disparador vence em 5 dias'
      : 'Sua assinatura do Disparador vence amanhã';

    const messageIntro = isFiveDays
      ? 'Passando para avisar que sua assinatura do <strong>Disparador</strong> está próxima da renovação (restam 5 dias).'
      : `Sua assinatura do <strong>Disparador</strong> está prevista para renovar amanhã, <strong>${expiresFormatted}</strong>.`;

    const paymentAdvice = isFiveDays
      ? 'Se sua assinatura possui renovação automática, verifique se seu meio de pagamento continua válido para que suas campanhas de prospecção continuem rodando sem interrupções.'
      : 'Para continuar utilizando a ferramenta sem interrupções, verifique se sua forma de pagamento está funcionando corretamente.';

    const htmlContent = `
      <h2>${subject}</h2>
      <p>Olá, <strong>${cleanName}</strong>!</p>
      <p>${messageIntro}</p>

      <div class="highlight-box">
        <p style="margin: 0 0 6px 0;"><strong>Data Prevista da Renovação:</strong> ${expiresFormatted}</p>
        <p style="margin: 0;">${paymentAdvice}</p>
      </div>

      <p>Mantenha sua assinatura ativa para continuar prospectando no WhatsApp com inteligência e previsibilidade.</p>

      <div class="btn-container">
        <a href="${platformUrl}" class="btn" target="_blank">ACESSAR O DISPARADOR</a>
      </div>

      <p style="margin-top: 24px;">Atenciosamente,<br><strong>Equipe Disparador</strong></p>
    `;

    const fullHtml = getBaseEmailTemplate(htmlContent, subject);

    try {
      const response = await client.emails.send({
        from: ENV.RESEND_FROM_EMAIL,
        replyTo: ENV.RESEND_REPLY_TO,
        to: [email],
        subject,
        html: fullHtml,
      });

      if (response.error) {
        console.warn(`[EMAIL RESEND ERROR] Falha no lembrete de ${daysRemaining} dias para ${email}:`, response.error.message);
        return { success: false, error: response.error.message };
      }

      console.log(`[EMAIL RESEND SUCCESS] Lembrete de ${daysRemaining} dias enviado para ${email} (ID: ${response.data?.id})`);
      return { success: true, id: response.data?.id };
    } catch (err: any) {
      console.error(`[EMAIL RESEND EXCEPTION] Erro ao enviar lembrete de ${daysRemaining} dias para ${email}:`, err.message || err);
      return { success: false, error: err.message || String(err) };
    }
  }

  /**
   * Envia confirmação de renovação aprovada
   */
  static async sendSubscriptionRenewedEmail(params: {
    email: string;
    name?: string | null;
    expiresAt: Date;
  }): Promise<EmailSendResult> {
    const { email, name, expiresAt } = params;
    const client = getResendClient();
    if (!client) return { success: false, error: 'RESEND_API_KEY não configurada' };

    const cleanName = name ? String(name).trim() : 'Cliente';
    const expiresFormatted = formatDatePtBr(expiresAt);

    const htmlContent = `
      <h2>Sua assinatura foi renovada com sucesso! 🎉</h2>
      <p>Olá, <strong>${cleanName}</strong>!</p>
      <p>Confirmamos a renovação da sua assinatura do <strong>Disparador</strong>.</p>
      <div class="highlight-box">
        <p style="margin: 0;"><strong>Nova Validade do Acesso:</strong> ${expiresFormatted}</p>
      </div>
      <div class="btn-container">
        <a href="${ENV.PLATFORM_URL}" class="btn" target="_blank">ACESSAR O PAINEL</a>
      </div>
    `;

    try {
      const response = await client.emails.send({
        from: ENV.RESEND_FROM_EMAIL,
        replyTo: ENV.RESEND_REPLY_TO,
        to: [email],
        subject: 'Assinatura do Disparador renovada com sucesso! 🎉',
        html: getBaseEmailTemplate(htmlContent, 'Sua assinatura foi renovada com sucesso!'),
      });
      return { success: !response.error, id: response.data?.id, error: response.error?.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Envia notificação de cancelamento registrado (acesso preservado até o fim do período)
   */
  static async sendSubscriptionCanceledEmail(params: {
    email: string;
    name?: string | null;
    expiresAt: Date | null;
  }): Promise<EmailSendResult> {
    const { email, name, expiresAt } = params;
    const client = getResendClient();
    if (!client) return { success: false, error: 'RESEND_API_KEY não configurada' };

    const cleanName = name ? String(name).trim() : 'Cliente';
    const expiresFormatted = formatDatePtBr(expiresAt);

    const htmlContent = `
      <h2>Cancelamento de Renovação Confirmado</h2>
      <p>Olá, <strong>${cleanName}</strong>,</p>
      <p>Confirmamos o cancelamento da renovação automática da sua assinatura do <strong>Disparador</strong>.</p>
      <div class="highlight-box">
        <p style="margin: 0;">Você continuará com acesso total à plataforma até <strong>${expiresFormatted}</strong>. Nenhuma nova cobrança será realizada.</p>
      </div>
      <p>Caso queira reativar seu plano a qualquer momento, nossa equipe estará à disposição.</p>
    `;

    try {
      const response = await client.emails.send({
        from: ENV.RESEND_FROM_EMAIL,
        replyTo: ENV.RESEND_REPLY_TO,
        to: [email],
        subject: 'Confirmação de cancelamento da assinatura Disparador',
        html: getBaseEmailTemplate(htmlContent, 'Sua renovação foi cancelada. Acesso disponível até o fim do período.'),
      });
      return { success: !response.error, id: response.data?.id, error: response.error?.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Envia notificação de falha no pagamento da renovação
   */
  static async sendPaymentFailedEmail(params: {
    email: string;
    name?: string | null;
  }): Promise<EmailSendResult> {
    const { email, name } = params;
    const client = getResendClient();
    if (!client) return { success: false, error: 'RESEND_API_KEY não configurada' };

    const cleanName = name ? String(name).trim() : 'Cliente';

    const htmlContent = `
      <h2>Atenção: Falha no pagamento da sua assinatura Disparador</h2>
      <p>Olá, <strong>${cleanName}</strong>,</p>
      <p>Houve uma falha ao processar o pagamento da renovação da sua assinatura na Cakto.</p>
      <div class="highlight-box">
        <p style="margin: 0;">Para evitar a interrupção das suas campanhas, por favor verifique o limite do seu cartão ou atualize seus dados de pagamento.</p>
      </div>
      <div class="btn-container">
        <a href="${ENV.PLATFORM_URL}" class="btn" target="_blank">REGULARIZAR ACESSO</a>
      </div>
    `;

    try {
      const response = await client.emails.send({
        from: ENV.RESEND_FROM_EMAIL,
        replyTo: ENV.RESEND_REPLY_TO,
        to: [email],
        subject: 'Atenção: Falha no pagamento da sua assinatura Disparador',
        html: getBaseEmailTemplate(htmlContent, 'Identificamos uma falha no pagamento da sua assinatura.'),
      });
      return { success: !response.error, id: response.data?.id, error: response.error?.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

