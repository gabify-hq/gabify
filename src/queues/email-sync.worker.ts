import { Worker, type Job } from 'bullmq'
import {
  redisConnection,
  QUEUE_EMAIL_SYNC,
  QUEUE_SUBSCRIPTION_RENEWAL,
  DEFAULT_JOB_OPTIONS,
  getEmailSyncQueue,
  getSubscriptionRenewalQueue,
} from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { validateSecurityEnv } from '@/lib/env-check'
import { processEmailSync, type EmailSyncJobData } from './email-sync.processor'
import { processSubscriptionRenewal } from './subscription-renewal.processor'
import { shouldPollOnTick } from './polling-policy'

// Fail-closed startup (§1.3): refuse to boot without security env vars
validateSecurityEnv()

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

// ── Subscription renewal (daily repeatable — §1.3) ─────────────────────────

export const subscriptionRenewalWorker = new Worker(
  QUEUE_SUBSCRIPTION_RENEWAL,
  async (job: Job) => processSubscriptionRenewal(job.id ?? `renewal-${Date.now()}`),
  { connection: redisConnection, concurrency: 1 }
)

subscriptionRenewalWorker.on('failed', (job, err) => {
  console.error(`[subscription-renewal] job ${job?.id} failed:`, err.message)
})

getSubscriptionRenewalQueue()
  .add(
    'renew-subscriptions',
    {},
    { repeat: { pattern: '0 4 * * *' }, ...DEFAULT_JOB_OPTIONS } // daily 04:00
  )
  .catch((err) => console.error('[subscription-renewal] failed to schedule:', err))

// ── Auto-polling scheduler ──────────────────────────────────────────────────

const POLL_INTERVAL_MS = Number(process.env.EMAIL_POLL_INTERVAL_MS ?? 30_000)
let pollTick = 0

async function schedulePollingJobs(): Promise<void> {
  pollTick += 1
  const now = new Date()
  const accounts = await prisma.emailAccount.findMany({
    where: { active: true },
    select: {
      id: true,
      officeId: true,
      provider: true,
      outlookSubscriptionId: true,
      outlookSubscriptionExpiry: true,
      pubSubSubscription: true,
      gmailWatchExpiry: true,
    },
  })

  // Webhook-backed accounts only poll every 10th tick (5 min fallback — §1.3)
  const toPoll = accounts.filter((account) => shouldPollOnTick(account, pollTick, now))

  if (toPoll.length === 0) return

  const queue = getEmailSyncQueue()
  for (const account of toPoll) {
    await queue.add(
      'sync-inbox',
      { emailAccountId: account.id, officeId: account.officeId, triggerSource: 'scheduled' },
      DEFAULT_JOB_OPTIONS
    )
  }

  console.log(`[email-sync] scheduled poll for ${toPoll.length}/${accounts.length} account(s)`)
}

// Run once on startup, then repeat on interval
schedulePollingJobs().catch((err) => console.error('[email-sync] scheduler error:', err))
setInterval(
  () => schedulePollingJobs().catch((err) => console.error('[email-sync] scheduler error:', err)),
  POLL_INTERVAL_MS,
)
