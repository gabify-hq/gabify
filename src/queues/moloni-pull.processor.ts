import { prisma } from '@/lib/prisma'
import { createJobLog, updateJobLog } from './job-log'
import {
  pullDocumentsForMoloniConnection,
  type MoloniPullDeps,
} from '@/server/sources/moloni/moloni-pull-service'
import type { SourcePullResult } from '@/server/sources/source-pull'

/**
 * moloni-pull job processors (testable without Redis — the BullMQ shell lives
 * in moloni-pull.worker.ts).
 *
 * - `processMoloniPull`: one connection per job. Idempotent by construction
 *   (SourceEntityMap dedup) so BullMQ retries are safe.
 * - `enqueueMoloniPullJobsForActiveConnections`: the repeatable scan — one job
 *   per pull-enabled, non-disabled connection.
 */

export interface MoloniPullJobData {
  connectionId: string
  officeId: string
  userId: string | null
}

export async function processMoloniPull(
  data: MoloniPullJobData,
  jobId: string,
  deps: MoloniPullDeps = {},
): Promise<SourcePullResult> {
  const logId = await createJobLog(data.officeId, 'moloni-pull', jobId, {
    connectionId: data.connectionId,
  })
  await updateJobLog(logId, 'RUNNING')

  try {
    const result = await pullDocumentsForMoloniConnection(
      { connectionId: data.connectionId, officeId: data.officeId, userId: data.userId },
      deps,
    )
    await updateJobLog(logId, 'COMPLETED', result, result.ok ? undefined : result.error)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown moloni-pull failure'
    await updateJobLog(logId, 'FAILED', undefined, message)
    throw error
  }
}

/** Scan used by the repeatable job: enqueue one pull per active connection. */
export async function enqueueMoloniPullJobsForActiveConnections(
  enqueue: (name: string, data: MoloniPullJobData) => Promise<unknown>,
): Promise<number> {
  const connections = await prisma.moloniConnection.findMany({
    where: { pullEnabled: true, status: { not: 'DESLIGADA' }, deletedAt: null },
    select: { id: true, officeId: true },
  })
  for (const connection of connections) {
    await enqueue('moloni-pull', {
      connectionId: connection.id,
      officeId: connection.officeId,
      userId: null, // scheduled runs are system-triggered
    })
  }
  return connections.length
}
