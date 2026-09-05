import { prisma } from '../lib/prisma';
import { isUserAdmin } from './SubscriptionManager';
import { EmailService } from './EmailService';

export interface ReminderProcessResult {
  totalChecked: number;
  reminders7DaysSent: number;
  reminders1DaySent: number;
  expiredUpdated: number;
  errors: string[];
}

export class SubscriptionReminderService {
  /**
   * Processa verificações de vencimento e envia avisos de 7 dias e 1 dia de forma estritamente idempotente.
   * Não depende de login do usuário; roda via Cron.
   */
  static async processReminders(now: Date = new Date()): Promise<ReminderProcessResult> {
    const result: ReminderProcessResult = {
      totalChecked: 0,
      reminders7DaysSent: 0,
      reminders1DaySent: 0,
      expiredUpdated: 0,
      errors: []
    };

    console.log(`[SUBSCRIPTION CRON] Iniciando verificação de avisos de vencimento em ${now.toISOString()}`);

    try {
      // 1. Busca todos os assinantes comuns com data de expiração registrada
      const users = await prisma.user.findMany({
        where: {
          role: 'USER',
          subscriptionExpiresAt: { not: null },
          subscriptionStatus: { in: ['ACTIVE', 'CANCELED'] }
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          subscriptionStatus: true,
          subscriptionExpiresAt: true,
        }
      });

      result.totalChecked = users.length;

      for (const user of users) {
        // Blindagem: VIPs e Admins nunca recebem e-mails de vencimento e nunca são bloqueados
        if (isUserAdmin(user.email) || user.role === 'ADMIN' || user.subscriptionStatus === 'LIFETIME') {
          continue;
        }

        const expiresAt = new Date(user.subscriptionExpiresAt!);
        const diffMs = expiresAt.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        // Identificador de ciclo baseado na data de expiração (formato YYYY-MM-DD)
        const cycle = expiresAt.toISOString().split('T')[0];

        // Caso A: Assinatura já expirou
        if (diffMs <= 0) {
          if (user.subscriptionStatus === 'ACTIVE') {
            await prisma.user.update({
              where: { id: user.id },
              data: { subscriptionStatus: 'PAST_DUE' }
            }).catch((err) => {
              result.errors.push(`Erro ao expirar usuário ${user.email}: ${err.message}`);
            });
            result.expiredUpdated++;
            console.log(`[SUBSCRIPTION CRON] Assinatura do usuário ${user.email} expirou e foi marcada como PAST_DUE.`);
          }
          continue;
        }

        // Caso B: Aviso de 7 dias (janela entre 6.0 e 7.9 dias restantes)
        if (diffDays >= 6.0 && diffDays <= 7.9) {
          try {
            const existingNotification = await prisma.subscriptionNotification.findUnique({
              where: {
                userId_type_cycle: {
                  userId: user.id,
                  type: 'EXPIRATION_7_DAYS',
                  cycle
                }
              }
            });

            // Se já foi enviado com sucesso neste ciclo, pula (idempotência rigorosa)
            if (!existingNotification || existingNotification.status === 'FAILED') {
              const emailResult = await EmailService.sendExpirationReminderEmail({
                email: user.email,
                name: user.name,
                expiresAt,
                daysRemaining: 7
              });

              await prisma.subscriptionNotification.upsert({
                where: {
                  userId_type_cycle: {
                    userId: user.id,
                    type: 'EXPIRATION_7_DAYS',
                    cycle
                  }
                },
                update: {
                  resendEmailId: emailResult.id || null,
                  status: emailResult.success ? 'SENT' : 'FAILED',
                  errorMessage: emailResult.error || null,
                  sentAt: new Date()
                },
                create: {
                  userId: user.id,
                  type: 'EXPIRATION_7_DAYS',
                  cycle,
                  recipientEmail: user.email,
                  resendEmailId: emailResult.id || null,
                  status: emailResult.success ? 'SENT' : 'FAILED',
                  errorMessage: emailResult.error || null,
                  sentAt: new Date()
                }
              });

              if (emailResult.success) {
                result.reminders7DaysSent++;
              } else {
                result.errors.push(`Falha no envio de 7 dias para ${user.email}: ${emailResult.error}`);
              }
            }
          } catch (err: any) {
            result.errors.push(`Erro ao processar lembrete de 7 dias para ${user.email}: ${err.message}`);
          }
        }

        // Caso C: Aviso de 1 dia (janela entre 0.0 e 1.9 dias restantes)
        if (diffDays >= 0.0 && diffDays <= 1.9) {
          try {
            const existingNotification = await prisma.subscriptionNotification.findUnique({
              where: {
                userId_type_cycle: {
                  userId: user.id,
                  type: 'EXPIRATION_1_DAY',
                  cycle
                }
              }
            });

            if (!existingNotification || existingNotification.status === 'FAILED') {
              const emailResult = await EmailService.sendExpirationReminderEmail({
                email: user.email,
                name: user.name,
                expiresAt,
                daysRemaining: 1
              });

              await prisma.subscriptionNotification.upsert({
                where: {
                  userId_type_cycle: {
                    userId: user.id,
                    type: 'EXPIRATION_1_DAY',
                    cycle
                  }
                },
                update: {
                  resendEmailId: emailResult.id || null,
                  status: emailResult.success ? 'SENT' : 'FAILED',
                  errorMessage: emailResult.error || null,
                  sentAt: new Date()
                },
                create: {
                  userId: user.id,
                  type: 'EXPIRATION_1_DAY',
                  cycle,
                  recipientEmail: user.email,
                  resendEmailId: emailResult.id || null,
                  status: emailResult.success ? 'SENT' : 'FAILED',
                  errorMessage: emailResult.error || null,
                  sentAt: new Date()
                }
              });

              if (emailResult.success) {
                result.reminders1DaySent++;
              } else {
                result.errors.push(`Falha no envio de 1 dia para ${user.email}: ${emailResult.error}`);
              }
            }
          } catch (err: any) {
            result.errors.push(`Erro ao processar lembrete de 1 dia para ${user.email}: ${err.message}`);
          }
        }
      }

      console.log(
        `[SUBSCRIPTION CRON] Finalizado: ${result.totalChecked} checados, ` +
        `${result.reminders7DaysSent} avisos de 7 dias, ${result.reminders1DaySent} avisos de 1 dia, ` +
        `${result.expiredUpdated} expirados.`
      );

      return result;
    } catch (err: any) {
      console.error('[SUBSCRIPTION CRON FATAL] Erro geral ao processar avisos:', err);
      result.errors.push(err.message || String(err));
      return result;
    }
  }
}
