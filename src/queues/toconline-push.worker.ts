import { Worker, type Job } from 'bullmq'
import { redisConnection, QUEUE_TOCONLINE_PUSH } from '@/lib/redis'
import { processToconlinePush, type ToconlinePushJobData } from './toconline-push.processor'

/**
 * BullMQ worker for TOConline purchase pushes. Processing logic lives in
 * toconline-push.processor.ts (testable without Redis). Concurrency 1: the
 * client already rate-limits per connection (2 req/s), and pushes are rare
 * accountant-triggered actions — sequential is the safe default for an
 * integration that was NEVER tested against the real API.
 */
export const toconlinePushWorker = new Worker<ToconlinePushJobData>(
  QUEUE_TOCONLINE_PUSH,
  async (job: Job<ToconlinePushJobData>) => processToconlinePush(job.data, job.id!),
  {
    connection: redisConnection,
    concurrency: 1,
  }
)

toconlinePushWorker.on('failed', (job, err) => {
  console.error(`[toconline-push] job ${job?.id} failed:`, err.message)
})

export type { ToconlinePushJobData }
