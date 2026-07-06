import { Worker, type Job } from 'bullmq'
import { redisConnection, QUEUE_DOCUMENT_PARSE } from '@/lib/redis'
import { processDocumentParse, type DocumentParseJobData } from './document-parse.processor'

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

export type { DocumentParseJobData }
