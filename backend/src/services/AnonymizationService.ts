import { prisma } from '../lib/prisma';
import crypto from 'crypto';
import { ENV } from '../config/env';

const LGPD_PEPPER = process.env.LGPD_HMAC_SECRET || `${ENV.JWT_SECRET}_lgpd_pepper`;

export function generateAnonymizedPhoneId(phone: string): string {
  let clean = phone.replace(/\D/g, '');
  if (clean.length === 10 || clean.length === 11) {
    clean = '55' + clean;
  }
  return 'anon_' + crypto.createHmac('sha256', LGPD_PEPPER).update(clean).digest('hex').slice(0, 20);
}

export class AnonymizationService {
  /**
   * Anonimiza todos os dados identificáveis de um determinado contato em um workspace (LGPD Art. 18):
   * 1. Substitui o número de telefone por identificador HMAC irreversível
   * 2. Remove nome da empresa/lead, website, bairro e cópia das mensagens
   * 3. Mantém o telefone na Blacklist para garantir que a plataforma nunca mais o contate
   * 4. Registra auditoria sem repetir os dados excluídos
   */
  static async anonymizeContact(params: {
    phone: string;
    workspaceId: string;
    requestedByUserId?: string;
    ip?: string;
  }): Promise<{ anonymizedCount: number; anonymizedPhoneId: string }> {
    const { phone, workspaceId, requestedByUserId, ip } = params;
    const cleanPhone = phone.replace(/\D/g, '');
    const anonymizedPhoneId = generateAnonymizedPhoneId(cleanPhone);

    let count = 0;

    await prisma.$transaction(async (tx) => {
      // 1. Anonimiza os registros na tabela Lead
      const leads = await tx.lead.findMany({
        where: {
          phone: { in: [cleanPhone, `+${cleanPhone}`] },
          campaign: { workspaceId }
        },
        select: { id: true }
      });

      count = leads.length;

      for (const l of leads) {
        await tx.lead.update({
          where: { id: l.id },
          data: {
            phone: anonymizedPhoneId,
            title: 'Contato Anonimizado (LGPD)',
            website: null,
            neighborhood: null,
            messageContent: null,
            wppMessageId: null,
            status: 'IGNORED',
            errorMessage: 'Dados pessoais removidos a pedido do titular (Anonimização LGPD).'
          }
        });
      }

      // 2. Anonimiza histórico de disparos se existir
      await tx.dispatchHistory.updateMany({
        where: {
          workspaceId,
          phone: cleanPhone
        },
        data: {
          phone: anonymizedPhoneId,
          companyTitle: 'Empresa Anonimizada (LGPD)',
          website: null,
          neighborhood: null,
          lastMessage: null,
          lastCampaignName: null
        }
      });

      // 3. Garante que o telefone permaneça suprimido na Blacklist do workspace
      const blExists = await tx.blacklist.findFirst({
        where: {
          phone: cleanPhone,
          OR: [
            { scope: 'GLOBAL' },
            { scope: 'WORKSPACE', workspaceId }
          ]
        }
      });

      if (!blExists) {
        await tx.blacklist.create({
          data: {
            scope: 'WORKSPACE',
            workspaceId,
            phone: cleanPhone,
            reason: 'OPT_OUT',
            source: 'USER_ACTION',
            metadata: JSON.stringify({
              action: 'LGPD_ANONYMIZATION',
              date: new Date().toISOString()
            })
          }
        });
      }

      // 4. Registro de auditoria seguro (sem repetir nenhum dado pessoal)
      await tx.auditLog.create({
        data: {
          workspaceId,
          userId: requestedByUserId ?? null,
          action: 'ANONYMIZE_LEAD',
          targetType: 'LEAD',
          targetId: anonymizedPhoneId,
          ip: ip ?? null,
          details: `Anonimização LGPD concluída com sucesso. ${count} registros descaracterizados.`
        }
      });
    });

    return {
      anonymizedCount: count,
      anonymizedPhoneId
    };
  }
}
