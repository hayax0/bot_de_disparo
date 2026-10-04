import { Worker } from 'bullmq';
import { createConnection } from '../services/queue';
import { CompanySearchService } from '../services/CompanySearchService';

const isTest = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));

export let companySearchWorker: Worker | null = null;

export function startCompanySearchWorker() {
  if (isTest || companySearchWorker) return companySearchWorker;

  companySearchWorker = new Worker(
    'company-search-queue',
    async (job) => {
      const { searchId } = job.data;
      if (!searchId) return;

      const isLastAttempt = job.attemptsMade >= ((job.opts.attempts || 1) - 1);
      console.log(`[COMPANY SEARCH WORKER] Processando busca ${searchId} (tentativa ${job.attemptsMade + 1}/${job.opts.attempts || 1}, isLastAttempt=${isLastAttempt})...`);
      await CompanySearchService.processSearchJob(searchId, { isLastAttempt });
    },
    {
      connection: createConnection(),
      concurrency: 2, // Limite operacional de concorrência simultânea
      lockDuration: 60000,
    }
  );

  companySearchWorker.on('failed', (job, err) => {
    console.error(`[COMPANY SEARCH WORKER FAILED] Busca ${job?.data?.searchId}:`, err?.message);
  });

  return companySearchWorker;
}
