import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockMethod } from '../test-support/mockMethod';
import { prisma } from '../lib/prisma';
import { CompanySearchService } from './CompanySearchService';
import { CreditWalletService } from './CreditWalletService';
import { ContactPolicyService } from './ContactPolicyService';

test('CompanySearchService: executa busca, consome créditos somente por aproveitáveis e libera excedente', async (t) => {
  const workspace = { id: 'w-search', userId: 'u-search', name: 'Minha Empresa' };
  mockMethod(t, prisma.workspace, 'findFirst', async () => workspace);

  let searchRecord = { id: 'search-1', status: 'PROCESSING', creditsReserved: 10, creditsConsumed: 0 };
  mockMethod(t, prisma.companySearch, 'create', async ({ data }: any) => ({ ...searchRecord, ...data }));
  mockMethod(t, prisma.companySearch, 'update', async ({ data }: any) => {
    searchRecord = { ...searchRecord, ...data };
    return searchRecord;
  });

  let reservedAmount = 0;
  let settledConsumed = 0;
  let settledReleased = 0;

  mockMethod(t, CreditWalletService, 'reserveCredits', async ({ amount }: any) => {
    reservedAmount = amount;
    return { success: true, reservedAmount: amount };
  });

  mockMethod(t, CreditWalletService, 'settleReservation', async ({ actualConsumedAmount, releasedAmount }: any) => {
    settledConsumed = actualConsumedAmount;
    settledReleased = (10 - actualConsumedAmount);
    return { success: true, consumedAmount: actualConsumedAmount, releasedAmount: settledReleased };
  });

  // Mock de 5 lugares: 4 com telefone válido (1 duplicado), 1 sem telefone
  const rawPlaces = [
    { title: 'Padaria Alfa', phone: '11999990001', website: 'https://alfa.com', address: 'Rua 1', neighborhood: 'Centro' },
    { title: 'Padaria Beta', phone: '11999990002', website: null, address: 'Rua 2', neighborhood: 'Moema' },
    { title: 'Padaria Alfa Repetida', phone: '11999990001', website: null, address: 'Rua 1', neighborhood: 'Centro' },
    { title: 'Padaria Gamma', phone: '11999990003', website: 'https://gamma.com', address: 'Rua 3', neighborhood: 'Pinheiros' },
    { title: 'Padaria Sem Telefone', phone: '', website: null, address: 'Rua 4', neighborhood: 'Jardins' },
  ];

  mockMethod(t, CompanySearchService as any, 'fetchPlacesFromProvider', async () => rawPlaces);
  mockMethod(t, ContactPolicyService, 'isBlacklisted', async () => false);

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      companySearchResult: {
        create: async ({ data }: any) => ({ id: `res-${Math.random()}`, ...data })
      },
      companySearch: {
        update: async ({ data }: any) => {
          searchRecord = { ...searchRecord, ...data };
          return searchRecord;
        }
      }
    };
    return fn(tx);
  });

  const result = await CompanySearchService.executeSearch({
    userId: 'u-search',
    workspaceId: 'w-search',
    segment: 'Padarias',
    location: 'São Paulo',
    requestedCount: 10
  });

  assert.equal(reservedAmount, 10, 'Deve reservar 10 créditos (pelo total solicitado)');
  assert.equal(result.foundCount, 5, 'Encontrou 5 registros brutos');
  assert.equal(result.usableCount, 3, 'Apenas 3 são aproveitáveis (1 sem telefone e 1 duplicado descartados)');
  assert.equal(result.discardedCount, 2);
  assert.equal(settledConsumed, 3, 'Deve cobrar exatamente 3 créditos');
  assert.equal(settledReleased, 7, 'Deve liberar 7 créditos da reserva');
});

test('CompanySearchService: falha na busca aciona liberação integral da reserva', async (t) => {
  mockMethod(t, prisma.workspace, 'findFirst', async () => ({ id: 'w-fail', userId: 'u-fail' }));
  mockMethod(t, prisma.companySearch, 'create', async () => ({ id: 'search-fail' }));
  mockMethod(t, prisma.companySearch, 'update', async () => ({}));

  let released = false;
  mockMethod(t, CreditWalletService, 'reserveCredits', async () => ({ success: true, reservedAmount: 20 }));
  mockMethod(t, CreditWalletService, 'releaseReservation', async () => {
    released = true;
    return { success: true, releasedAmount: 20 };
  });

  mockMethod(t, CompanySearchService as any, 'fetchPlacesFromProvider', async () => {
    throw new Error('Falha de rede na API de mapas.');
  });

  await assert.rejects(
    async () => {
      await CompanySearchService.executeSearch({
        userId: 'u-fail',
        workspaceId: 'w-fail',
        segment: 'Advogados',
        location: 'Curitiba',
        requestedCount: 20
      });
    },
    /Falha de rede/
  );

  assert.equal(released, true, 'Deve ter liberado 100% da reserva de créditos ao falhar');
});

test('CompanySearchService: addSelectedToCampaign adiciona leads na campanha sem quebrar em duplicatas', async (t) => {
  mockMethod(t, prisma.campaign, 'findFirst', async () => ({ id: 'c-1', workspaceId: 'w-1', name: 'Campanha Teste' }));

  const items = [
    { id: 'item-1', name: 'Clínica 1', phone: '5511988880001', website: 'https://c1.com', neighborhood: 'Centro', isUsable: true },
    { id: 'item-2', name: 'Clínica 2', phone: '5511988880002', website: null, neighborhood: 'Moema', isUsable: true },
  ];
  mockMethod(t, prisma.companySearchResult, 'findMany', async () => items);
  mockMethod(t, prisma.companySearchResult, 'update', async () => ({}));

  let createdLeads: any[] = [];
  mockMethod(t, prisma.lead, 'create', async ({ data }: any) => {
    if (data.phone === '5511988880002') {
      const err: any = new Error('Unique constraint failed');
      err.code = 'P2002';
      throw err;
    }
    createdLeads.push(data);
    return { id: 'lead-created', ...data };
  });

  const res = await CompanySearchService.addSelectedToCampaign({
    searchId: 's-1',
    companyResultIds: ['item-1', 'item-2'],
    campaignId: 'c-1',
    workspaceId: 'w-1'
  });

  assert.equal(res.addedCount, 1);
  assert.equal(res.duplicateCount, 1);
  assert.equal(createdLeads[0].title, 'Clínica 1');
  assert.equal(createdLeads[0].status, 'PENDING');
});
