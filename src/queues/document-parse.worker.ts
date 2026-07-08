import { Worker, type Job } from 'bullmq'
import { redisConnection, QUEUE_DOCUMENT_PARSE, QUEUE_EXPORT } from '@/lib/redis'
import { processDocumentParse, type DocumentParseJobData } from './document-parse.processor'
import { processExport, type ExportJobData } from './export.processor'

/**
 * BullMQ worker for document parsing and classification.
 * Processing logic lives in document-parse.processor.ts (testable without Redis).
 */
export const documentParseWorker = new Worker<DocumentParseJobData>(
  QUEUE_DOCUMENT_PARSE,
  async (job: Job<DocumentParseJobData>) => processDocumentParse(job.data, job.id!),
  {
    connection: redisConnection,
    concurrency: 3,
  }
)

documentParseWorker.on('failed', (job, err) => {
  console.error(`[document-parse] job ${job?.id} failed:`, err.message)
})

// ── Export jobs (audit F1.3) — same worker process, own queue ───────────────
// ZIP building is I/O heavy: concurrency 1 keeps memory bounded.

export const exportWorker = new Worker<ExportJobData>(
  QUEUE_EXPORT,
  async (job: Job<ExportJobData>) => processExport(job.data, job.id!),
  {
    connection: redisConnection,
    concurrency: 1,
  }
)

exportWorker.on('failed', (job, err) => {
  console.error(`[export] job ${job?.id} failed:`, err.message)
})

export type { DocumentParseJobData }
