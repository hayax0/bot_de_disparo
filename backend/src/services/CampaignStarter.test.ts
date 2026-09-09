import test from 'node:test';
import assert from 'node:assert/strict';
import { startCampaign } from './CampaignStarter';

function fixture({ connected = true, leadsCount = 2, failQueue = false } = {}) {
  const campaign = { id: 'c', workspaceId: 'w', status: 'PAUSED', delayMin: 90, delayMax: 180 };
  const leads = Array.from({ length: leadsCount }, (_, i) => ({ id: `l${i}`, status: 'PENDING' }));
  const jobs = new Map<string, any>();
  const db: any = {
    campaign: {
      findFirst: async () => ({ ...campaign }),
      updateMany: async ({ where, data }: any) => {
        if (where.status?.notIn?.includes(campaign.status) || (typeof where.status === 'string' && where.status !== campaign.status)) return { count: 0 };
        Object.assign(campaign, data);
        return { count: 1 };
      },
    },
    whatsappSession: { findUnique: async () => ({ status: connected ? 'CONNECTED' : 'DISCONNECTED' }) },
    lead: {
      findMany: async () => leads.map(lead => ({ ...lead })),
      updateMany: async ({ data }: any) => { leads.forEach(lead => Object.assign(lead, data)); return { count: leads.length }; },
    },
  };
  const queue: any = {
    getJob: async (id: string) => jobs.get(id),
    add: async (_name: string, _data: any, opts: any) => {
      assert.equal(campaign.status, 'STARTING', 'Não pode liberar envios antes de preparar todos os jobs');
      if (failQueue && opts.jobId.endsWith('l1')) throw new Error('Redis unavailable');
      jobs.set(opts.jobId, { getState: async () => 'delayed' });
    },
  };
  return { db, queue, campaign, leads, jobs };
}

test('startCampaign: WhatsApp desconectado não altera o estado', async () => {
  const f = fixture({ connected: false });
  await assert.rejects(startCampaign(f.db, f.queue, 'c', 'w'), { status: 400 });
  assert.equal(f.campaign.status, 'PAUSED');
  assert.equal(f.jobs.size, 0);
});

test('startCampaign: campanha vazia não fica RUNNING', async () => {
  const f = fixture({ leadsCount: 0 });
  assert.equal((await startCampaign(f.db, f.queue, 'c', 'w')).jobsQueued, 0);
  assert.equal(f.campaign.status, 'PAUSED');
});

test('startCampaign: falha parcial pausa e devolve leads para nova tentativa', async () => {
  const f = fixture({ failQueue: true });
  await assert.rejects(startCampaign(f.db, f.queue, 'c', 'w'), { status: 503 });
  assert.equal(f.campaign.status, 'PAUSED');
  assert.ok(f.leads.every(lead => lead.status === 'PENDING'));
});

test('startCampaign: dois inícios concorrentes só liberam um lote determinístico', async () => {
  const f = fixture();
  const results = await Promise.allSettled([startCampaign(f.db, f.queue, 'c', 'w'), startCampaign(f.db, f.queue, 'c', 'w')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.campaign.status, 'RUNNING');
  assert.deepEqual([...f.jobs.keys()], ['c_l0', 'c_l1']);
});
