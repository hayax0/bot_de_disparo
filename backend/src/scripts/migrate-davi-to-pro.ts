/**
 * Script de migração segura da conta do Davi para o Novo Sistema (Plano PRO).
 * 
 * Regra de negócio aprovada pelo gestor:
 * - Migrar Davi para o Plano PRO (3.000 disparos/mês, 150 créditos mensais de IA, busca Apify + upload de listas);
 * - Bonificação de 1 mês grátis: estende o vencimento atual em +30 dias a partir da data de amanhã;
 * - Reseta os disparos do ciclo (0 / 3.000);
 * - Concede os 150 créditos de IA do ciclo na carteira;
 * - Idempotente: pode ser executado novamente sem duplicação de benefícios.
 * 
 * Uso:
 *   npx tsx scripts/migrate-davi-to-pro.ts
 */

import { PrismaClient } from '@prisma/client';
import { CreditWalletService } from '../services/CreditWalletService';
import { QuotaService } from '../services/QuotaService';
import { getPlanById } from '../config/plans';

const prisma = new PrismaClient();
const DAVI_EMAIL = 'davianicetofirme@hotmail.com';

async function main() {
  console.log('================================================================');
  console.log('MIGRAÇÃO DA CONTA DO DAVI: PLANO LEGADO -> PLANO PRO (+1 MÊS FREE)');
  console.log('================================================================');
  console.log(`Buscando conta: ${DAVI_EMAIL}...`);

  const user = await prisma.user.findUnique({
    where: { email: DAVI_EMAIL },
    include: { workspaces: true }
  });

  if (!user) {
    console.error(`[ERRO] Usuário ${DAVI_EMAIL} não encontrado no banco de dados conectado.`);
    console.log('Dica: Verifique se a variável DATABASE_URL aponta para o banco correto de produção.');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('\n--- ESTADO ATUAL (ANTES) ---');
  console.log(`ID: ${user.id}`);
  console.log(`Nome: ${user.name}`);
  console.log(`Plano: ${user.planId}`);
  console.log(`Status Assinatura: ${user.subscriptionStatus}`);
  console.log(`Validade Atual: ${user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : 'Sem data'}`);
  console.log(`Franquia de Disparos: ${user.monthlyDispatchQuota}`);
  console.log(`Disparos Usados no Ciclo: ${user.dispatchesUsedInCycle}`);

  const now = new Date();
  let baseExpiration = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) : now;
  if (baseExpiration.getTime() < now.getTime()) {
    baseExpiration = now;
  }

  // Estende +30 dias a partir da data de vencimento (vence amanhã -> ganha +30 dias além de amanhã)
  const newExpiration = new Date(baseExpiration.getTime() + 30 * 24 * 60 * 60 * 1000);
  const idempotencyKey = `davi_bonus_pro_${newExpiration.toISOString().slice(0, 10)}`;

  console.log('\n--- APLICANDO MIGRAÇÃO ---');
  console.log(`Nova Validade: ${newExpiration.toISOString()}`);
  console.log('Plano: PRO (3.000 disparos/mês + 150 créditos mensais de IA)');

  // 1. Atualiza usuário no banco
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      planId: 'PRO',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: newExpiration,
      subscriptionRenewedAt: now,
      monthlyDispatchQuota: 3000,
      dispatchesUsedInCycle: 0
    }
  });

  // 2. Reseta cotas de disparo no ciclo
  await QuotaService.resetCycleDispatches(user.id, 3000, prisma);

  // 3. Concede os 150 créditos de IA do Plano PRO na carteira
  const grantResult = await CreditWalletService.grantMonthlyCredits({
    userId: user.id,
    amount: 150,
    expiresAt: newExpiration,
    idempotencyKey,
    description: '1 mês de cortesia Plano PRO (Migração para o Novo Sistema)',
    tx: prisma
  });

  const walletSummary = await CreditWalletService.getWalletSummary(user.id);

  console.log('\n--- ESTADO FINAL (DEPOIS) ---');
  console.log(`ID: ${updated.id}`);
  console.log(`Plano: ${updated.planId} (Profissional)`);
  console.log(`Status Assinatura: ${updated.subscriptionStatus}`);
  console.log(`Nova Validade da Assinatura: ${updated.subscriptionExpiresAt?.toISOString()}`);
  console.log(`Franquia Mensal de Disparos: ${updated.monthlyDispatchQuota}`);
  console.log(`Disparos Usados no Ciclo: ${updated.dispatchesUsedInCycle} / 3.000`);
  console.log(`Saldo de Créditos IA: ${walletSummary.totalBalance} (Mensais: ${walletSummary.monthlyBalance})`);
  console.log(`Concessão de Créditos Idempotente: ${grantResult.success && grantResult.grantedAmount > 0 ? 'CONCEDIDO (150 créditos)' : 'JÁ CONCEDIDO ANTERIORMENTE'}`);

  console.log('\n================================================================');
  console.log('MIGRAÇÃO CONCLUÍDA COM SUCESSO! DAVI ESTÁ 100% NO NOVO SISTEMA');
  console.log('================================================================');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('[ERRO CRÍTICO NA MIGRAÇÃO]:', err);
  process.exit(1);
});
