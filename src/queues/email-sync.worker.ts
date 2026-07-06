import { Worker, type Job } from 'bullmq'
import {
  redisConnection,
  QUEUE_EMAIL_SYNC,
  DEFAULT_JOB_OPTIONS,
  getEmailSyncQueue,
} from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { processEmailSync, type EmailSyncJobData } from './email-sync.processor'

/**
 * BullMQ worker for email inbox synchronisation.
 * Processing logic lives in email-sync.processor.ts (testable without Redis).
 */
export const emailSyncWorker = new Worker<EmailSyncJobData>(
  QUEUE_EMAIL_SYNC,
  async (job: Job<EmailSyncJobData>) => processEmailSync(job.data, job.id!),
  {
    connection: redisConnection,
    concurrency: 5,
  }
)

emailSyncWorker.on('completed', (job) => {
  console.log(`[email-sync] job ${job.id} completed`)
})

emailSyncWorker.on('failed', (job, err) => {
  console.error(`[email-sync] job ${job?.id} failed:`, err.message)
})

emailSyncWorker.on('error', (err) => {
  console.error('[email-sync] worker error:', err.message)
})

// ── Auto-polling scheduler ──────────────────────────────────────────────────

const POLL_INTERVAL_MS = Number(process.env.EMAIL_POLL_INTERVAL_MS ?? 30_000)

async function schedulePollingJobs(): Promise<void> {
  const accounts = await prisma.emailAccount.findMany({
    where: { active: true },
    select: { id: true, officeId: true },
  })

  if (accounts.length === 0) {
    console.log('[email-sync] no active accounts to poll')
    return
  }

  const queue = getEmailSyncQueue()
  for (const account of accounts) {
    await queue.add(
      'sync-inbox',
      { emailAccountId: account.id, officeId: account.officeId, triggerSource: 'scheduled' },
      DEFAULT_JOB_OPTIONS
    )
  }

  console.log(`[email-sync] scheduled poll for ${accounts.length} account(s)`)
}

// Run once on startup, then repeat on interval
schedulePollingJobs().catch((err) => console.error('[email-sync] scheduler error:', err))
setInterval(
  () => schedulePollingJobs().catch((err) => console.error('[email-sync] scheduler error:', err)),
  POLL_INTERVAL_MS,
)
