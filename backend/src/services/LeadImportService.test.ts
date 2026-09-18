import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LeadImportService } from './LeadImportService';
import { prisma } from '../lib/prisma';

test('LeadImportService: parser CSV com aspas, ponto-e-vírgula e acentos', () => {
  const csv = `Título;Telefone;Site;Bairro
"Bar & Lanchonete, Centro";"(11) 98888-1111";"https://bar.com.br";"Centro"
"Padaria Pão D'Ouro";"11977772222";"";"Pinheiros"
`;
  const parsed = LeadImportService.parseFileContent(csv, 'leads.csv');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].titulo, 'Bar & Lanchonete, Centro');
  assert.equal(parsed[0].telefone, '(11) 98888-1111');
  assert.equal(parsed[0].site, 'https://bar.com.br');
  assert.equal(parsed[1].titulo, "Padaria Pão D'Ouro");
  assert.equal(parsed[1].telefone, '11977772222');
});

test('LeadImportService: parser CSV com BOM UTF-8 e vírgula', () => {
  const bomCsv = `\uFEFFNome,Telefone,Website,Cidade
Clinica Sorriso,5511999993333,https://clinicasorriso.com.br,São Paulo
`;
  const parsed = LeadImportService.parseFileContent(bomCsv, 'test.csv');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].nome, 'Clinica Sorriso');
  assert.equal(parsed[0].telefone, '5511999993333');
});

test('LeadImportService: parser JSON com estrutura aninhada Apify', () => {
  const jsonContent = JSON.stringify({
    items: [
      { title: 'Odonto X', phone: '11966664444', website: 'https://odontox.com.br' },
      { title: 'Pet Shop Y', phone: '11955555555', website: null }
    ]
  });
  const parsed = LeadImportService.parseFileContent(jsonContent, 'apify.json');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, 'Odonto X');
  assert.equal(parsed[1].title, 'Pet Shop Y');
});

test('LeadImportService: categorias são mutuamente exclusivas e somam totalRows', async () => {
  const rawLeads = [
    { title: 'Lead Valido 1', phone: '11988881111' },
    { title: 'Lead Valido 2', phone: '11988882222' },
    { title: 'Lead Sem Telefone', phone: '' },
    { title: 'Lead Telefone Curto', phone: '12345' },
    { title: 'Lead Duplicado 1', phone: '11988881111' } // Duplicado de Valido 1
  ];

  const originalFindMany = prisma.dispatchHistory.findMany;
  (prisma.dispatchHistory as any).findMany = async () => [];

  try {
    const diag = await LeadImportService.classifyLeads({
      rawLeads,
      workspaceId: 'ws-test-categories'
    });

    assert.equal(diag.totalRows, 5);
    assert.equal(diag.validCount, 2);
    assert.equal(diag.invalidCount, 2);
    assert.equal(diag.duplicateCount, 1);
    assert.equal(diag.recontactBlockedCount, 0);

    // Soma estrita
    assert.equal(
      diag.totalRows,
      diag.validCount + diag.invalidCount + diag.duplicateCount + diag.recontactBlockedCount
    );
  } finally {
    prisma.dispatchHistory.findMany = originalFindMany;
  }
});

test('LeadImportService: limite máximo de 2000 leads lança erro explicativo', async () => {
  const excess = new Array(2001).fill({ title: 'Lead', phone: '11999998888' });
  await assert.rejects(
    async () => {
      await LeadImportService.classifyLeads({
        rawLeads: excess,
        workspaceId: 'ws-test-limits'
      });
    },
    /limite máximo permitido por importação é de 2000 leads/
  );
});

test('LeadImportService: recontactAfterDays = 0 permite recontato sem bloqueio', async () => {
  const wsId = 'ws-test-recontact-zero';
  const phone = '5511999990001';

  // Simular mock no DispatchHistory
  const originalFindMany = prisma.dispatchHistory.findMany;
  (prisma.dispatchHistory as any).findMany = async () => [
    {
      phone,
      lastSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 dias atrás
      sendCount: 1,
      lastCampaignName: 'Campanha Passada'
    }
  ];

  try {
    const diag = await LeadImportService.classifyLeads({
      rawLeads: [{ title: 'Cliente Antigo', phone }],
      workspaceId: wsId,
      recontactAfterDays: 0 // 0 = sem bloqueio
    });

    assert.equal(diag.validCount, 1);
    assert.equal(diag.recontactBlockedCount, 0);
    assert.equal(diag.alreadyContactedCount, 1);
    assert.equal(diag.validLeadsToImport[0].alreadyContacted, true);
  } finally {
    prisma.dispatchHistory.findMany = originalFindMany;
  }
});

test('LeadImportService: recontactAfterDays > 0 bloqueia contato recente', async () => {
  const wsId = 'ws-test-recontact-blocked';
  const phone = '5511999990002';

  const originalFindMany = prisma.dispatchHistory.findMany;
  (prisma.dispatchHistory as any).findMany = async () => [
    {
      phone,
      lastSentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 dias atrás
      sendCount: 1,
      lastCampaignName: 'Campanha SP'
    }
  ];

  try {
    const diag = await LeadImportService.classifyLeads({
      rawLeads: [{ title: 'Cliente Recente', phone }],
      workspaceId: wsId,
      recontactAfterDays: 30 // Política de 30 dias
    });

    assert.equal(diag.validCount, 0);
    assert.equal(diag.recontactBlockedCount, 1);
    assert.equal(diag.issues.length, 1);
    assert.match(diag.issues[0].reason, /Bloqueado pela política de recontato de 30 dias/);
  } finally {
    prisma.dispatchHistory.findMany = originalFindMany;
  }
});
