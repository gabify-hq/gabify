import { Worker, type Job } from 'bullmq'
import {
  redisConnection,
  QUEUE_EMAIL_SYNC,
  DEFAULT_JOB_OPTIONS,
  getDocumentParseQueue,
} from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { createEmailProvider } from '@/server/email-providers'
import { matchClientByEmail, assignClientToEmail } from '@/server/services/client-matching'

export interface EmailSyncJobData {
  emailAccountId: string
  officeId: string
  triggerSource: 'webhook' | 'scheduled' | 'manual'
}

/**
 * BullMQ worker for email inbox synchronisation.
 * Processes jobs from the "email-sync" queue.
 *
 * Flow:
 * 1. Load EmailAccount from DB
 * 2. Create provider via factory (Outlook/Gmail/IMAP)
 * 3. Call syncInbox() — incremental sync
 * 4. For each new InboundEmail: run client matching
 * 5. For each email with attachments: queue document-parse jobs
 * 6. Log result to JobLog
 *
 * Workers must be idempotent — Graph may send duplicate webhook notifications.
 */
export const emailSyncWorker = new Worker<EmailSyncJobData>(
  QUEUE_EMAIL_SYNC,
  async (job: Job<EmailSyncJobData>) => {
    const { emailAccountId, officeId } = job.data
    const jobLogId = await createJobLog(officeId, QUEUE_EMAIL_SYNC, job.id!, job.data)

    try {
      await updateJobLog(jobLogId, 'RUNNING')

      // 1. Load email account
      const account = await prisma.emailAccount.findUniqueOrThrow({
        where: { id: emailAccountId },
      })

      // 2. Create provider
      const provider = createEmailProvider(account)

      // 3. Sync inbox
      const syncResult = await provider.syncInbox()

      // 4. Match clients for ALL unmatched emails (not just recent)
      const newEmails = await prisma.inboundEmail.findMany({
        where: {
          emailAccountId,
          clientId: null,
        },
        select: { id: true, fromEmail: true },
      })

      for (const email of newEmails) {
        const match = await matchClientByEmail(officeId, email.fromEmail)
        await assignClientToEmail(email.id, match)
      }

      // 5. Queue document parsing for new attachments
      const attachments = await prisma.emailAttachment.findMany({
        where: {
          inboundEmail: { emailAccountId },
          uploadedAt: null,
          r2Key: null,
          document: null,
        },
        select: { id: true, inboundEmailId: true },
      })

      const docQueue = getDocumentParseQueue()
      for (const attachment of attachments) {
        await docQueue.add(
          'parse-document',
          { attachmentId: attachment.id, emailAccountId, officeId },
          DEFAULT_JOB_OPTIONS
        )
      }

      await updateJobLog(jobLogId, 'COMPLETED', { syncResult })
      return syncResult
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      await updateJobLog(jobLogId, 'FAILED', undefined, errMsg)
      throw error
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
)

emailSyncWorker.on('failed', (job, err) => {
  console.error(`[email-sync] job ${job?.id} failed:`, err.message)
})

// ── Helpers ──

async function createJobLog(
  officeId: string,
  queue: string,
  jobId: string,
  payload: unknown
): Promise<string> {
  const log = await prisma.jobLog.create({
    data: { officeId, queue, jobId, status: 'QUEUED', payload: payload as object },
  })
  return log.id
}

async function updateJobLog(
  id: string,
  status: 'RUNNING' | 'COMPLETED' | 'FAILED',
  result?: unknown,
  error?: string
): Promise<void> {
  await prisma.jobLog.update({
    where: { id },
    data: {
      status,
      result: result as object | undefined,
      error,
      startedAt: status === 'RUNNING' ? new Date() : undefined,
      completedAt: status !== 'RUNNING' ? new Date() : undefined,
    },
  })
}
