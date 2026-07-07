import { Worker, type Job } from 'bullmq'
import {
  redisConnection,
  QUEUE_MOLONI_PULL,
  getMoloniPullQueue,
  DEFAULT_JOB_OPTIONS,
} from '@/lib/redis'
import {
  processMoloniPull,
  enqueueMoloniPullJobsForActiveConnections,
  type MoloniPullJobData,
} from './moloni-pull.processor'

/**
 * BullMQ worker for Moloni source pulls. Processing logic lives in
 * moloni-pull.processor.ts (testable without Redis).
 *
 * The queue also hosts a repeatable "scan" job (MOLONI_PULL_INTERVAL_MS,
 * default 30 min) that fans out one pull job per pull-enabled connection.
 * Concurrency 1 — the Moloni client rate-limits per connection (2 req/s).
 *
 * NOT registered in railway.toml until validated against a real Moloni account.
 */

const PULL_SCAN_JOB = 'moloni-pull-scan'
const DEFAULT_PULL_INTERVAL_MS = 30 * 60 * 1000

export const moloniPullWorker = new Worker<MoloniPullJobData | Record<string, never>>(
  QUEUE_MOLONI_PULL,
  async (job: Job) => {
    if (job.name === PULL_SCAN_JOB) {
      const queue = getMoloniPullQueue()
      return enqueueMoloniPullJobsForActiveConnections((name, data) =>
        queue.add(name, data, DEFAULT_JOB_OPTIONS),
      )
    }
    return processMoloniPull(job.data as MoloniPullJobData, job.id!)
  },
  {
    connection: redisConnection,
    concurrency: 1,
  },
)

moloniPullWorker.on('failed', (job, err) => {
  console.error(`[moloni-pull] job ${job?.id} failed:`, err.message)
})

/** Register (or refresh) the repeatable scan — called at worker startup. */
export async function registerMoloniPullScan(): Promise<void> {
  const every = Number(process.env.MOLONI_PULL_INTERVAL_MS ?? DEFAULT_PULL_INTERVAL_MS)
  const queue = getMoloniPullQueue()
  await queue.add(PULL_SCAN_JOB, {}, { repeat: { every }, removeOnComplete: { count: 10 } })
}

export type { MoloniPullJobData }
