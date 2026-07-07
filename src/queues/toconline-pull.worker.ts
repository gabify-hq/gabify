import { Worker, type Job } from 'bullmq'
import {
  redisConnection,
  QUEUE_TOCONLINE_PULL,
  getToconlinePullQueue,
  DEFAULT_JOB_OPTIONS,
} from '@/lib/redis'
import {
  processToconlinePull,
  enqueuePullJobsForActiveConnections,
  type ToconlinePullJobData,
} from './toconline-pull.processor'

/**
 * BullMQ worker for TOConline sales pulls. Processing logic lives in
 * toconline-pull.processor.ts (testable without Redis).
 *
 * The queue also hosts a repeatable "scan" job (TOCONLINE_PULL_INTERVAL_MS,
 * default 30 min) that fans out one pull job per pull-enabled connection.
 * Concurrency 1 — the client rate-limits per connection anyway (2 req/s).
 */

const PULL_SCAN_JOB = 'toconline-pull-scan'
const DEFAULT_PULL_INTERVAL_MS = 30 * 60 * 1000

export const toconlinePullWorker = new Worker<ToconlinePullJobData | Record<string, never>>(
  QUEUE_TOCONLINE_PULL,
  async (job: Job) => {
    if (job.name === PULL_SCAN_JOB) {
      const queue = getToconlinePullQueue()
      return enqueuePullJobsForActiveConnections((name, data) =>
        queue.add(name, data, DEFAULT_JOB_OPTIONS),
      )
    }
    return processToconlinePull(job.data as ToconlinePullJobData, job.id!)
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
)

toconlinePullWorker.on('failed', (job, err) => {
  console.error(`[toconline-pull] job ${job?.id} failed:`, err.message)
})

/** Register (or refresh) the repeatable scan — called at worker startup. */
export async function registerToconlinePullScan(): Promise<void> {
  const every = Number(process.env.TOCONLINE_PULL_INTERVAL_MS ?? DEFAULT_PULL_INTERVAL_MS)
  const queue = getToconlinePullQueue()
  await queue.add(PULL_SCAN_JOB, {}, { repeat: { every }, removeOnComplete: { count: 10 } })
}

export type { ToconlinePullJobData }
