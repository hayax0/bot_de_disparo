import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockMethod } from '../test-support/mockMethod';
import { prisma } from '../lib/prisma';
import {
  CompanySearchService,
  isValidBrazilianMobilePhone,
  sanitizeCompanyWebsite,
  setTestPlacesProvider
} from './CompanySearchService';
import { CreditWalletService } from './CreditWalletService';
import { ContactPolicyService } from './ContactPolicyService';

test('CompanySearchService: validação de celular e descarte estrito de telefones fixos', () => {
  // Celulares válidos brasileiros com DDD
  assert.equal(isValidBrazilianMobilePhone('5511999998888'), true);
  assert.equal(isValidBrazilianMobilePhone('5521988887777'), true);
  assert.equal(isValidBrazilianMobilePhone('+55 (31) 99123-4567'), true);
  assert.equal(isValidBrazilianMobilePhone('5585994443322'), true);

  // Telefones fixos (iniciam com 2, 3, 4, 5 ou têm 8 dígitos após DDD) -> Devem ser descartados
  assert.equal(isValidBrazilianMobilePhone('551133334444'), false);
  assert.equal(isValidBrazilianMobilePhone('551122221111'), false);
  assert.equal(isValidBrazilianMobilePhone('552140040000'), false);
  assert.equal(isValidBrazilianMobilePhone('553155556666'), false);
  assert.equal(isValidBrazilianMobilePhone('1133334444'), false); // sem DDI 55
  assert.equal(isValidBrazilianMobilePhone(''), false);
  assert.equal(isValidBrazilianMobilePhone('123'), false);
});

test('CompanySearchService: higienização de website descarta URLs de ficha do Google Maps', () => {
  // URLs do Google Maps devem retornar null para não classificar a empresa como "com site"
  assert.equal(sanitizeCompanyWebsite('https://www.google.com/maps/place/Barber+Shop'), null);
  assert.equal(sanitizeCompanyWebsite('https://maps.google.com/?cid=123456789'), null);
  assert.equal(sanitizeCompanyWebsite('https://goo.gl/maps/xyz123'), null);
  assert.equal(sanitizeCompanyWebsite('https://maps.app.goo.gl/abcdef'), null);
  assert.equal(sanitizeCompanyWebsite(''), null);
  assert.equal(sanitizeCompanyWebsite(null), null);

  // Websites reais próprios da empresa devem ser preservados
  assert.equal(sanitizeCompanyWebsite('https://minhaempresa.com.br'), 'https://minhaempresa.com.br');
  assert.equal(sanitizeCompanyWebsite('loja.com.br'), 'https://loja.com.br');
});

test('CompanySearchService: valida campanha de destino ANTES de qualquer reserva de créditos', async (t) => {
  // Campanha não pertence ao workspace
  mockMethod(t, prisma.campaign, 'findFirst', async () => null);

  let reserveCalled = false;
  mockMethod(t, CreditWalletService, 'reserveCredits', async () => {
    reserveCalled = true;
    return { success: true, reservationId: 'res-inv', reservedAmount: 10 };
  });

  await assert.rejects(
    async () => {
      await CompanySearchService.initiateLegacySearch({
        userId: 'u-1',
        workspaceId: 'w-1',
        segment: 'Dentistas',
        location: 'Belo Horizonte',
        requestedCount: 10,
        targetCampaignId: 'c-outra-empresa'
      });
    },
    /A campanha de destino informada não existe ou não pertence a este workspace/
  );

  assert.equal(reserveCalled, false, 'Não deve efetuar reserva de créditos para campanha inválida');
});

