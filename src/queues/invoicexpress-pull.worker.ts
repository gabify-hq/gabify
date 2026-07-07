import { Worker, type Job } from 'bullmq'
import {
  redisConnection,
  QUEUE_INVOICEXPRESS_PULL,
  getInvoicexpressPullQueue,
  DEFAULT_JOB_OPTIONS,
} from '@/lib/redis'
import {
  processInvoicexpressPull,
  enqueueInvoicexpressPullJobsForActiveConnections,
  type InvoicexpressPullJobData,
} from './invoicexpress-pull.processor'

/**
 * BullMQ worker for InvoiceXpress source pulls. Processing logic lives in
 * invoicexpress-pull.processor.ts (testable without Redis).
 *
 * The queue also hosts a repeatable "scan" job (INVOICEXPRESS_PULL_INTERVAL_MS,
 * default 30 min) that fans out one pull job per pull-enabled connection.
 * Concurrency 1 — the client rate-limits per connection (2 req/s).
 *
 * NOT registered in railway.toml until validated against a real InvoiceXpress
 * account.
 */

const PULL_SCAN_JOB = 'invoicexpress-pull-scan'
const DEFAULT_PULL_INTERVAL_MS = 30 * 60 * 1000

export const invoicexpressPullWorker = new Worker<InvoicexpressPullJobData | Record<string, never>>(
  QUEUE_INVOICEXPRESS_PULL,
  async (job: Job) => {
    if (job.name === PULL_SCAN_JOB) {
      const queue = getInvoicexpressPullQueue()
      return enqueueInvoicexpressPullJobsForActiveConnections((name, data) =>
        queue.add(name, data, DEFAULT_JOB_OPTIONS),
      )
    }
    return processInvoicexpressPull(job.data as InvoicexpressPullJobData, job.id!)
  },
  {
    connection: redisConnection,
    concurrency: 1,
  },
)

invoicexpressPullWorker.on('failed', (job, err) => {
  console.error(`[invoicexpress-pull] job ${job?.id} failed:`, err.message)
})

/** Register (or refresh) the repeatable scan — called at worker startup. */
export async function registerInvoicexpressPullScan(): Promise<void> {
  const every = Number(process.env.INVOICEXPRESS_PULL_INTERVAL_MS ?? DEFAULT_PULL_INTERVAL_MS)
  const queue = getInvoicexpressPullQueue()
  await queue.add(PULL_SCAN_JOB, {}, { repeat: { every }, removeOnComplete: { count: 10 } })
}

export type { InvoicexpressPullJobData }
