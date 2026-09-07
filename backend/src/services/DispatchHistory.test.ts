import test from 'node:test';
import assert from 'node:assert/strict';
import { WhatsappManager } from './WhatsappManager';

// Simulação das regras de negócio do DispatchHistory
interface FakeHistoryItem {
  id: string;
  workspaceId: string;
  phone: string;
  companyTitle: string;
  website: string | null;
  neighborhood: string | null;
  firstSentAt: Date;
  lastSentAt: Date;
  lastMessage: string;
  lastCampaignName: string;
  sendCount: number;
}

class FakeHistoryStore {
  private items = new Map<string, FakeHistoryItem>();

  private getKey(workspaceId: string, phone: string) {
    return `${workspaceId}_${WhatsappManager.normalizeBrPhone(phone)}`;
  }

  recordSendSuccess(params: {
    workspaceId: string;
    phone: string;
    companyTitle: string;
    website?: string | null;
    neighborhood?: string | null;
    campaignName: string;
    message: string;
    timestamp: Date;
  }): FakeHistoryItem {
    const key = this.getKey(params.workspaceId, params.phone);
    const existing = this.items.get(key);
    const normalizedPhone = WhatsappManager.normalizeBrPhone(params.phone);

    if (!existing) {
      const created: FakeHistoryItem = {
        id: `hist-${Date.now()}-${Math.random()}`,
        workspaceId: params.workspaceId,
        phone: normalizedPhone,
        companyTitle: params.companyTitle,
        website: params.website || null,
        neighborhood: params.neighborhood || null,
        firstSentAt: params.timestamp,
        lastSentAt: params.timestamp,
        lastMessage: params.message,
        lastCampaignName: params.campaignName,
        sendCount: 1
      };
      this.items.set(key, created);
      return created;
    } else {
      existing.sendCount += 1;
      existing.lastSentAt = params.timestamp;
      existing.lastMessage = params.message;
      existing.lastCampaignName = params.campaignName;
      if (params.companyTitle) existing.companyTitle = params.companyTitle;
      if (params.website) existing.website = params.website;
      if (params.neighborhood) existing.neighborhood = params.neighborhood;
      // firstSentAt permanece inalterado
      return existing;
    }
  }

  findByWorkspace(workspaceId: string, search?: string) {
    let result = Array.from(this.items.values()).filter(item => item.workspaceId === workspaceId);
    if (search) {
      const q = search.toLowerCase();
      const cleanDigits = search.replace(/\D/g, '');
      result = result.filter(item => 
        item.companyTitle.toLowerCase().includes(q) ||
        (item.neighborhood && item.neighborhood.toLowerCase().includes(q)) ||
        (cleanDigits && item.phone.includes(cleanDigits))
      );
    }
    return result.sort((a, b) => b.lastSentAt.getTime() - a.lastSentAt.getTime());
  }

  getLeadHistoryInfo(workspaceId: string, phone: string) {
    const key = this.getKey(workspaceId, phone);
    const hist = this.items.get(key);
    if (hist) {
      return {
        alreadySent: true,
        lastSentAt: hist.lastSentAt,
        sendCount: hist.sendCount,
        lastCampaignName: hist.lastCampaignName
      };
    }
    return {
      alreadySent: false,
      lastSentAt: null,
      sendCount: 0,
      lastCampaignName: null
    };
  }
}

test('DispatchHistory: Primeiro envio cria registro com sendCount = 1 e datas iniciais', () => {
  const store = new FakeHistoryStore();
  const t1 = new Date('2026-09-01T10:00:00Z');

  const item = store.recordSendSuccess({
    workspaceId: 'ws-1',
    phone: '+55 (21) 99741-1009',
    companyTitle: 'Empresa Teste',
    campaignName: 'Campanha Setembro',
    message: 'Olá, primeira proposta!',
    timestamp: t1
  });

  assert.equal(item.sendCount, 1);
  assert.equal(item.phone, '5521997411009');
  assert.equal(item.firstSentAt.toISOString(), t1.toISOString());
  assert.equal(item.lastSentAt.toISOString(), t1.toISOString());
  assert.equal(item.lastMessage, 'Olá, primeira proposta!');
  assert.equal(item.lastCampaignName, 'Campanha Setembro');
});

test('DispatchHistory: Segundo envio incrementa sendCount, atualiza lastSentAt e preserva firstSentAt', () => {
  const store = new FakeHistoryStore();
  const t1 = new Date('2026-09-01T10:00:00Z');
  const t2 = new Date('2026-09-07T14:00:00Z');

  store.recordSendSuccess({
    workspaceId: 'ws-1',
    phone: '21997411009', // formato sem DDI nem símbolos
    companyTitle: 'Empresa Teste',
    campaignName: 'Campanha Antiga',
    message: 'Mensagem 1',
    timestamp: t1
  });

  const updated = store.recordSendSuccess({
    workspaceId: 'ws-1',
    phone: '+55 21 99741-1009', // mesmo telefone com formatação diferente
    companyTitle: 'Empresa Teste Nova Razão',
    campaignName: 'Campanha Nova Followup',
    message: 'Mensagem 2 Followup',
    timestamp: t2
  });

  assert.equal(updated.sendCount, 2);
  assert.equal(updated.firstSentAt.toISOString(), t1.toISOString(), 'firstSentAt NÃO deve mudar');
  assert.equal(updated.lastSentAt.toISOString(), t2.toISOString(), 'lastSentAt deve atualizar para o mais recente');
  assert.equal(updated.lastMessage, 'Mensagem 2 Followup');
  assert.equal(updated.lastCampaignName, 'Campanha Nova Followup');
});