test('CompanySearchService: resposta vazia conclui com zero resultados e zero créditos consumidos (sem dados fictícios)', async (t) => {
  let searchRecord: any = { id: 'search-empty', status: 'PENDING', creditsReserved: 10 };
  mockMethod(t, prisma.companySearch, 'create', async ({ data }: any) => {
    searchRecord = { ...searchRecord, ...data };
    return searchRecord;
  });
  mockMethod(t, prisma.companySearch, 'findUnique', async () => ({ ...searchRecord, results: [] }));
  mockMethod(t, prisma.companySearch, 'update', async ({ data }: any) => {
    Object.assign(searchRecord, data);
    return searchRecord;
  });

  mockMethod(t, CreditWalletService, 'reserveCredits', async () => ({
    success: true,
    reservationId: 'res-empty',
    reservedAmount: 10
  }));

  let settledConsumed = -1;
  let settledReleased = -1;
  mockMethod(t, CreditWalletService, 'settleReservation', async ({ actualConsumedAmount }: any) => {
    settledConsumed = actualConsumedAmount;
    settledReleased = 10 - actualConsumedAmount;
    return { success: true, consumedAmount: actualConsumedAmount, releasedAmount: settledReleased };
  });

  // Provedor retorna lista vazia
  setTestPlacesProvider(async () => []);
  t.after(() => setTestPlacesProvider(null));

  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      companySearchResult: { createMany: async () => ({ count: 0 }) },
      companySearch: {
        update: async ({ data }: any) => {
          Object.assign(searchRecord, data);
          return searchRecord;
        }
      }
    };
    return fn(tx);
  });

  const res = await CompanySearchService.initiateLegacySearch({
    userId: 'u-1',
    workspaceId: 'w-1',
    segment: 'Aeroespacial',
    location: 'Cidade Pequena',
    requestedCount: 10
  });

  assert.ok(res);
  assert.equal(res.status, 'COMPLETED');
  assert.equal(res.foundCount, 0);
  assert.equal(res.usableCount, 0);
  assert.equal(settledConsumed, 0, 'Zero empresas aproveitáveis consome exatamente zero créditos');
  assert.equal(settledReleased, 10, 'Estorna integralmente os 10 créditos reservados');
});

test('CompanySearchService: erro na Apify lança exceção controlada, libera reserva e NÃO cria contatos fictícios', async (t) => {
  let searchRecord: any = { id: 'search-err', status: 'PENDING', creditsReserved: 20 };
  mockMethod(t, prisma.companySearch, 'create', async ({ data }: any) => {
    searchRecord = { ...searchRecord, ...data };
    return searchRecord;
  });
  mockMethod(t, prisma.companySearch, 'findUnique', async () => searchRecord);
  mockMethod(t, prisma.companySearch, 'update', async ({ data }: any) => {
    Object.assign(searchRecord, data);
    return searchRecord;
  });

  mockMethod(t, CreditWalletService, 'reserveCredits', async () => ({
    success: true,
    reservationId: 'res-err',
    reservedAmount: 20
  }));

  let releasedReservationId = '';
  mockMethod(t, CreditWalletService, 'releaseReservation', async ({ reservationId }: any) => {
    releasedReservationId = reservationId;
    return { success: true, releasedAmount: 20 };
  });

  // Simula erro de conexão ou timeout na Apify
  setTestPlacesProvider(async () => {
    throw new Error('Timeout de 60s excedido ao consultar o provedor Apify.');
  });
  t.after(() => setTestPlacesProvider(null));

  await assert.rejects(
    async () => {
      await CompanySearchService.initiateLegacySearch({
        userId: 'u-1',
        workspaceId: 'w-1',
        segment: 'Restaurantes',
        location: 'São Paulo',
        requestedCount: 20
      });
    },
    /Timeout de 60s excedido/
  );

  assert.equal(releasedReservationId, 'res-err', 'Deve ter liberado a reserva pelo reservationId');
  assert.equal(searchRecord.status, 'FAILED');
  assert.match(searchRecord.errorMessage, /Timeout de 60s/);
});

