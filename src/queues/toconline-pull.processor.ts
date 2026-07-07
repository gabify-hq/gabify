import { prisma } from '@/lib/prisma'
import { createJobLog, updateJobLog } from './job-log'
import {
  pullSalesDocumentsForConnection,
  type ToconlinePullDeps,
  type ToconlinePullResult,
} from '@/server/toconline/toconline-pull-service'

/**
 * toconline-pull job processors (testable without Redis — the BullMQ shell
 * lives in toconline.worker.ts).
 *
 * - `processToconlinePull`: one connection per job. Idempotent by
 *   construction (ToconlineEntityMap dedup) so BullMQ retries are safe.
 * - `enqueuePullJobsForActiveConnections`: the repeatable scan — one job per
 *   pull-enabled, non-disabled connection.
 */

export interface ToconlinePullJobData {
  connectionId: string
  officeId: string
  userId: string | null
}

export async function processToconlinePull(
  data: ToconlinePullJobData,
  jobId: string,
  deps: ToconlinePullDeps = {},
): Promise<ToconlinePullResult> {
  const logId = await createJobLog(data.officeId, 'toconline-pull', jobId, {
    connectionId: data.connectionId,
  })
  await updateJobLog(logId, 'RUNNING')

  try {
    const result = await pullSalesDocumentsForConnection(
      { connectionId: data.connectionId, officeId: data.officeId, userId: data.userId },
      deps,
    )
    // Business refusals (pull disabled, connection off) complete the job —
    // the connection carries the error; only unexpected throws retry
    await updateJobLog(logId, 'COMPLETED', result, result.ok ? undefined : result.error)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown toconline-pull failure'
    await updateJobLog(logId, 'FAILED', undefined, message)
    throw error
  }
}

/** Scan used by the repeatable job: enqueue one pull per active connection. */
export async function enqueuePullJobsForActiveConnections(
  enqueue: (name: string, data: ToconlinePullJobData) => Promise<unknown>,
): Promise<number> {
  const connections = await prisma.toconlineConnection.findMany({
    where: { pullEnabled: true, status: { not: 'DISABLED' } },
    select: { id: true, officeId: true },
  })
  for (const connection of connections) {
    await enqueue('toconline-pull', {
      connectionId: connection.id,
      officeId: connection.officeId,
      userId: null, // scheduled runs are system-triggered
    })
  }
  return connections.length
}