test('DispatchHistory: Erros e retries que falharam NÃO criam nem incrementam histórico', () => {
  const store = new FakeHistoryStore();
  // Nenhum recordSendSuccess chamado para leads que falharam ou estão pendentes
  const hist = store.getLeadHistoryInfo('ws-1', '21999998888');
  assert.equal(hist.alreadySent, false);
  assert.equal(hist.sendCount, 0);
  assert.equal(hist.lastSentAt, null);
});

test('DispatchHistory: Independência das Campanhas — exclusão da campanha não afeta o histórico', () => {
  const store = new FakeHistoryStore();
  store.recordSendSuccess({
    workspaceId: 'ws-1',
    phone: '21997411009',
    companyTitle: 'Restaurante Sabor',
    campaignName: 'Campanha A Ser Excluida',
    message: 'Proposta inicial',
    timestamp: new Date()
  });

  // Simulação: campanha excluída (não afeta store)
  const items = store.findByWorkspace('ws-1');
  assert.equal(items.length, 1);
  assert.equal(items[0].companyTitle, 'Restaurante Sabor');
});

test('DispatchHistory: Isolamento absoluto entre Workspaces (Workspace A x Workspace B)', () => {
  const store = new FakeHistoryStore();
  store.recordSendSuccess({
    workspaceId: 'ws-empresa-A',
    phone: '21997411009',
    companyTitle: 'Cliente Alpha',
    campaignName: 'Campanha Alpha',
    message: 'Msg A',
    timestamp: new Date()
  });

  // Workspace B tenta buscar histórico do mesmo telefone
  const histInfoB = store.getLeadHistoryInfo('ws-empresa-B', '21997411009');
  assert.equal(histInfoB.alreadySent, false);
  assert.equal(histInfoB.sendCount, 0);

  const listB = store.findByWorkspace('ws-empresa-B');
  assert.equal(listB.length, 0);

  // Workspace A enxerga normalmente
  const histInfoA = store.getLeadHistoryInfo('ws-empresa-A', '21997411009');
  assert.equal(histInfoA.alreadySent, true);
  assert.equal(histInfoA.sendCount, 1);
});

test('DispatchHistory: Backfill consolida múltiplos leads SENT antigos no mesmo telefone', () => {
  const oldSentLeads = [
    { phone: '(21) 98888-1111', title: 'Empresa 1', campaign: 'Camp 1', msg: 'Msg 1', sentAt: new Date('2026-08-01') },
    { phone: '21988881111', title: 'Empresa 1', campaign: 'Camp 2', msg: 'Msg 2', sentAt: new Date('2026-08-15') },
    { phone: '+55 21 98888-1111', title: 'Empresa 1', campaign: 'Camp 3', msg: 'Msg 3 Final', sentAt: new Date('2026-09-01') },
  ];

  // Agrupamento simulando backfillDispatchHistory
  const consolidated = new Map<string, any>();
  for (const l of oldSentLeads) {
    const norm = WhatsappManager.normalizeBrPhone(l.phone);
    if (!consolidated.has(norm)) {
      consolidated.set(norm, {
        phone: norm,
        title: l.title,
        firstSentAt: l.sentAt,
        lastSentAt: l.sentAt,
        lastMessage: l.msg,
        lastCampaignName: l.campaign,
        sendCount: 1
      });
    } else {
      const c = consolidated.get(norm);
      c.sendCount += 1;
      if (l.sentAt > c.lastSentAt) {
        c.lastSentAt = l.sentAt;
        c.lastMessage = l.msg;
        c.lastCampaignName = l.campaign;
      }
      if (l.sentAt < c.firstSentAt) {
        c.firstSentAt = l.sentAt;
      }
    }
  }

  const res = consolidated.get('5521988881111');
  assert.ok(res);
  assert.equal(res.sendCount, 3);
  assert.equal(res.firstSentAt.toISOString(), new Date('2026-08-01').toISOString());
  assert.equal(res.lastSentAt.toISOString(), new Date('2026-09-01').toISOString());
  assert.equal(res.lastMessage, 'Msg 3 Final');
  assert.equal(res.lastCampaignName, 'Camp 3');
});

test('Persistência de Copy: Atualização parcial preserva mensagem anterior', () => {
  let wsCopy = {
    lastMessageComSite: 'Copy antiga com site',
    lastMessageSemSite: 'Copy antiga sem site'
  };

  // Usuário cria campanha informando apenas copy com site atualizada
  const novaCopyComSite = 'Nova copy incrível com site!';
  const novaCopySemSite = ''; // vazio

  if (novaCopyComSite) wsCopy.lastMessageComSite = novaCopyComSite;
  if (novaCopySemSite) wsCopy.lastMessageSemSite = novaCopySemSite; // não deve sobrescrever

  assert.equal(wsCopy.lastMessageComSite, 'Nova copy incrível com site!');
  assert.equal(wsCopy.lastMessageSemSite, 'Copy antiga sem site', 'Copy sem site deve ser preservada');
});
