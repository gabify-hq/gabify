import { prisma } from '@/lib/prisma'
import { createEmailProvider } from '@/server/email-providers'
import { matchClientByEmail, assignClientToEmail } from '@/server/services/client-matching'
import { getDocumentParseQueue, DEFAULT_JOB_OPTIONS, QUEUE_EMAIL_SYNC } from '@/lib/redis'
import { createJobLog, updateJobLog } from './job-log'
import type { SyncResult } from '@/types'

export interface EmailSyncJobData {
  emailAccountId: string
  officeId: string
  triggerSource: 'webhook' | 'scheduled' | 'manual'
}

interface ParseJobQueue {
  add: (name: string, data: unknown, opts?: unknown) => Promise<unknown>
}

/**
 * Queues a document-parse job for every attachment of the account that has no
 * Document yet. Idempotent — attachments already parsed are skipped.
 */
export async function queuePendingAttachments(
  emailAccountId: string,
  officeId: string,
  queue?: ParseJobQueue
): Promise<number> {
  const attachments = await prisma.emailAttachment.findMany({
    where: {
      inboundEmail: { emailAccountId },
      document: null,
    },
    select: { id: true },
  })

  const docQueue = queue ?? getDocumentParseQueue()
  for (const attachment of attachments) {
    await docQueue.add(
      'parse-document',
      { attachmentId: attachment.id, emailAccountId, officeId },
      DEFAULT_JOB_OPTIONS
    )
  }
  return attachments.length
}

/**
 * Full email sync pipeline for one account:
 * sync inbox → match clients → queue attachment parsing. Logs to JobLog.
 */
export async function processEmailSync(
  data: EmailSyncJobData,
  jobId: string
): Promise<SyncResult> {
  const { emailAccountId, officeId } = data
  const jobLogId = await createJobLog(officeId, QUEUE_EMAIL_SYNC, jobId, data)

  try {
    await updateJobLog(jobLogId, 'RUNNING')

    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: emailAccountId },
    })

    const provider = createEmailProvider(account)
    const syncResult = await provider.syncInbox()

    // Match clients for ALL unmatched emails (not just recent)
    const unmatchedEmails = await prisma.inboundEmail.findMany({
      where: { emailAccountId, clientId: null },
      select: { id: true, fromEmail: true },
    })
    for (const email of unmatchedEmails) {
      const match = await matchClientByEmail(officeId, email.fromEmail)
      await assignClientToEmail(email.id, match)
    }

    await queuePendingAttachments(emailAccountId, officeId)

    await updateJobLog(jobLogId, 'COMPLETED', { syncResult })
    return syncResult
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    await updateJobLog(jobLogId, 'FAILED', undefined, errMsg)
    throw error
  }
}
