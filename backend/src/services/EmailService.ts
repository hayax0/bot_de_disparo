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
  <title>CMPX Bot Disparo</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #0b0f19;
      padding: 40px 10px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #131b2e;
      border: 1px solid #1e293b;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    }
    .header {
      padding: 32px 32px 24px 32px;
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.1) 100%);
      border-bottom: 1px solid #1e293b;
      text-align: center;
    }
    .brand {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
      margin: 0;
    }
    .brand span {
      background: linear-gradient(135deg, #a78bfa 0%, #60a5fa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .content {
      padding: 32px;
      font-size: 15px;
      line-height: 1.6;
      color: #cbd5e1;
    }
    .content h2 {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .highlight-box {
      background-color: #0f172a;
      border-left: 4px solid #8b5cf6;
      padding: 16px;
      border-radius: 8px;
      margin: 20px 0;
      font-size: 14px;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0 16px 0;
    }
    .btn {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      border-radius: 10px;
      box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);
    }
    .footer {
      padding: 24px 32px;
      background-color: #0f172a;
      border-top: 1px solid #1e293b;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .footer a {
      color: #94a3b8;
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
              <h1 class="brand">CMPX <span>Bot Disparo</span></h1>
            </td>
          </tr>
          <tr>
            <td class="content">
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td class="footer">
              <p style="margin: 0 0 8px 0;">© ${new Date().getFullYear()} CMPX Tecnologia. Todos os direitos reservados.</p>
              <p style="margin: 0;">Precisa de ajuda? Fale conosco: <a href="mailto:${ENV.RESEND_REPLY_TO}">${ENV.RESEND_REPLY_TO}</a></p>
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
      <h2>Bem-vindo à CMPX! Seu acesso está liberado 🚀</h2>
      <p>Olá, <strong>${cleanName}</strong>!</p>
      <p>Seu pagamento foi confirmado com sucesso e seu acesso à plataforma CMPX já está 100% disponível.</p>
      
      <div class="highlight-box">
        <p style="margin: 0 0 8px 0;"><strong>Status da Assinatura:</strong> Ativa</p>
        <p style="margin: 0;"><strong>Próxima Renovação / Validade:</strong> ${expiresFormatted}</p>
      </div>

      <p>Agora você já pode se conectar e começar a criar suas campanhas automatizadas de prospecção e disparo pelo WhatsApp.</p>

      <div class="btn-container">
        <a href="${loginUrl}" class="btn" target="_blank">ACESSAR A CMPX</a>
      </div>

      <p style="font-size: 13px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px;">
        💡 <strong>Primeiro acesso?</strong> Caso ainda não tenha cadastrado sua senha de login, basta clicar no botão acima, selecionar a aba <em>"Cadastre-se"</em> com este mesmo e-mail (<strong>${email}</strong>) e definir sua senha pessoal.
      </p>
    `;

    const fullHtml = getBaseEmailTemplate(
      htmlContent,
      'Seu pagamento foi confirmado com sucesso e seu acesso à CMPX está liberado!'
    );

    try {
      const response = await client.emails.send({
        from: ENV.RESEND_FROM_EMAIL,
        replyTo: ENV.RESEND_REPLY_TO,
        to: [email],
        subject: 'Bem-vindo à CMPX! Seu acesso está liberado 🚀',
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
   * Envia os avisos de proximidade de vencimento (7 dias ou 1 dia)
   */
  static async sendExpirationReminderEmail(params: {
    email: string;
    name?: string | null;
    expiresAt: Date;
    daysRemaining: 7 | 1;
  }): Promise<EmailSendResult> {
    const { email, name, expiresAt, daysRemaining } = params;
    const client = getResendClient();
    if (!client) {
      return { success: false, error: 'RESEND_API_KEY não configurada' };
    }

    const cleanName = name ? String(name).trim() : 'Cliente';
    const expiresFormatted = formatDatePtBr(expiresAt);
    const platformUrl = ENV.PLATFORM_URL;

    const isSevenDays = daysRemaining === 7;
    const subject = isSevenDays
      ? 'Sua assinatura CMPX vence em 7 dias'
      : 'Sua assinatura CMPX vence amanhã';

    const messageIntro = isSevenDays
      ? 'Passando para avisar que sua assinatura da CMPX está próxima da renovação.'
      : `Sua assinatura da CMPX está prevista para renovar amanhã, <strong>${expiresFormatted}</strong>.`;

    const paymentAdvice = isSevenDays
      ? 'Se sua assinatura possui renovação automática, verifique se sua forma de pagamento está válida para que a renovação aconteça normalmente.'
      : 'Para continuar utilizando a plataforma sem interrupções, verifique se sua forma de pagamento está funcionando corretamente.';

    const htmlContent = `
      <h2>${subject}</h2>
      <p>Olá, <strong>${cleanName}</strong>!</p>
      <p>${messageIntro}</p>

      <div class="highlight-box">
        <p style="margin: 0 0 6px 0;"><strong>Data Prevista da Renovação:</strong> ${expiresFormatted}</p>
        <p style="margin: 0;">${paymentAdvice}</p>
      </div>

      <p>Mantenha sua conta ativa para não perder o ritmo dos seus disparos e prospecções no WhatsApp.</p>

      <div class="btn-container">
        <a href="${platformUrl}" class="btn" target="_blank">ACESSAR A CMPX</a>
      </div>

      <p style="margin-top: 24px;">Atenciosamente,<br><strong>Equipe CMPX</strong></p>
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
      <p>Confirmamos a renovação da sua assinatura CMPX.</p>
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
        subject: 'Assinatura CMPX renovada com sucesso! 🎉',
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
      <p>Confirmamos o cancelamento da renovação automática da sua assinatura.</p>
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
        subject: 'Confirmação de cancelamento da assinatura CMPX',
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
      <h2>Atenção: Falha no pagamento da sua assinatura CMPX</h2>
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
        subject: 'Atenção: Falha no pagamento da sua assinatura CMPX',
        html: getBaseEmailTemplate(htmlContent, 'Identificamos uma falha no pagamento da sua assinatura.'),
      });
      return { success: !response.error, id: response.data?.id, error: response.error?.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
