import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelScheduledCampaign, scheduledCampaignJobId, validateCampaignSchedule } from './CampaignScheduleService';

test('validateCampaignSchedule aceita horário futuro com fuso IANA válido', () => {
  const now = new Date('2026-11-26T12:00:00.000Z');
  assert.doesNotThrow(() => validateCampaignSchedule(new Date('2026-11-26T13:00:00.000Z'), 'America/Sao_Paulo', now));
});

test('validateCampaignSchedule rejeita horário passado e fuso inválido', () => {
  const now = new Date('2026-11-26T12:00:00.000Z');
  assert.throws(() => validateCampaignSchedule(now, 'America/Sao_Paulo', now), { status: 400 });
  assert.throws(() => validateCampaignSchedule(new Date('2026-11-26T13:00:00.000Z'), 'Brasil/Rio', now), { status: 400 });
});

test('scheduledCampaignJobId é estável para recuperação idempotente', () => {
  assert.equal(scheduledCampaignJobId('campaign-123'), 'campaign_start_campaign-123');
});

test('cancelScheduledCampaign só devolve os leads do lote agendado', async () => {
  const campaign = { status: 'SCHEDULED', activeSendBatchId: 'batch-current' };
  const leadUpdates: any[] = [];
  const campaignUpdates: any[] = [];
  const db: any = {
    campaign: {
      updateMany: async ({ where, data }: any) => {
        campaignUpdates.push({ where, data });
        if (where.status === 'SCHEDULED' && campaign.status === 'SCHEDULED') {
          Object.assign(campaign, data);
          return { count: 1 };
        }
        if (where.status === 'PAUSING' && campaign.status === 'PAUSING') {
          Object.assign(campaign, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
      findFirst: async () => ({ activeSendBatchId: campaign.activeSendBatchId }),
    },
    lead: { updateMany: async (args: any) => { leadUpdates.push(args); return { count: 2 }; } },
    $transaction: async (callback: (tx: any) => Promise<void>) => callback(db),
  };
  const queue: any = { getJob: async () => null };

  await cancelScheduledCampaign(db, queue, 'campaign-123', 'workspace-123');

  assert.equal(leadUpdates.length, 1);
  assert.equal(leadUpdates[0].where.sendBatchId, 'batch-current');
  assert.equal(leadUpdates[0].data.status, 'PENDING');
  assert.equal(campaign.status, 'PAUSED');
  assert.equal(campaign.activeSendBatchId, null);
});

test('cancelScheduledCampaign sem lote nunca altera leads sem sendBatchId', async () => {
  const campaign = { status: 'SCHEDULED', activeSendBatchId: null };
  let leadUpdates = 0;
  const db: any = {
    campaign: {
      updateMany: async ({ where, data }: any) => {
        if (where.status === 'SCHEDULED' && campaign.status === 'SCHEDULED') {
          Object.assign(campaign, data);
          return { count: 1 };
        }
        if (where.status === 'PAUSING' && campaign.status === 'PAUSING') {
          Object.assign(campaign, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
      findFirst: async () => ({ activeSendBatchId: null }),
    },
    lead: { updateMany: async () => { leadUpdates++; return { count: 0 }; } },
    $transaction: async (callback: (tx: any) => Promise<void>) => callback(db),
  };
  const queue: any = { getJob: async () => null };

  await cancelScheduledCampaign(db, queue, 'campaign-123', 'workspace-123');

  assert.equal(leadUpdates, 0);
  assert.equal(campaign.status, 'PAUSED');
});
