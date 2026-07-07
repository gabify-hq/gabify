import { createJobLog, updateJobLog } from './job-log'
import {
  pushDocumentToToconline,
  type ToconlinePushDeps,
  type ToconlinePushOutcome,
} from '@/server/toconline/toconline-push-service'

/**
 * toconline-push job processor (testable without Redis — the BullMQ shell
 * lives in toconline-push.worker.ts). One job per document. Idempotent by
 * construction: the push service no-ops on SENT documents and the supplier
 * EntityMap survives partial failures, so BullMQ retries are safe.
 */

export interface ToconlinePushJobData {
  documentId: string
  officeId: string
  userId: string | null
}

export async function processToconlinePush(
  data: ToconlinePushJobData,
  jobId: string,
  deps: ToconlinePushDeps = {},
): Promise<ToconlinePushOutcome> {
  const logId = await createJobLog(data.officeId, 'toconline-push', jobId, {
    documentId: data.documentId,
  })
  await updateJobLog(logId, 'RUNNING')

  try {
    const outcome = await pushDocumentToToconline(
      { documentId: data.documentId, officeId: data.officeId, userId: data.userId },
      deps,
    )
    if (outcome.ok) {
      await updateJobLog(logId, 'COMPLETED', outcome)
    } else {
      // Business failure: the document carries the error (toconlinePushError);
      // the job itself completed its work — do NOT trigger a BullMQ retry storm
      await updateJobLog(logId, 'COMPLETED', outcome, outcome.error)
    }
    return outcome
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown toconline-push failure'
    await updateJobLog(logId, 'FAILED', undefined, message)
    throw error
  }
}
