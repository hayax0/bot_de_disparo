import { Worker } from 'bullmq';
import { createConnection } from '../services/queue';
import { AiCopyService } from '../services/AiCopyService';

const isTest = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));

export let aiGenerationWorker: Worker | null = null;

export function startAiGenerationWorker() {
  if (isTest || aiGenerationWorker) return aiGenerationWorker;

  aiGenerationWorker = new Worker(
    'ai-generation-queue',
    async (job) => {
      const { operationId } = job.data;
      if (!operationId) return;

      console.log(`[AI GENERATION WORKER] Processando lote de IA ${operationId} (jobId=${job.id})...`);
      await AiCopyService.processOperationJob(operationId);
    },
    {
      connection: createConnection(),
      concurrency: 2, // Limite operacional de concorrência simultânea para o provedor
      lockDuration: 60000,
    }
  );

  aiGenerationWorker.on('failed', (job, err) => {
    console.error(`[AI GENERATION WORKER FAILED] Operação ${job?.data?.operationId}:`, err?.message);
  });

  return aiGenerationWorker;
}