test('CompanySearchService: deduplica contra o workspace histórico e descarta números fixos', async (t) => {
  let searchRecord: any = { id: 'search-dedup', status: 'PENDING', creditsReserved: 10 };
  mockMethod(t, prisma.companySearch, 'create', async ({ data }: any) => {
    searchRecord = { ...searchRecord, ...data };
    return searchRecord;
  });
  mockMethod(t, prisma.companySearch, 'findUnique', async () => ({ ...searchRecord, results: [] }));
  mockMethod(t, prisma.companySearch, 'update', async ({ data }: any) => {
    Object.assign(searchRecord, data);
    return searchRecord;
  });

  mockMethod(t, CreditWalletService, 'reserveCredits', async () => ({
    success: true,
    reservationId: 'res-dedup',
    reservedAmount: 10
  }));

  let settledConsumed = 0;
  mockMethod(t, CreditWalletService, 'settleReservation', async ({ actualConsumedAmount }: any) => {
    settledConsumed = actualConsumedAmount;
    return { success: true, consumedAmount: actualConsumedAmount };
  });

  // 1. Contato já contatado no histórico de envios do workspace
  mockMethod(t, prisma.dispatchHistory, 'findUnique', async ({ where }: any) => {
    const phone = where?.workspaceId_phone?.phone || where?.phone;
    if (phone === '5511999990001') {
      return { id: 'hist-1', phone: '5511999990001' };
    }
    return null;
  });
  mockMethod(t, prisma.dispatchHistory, 'findFirst', async ({ where }: any) => {
    if (where.phone === '5511999990001') {
      return { id: 'hist-1', phone: '5511999990001' };
    }
    return null;
  });

  // 2. Contato já existente em outra campanha do workspace
  mockMethod(t, prisma.lead, 'findFirst', async ({ where }: any) => {
    if (where.phone === '5511999990002') {
      return { id: 'lead-prev', phone: '5511999990002' };
    }
    return null;
  });

  mockMethod(t, ContactPolicyService, 'isBlacklisted', async () => false);
  mockMethod(t, prisma.companySearchResult, 'findFirst', async () => null);

  const places = [
    { title: 'Padaria Antiga (histórico)', phone: '11999990001', website: 'https://site1.com' },
    { title: 'Padaria Outra Campanha', phone: '11999990002', website: null },
    { title: 'Padaria Telefone Fixo', phone: '1133334444', website: null }, // Fixo descartado
    { title: 'Padaria Nova e Celular Válido', phone: '11999990003', website: 'https://site3.com' },
  ];

  setTestPlacesProvider(async () => places);
  t.after(() => setTestPlacesProvider(null));

  let resultsSaved: any[] = [];
  mockMethod(t, prisma, '$transaction', async (fn: any) => {
    const tx = {
      $queryRaw: async () => [{ id: 'deliv-1' }],
      deliveredWorkspaceContact: {
        create: async () => ({ id: 'deliv-1' })
      },
      companySearchResult: {
        create: async ({ data }: any) => {
          resultsSaved.push(data);
          return { id: `res-${resultsSaved.length}`, ...data };
        }
      },
      companySearch: {
        update: async ({ data }: any) => {
          Object.assign(searchRecord, data);
          return searchRecord;
        }
      }
    };
    return fn(tx);
  });

  const res = await CompanySearchService.initiateLegacySearch({
    userId: 'u-1',
    workspaceId: 'w-1',
    segment: 'Padarias',
    location: 'Centro',
    requestedCount: 10
  });

  assert.ok(res);
  assert.equal(res.status, 'COMPLETED');
  assert.equal(res.foundCount, 4);
  assert.equal(res.usableCount, 1, 'Apenas 1 é novo e celular válido');
  assert.equal(settledConsumed, 1, 'Consumiu apenas 1 crédito');

  // Verifica as razões de descarte registradas
  const fixo = resultsSaved.find(r => r.name.includes('Fixo'));
  assert.equal(fixo.isUsable, false);
  assert.equal(fixo.discardReason, 'INVALID_PHONE');

  const jaDisparado = resultsSaved.find(r => r.name.includes('histórico'));
  assert.equal(jaDisparado.isUsable, false);
  assert.equal(jaDisparado.discardReason, 'ALREADY_IN_WORKSPACE');

  const outraCampanha = resultsSaved.find(r => r.name.includes('Outra Campanha'));
  assert.equal(outraCampanha.isUsable, false);
  assert.equal(outraCampanha.discardReason, 'ALREADY_IN_WORKSPACE');
});
