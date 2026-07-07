import { prisma } from '@/lib/prisma'
import { createJobLog, updateJobLog } from './job-log'
import {
  pullDocumentsForInvoicexpressConnection,
  type InvoicexpressPullDeps,
} from '@/server/sources/invoicexpress/invoicexpress-pull-service'
import type { SourcePullResult } from '@/server/sources/source-pull'

/**
 * invoicexpress-pull job processors (testable without Redis — the BullMQ shell
 * lives in invoicexpress-pull.worker.ts).
 *
 * - `processInvoicexpressPull`: one connection per job. Idempotent by
 *   construction (SourceEntityMap dedup) so BullMQ retries are safe.
 * - `enqueueInvoicexpressPullJobsForActiveConnections`: the repeatable scan —
 *   one job per pull-enabled, non-disabled connection.
 */

export interface InvoicexpressPullJobData {
  connectionId: string
  officeId: string
  userId: string | null
}

export async function processInvoicexpressPull(
  data: InvoicexpressPullJobData,
  jobId: string,
  deps: InvoicexpressPullDeps = {},
): Promise<SourcePullResult> {
  const logId = await createJobLog(data.officeId, 'invoicexpress-pull', jobId, {
    connectionId: data.connectionId,
  })
  await updateJobLog(logId, 'RUNNING')

  try {
    const result = await pullDocumentsForInvoicexpressConnection(
      { connectionId: data.connectionId, officeId: data.officeId, userId: data.userId },
      deps,
    )
    await updateJobLog(logId, 'COMPLETED', result, result.ok ? undefined : result.error)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown invoicexpress-pull failure'
    await updateJobLog(logId, 'FAILED', undefined, message)
    throw error
  }
}

/** Scan used by the repeatable job: enqueue one pull per active connection. */
export async function enqueueInvoicexpressPullJobsForActiveConnections(
  enqueue: (name: string, data: InvoicexpressPullJobData) => Promise<unknown>,
): Promise<number> {
  const connections = await prisma.invoicexpressConnection.findMany({
    where: { pullEnabled: true, status: { not: 'DESLIGADA' }, deletedAt: null },
    select: { id: true, officeId: true },
  })
  for (const connection of connections) {
    await enqueue('invoicexpress-pull', {
      connectionId: connection.id,
      officeId: connection.officeId,
      userId: null,
    })
  }
  return connections.length
}
