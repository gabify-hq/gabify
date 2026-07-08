import { prisma } from '@/lib/prisma'
import { runExport } from '@/server/services/export-service'
import { QUEUE_EXPORT } from '@/lib/redis'
import { createJobLog, updateJobLog } from './job-log'

/**
 * Export job (audit F1.3 — C-3): the POST route only enqueues; THIS runs the
 * existing export engine off the request path. Failures never vanish: an
 * invalid/failed run leaves a FAILED ExportBatch row (visible in the history
 * UI) plus the JobLog entry.
 */

export interface ExportJobData {
  officeId: string
  userId: string
  clientIds?: string[]
  periodFrom: string
  periodTo: string
  includeExported: boolean
}

export type ExportJobResult =
  | { ok: true; batchId: string; documentCount: number }
  | { ok: false; error: string }

export async function processExport(
  data: ExportJobData,
  jobId: string,
): Promise<ExportJobResult> {
  const jobLogId = await createJobLog(data.officeId, QUEUE_EXPORT, jobId, data)

  try {
    await updateJobLog(jobLogId, 'RUNNING')

    const result = await runExport({
      officeId: data.officeId,
      userId: data.userId,
      clientIds: data.clientIds,
      periodFrom: data.periodFrom,
      periodTo: data.periodTo,
      includeExported: data.includeExported,
    })

    if (!result.ok) {
      // Engine refused (invalid period, etc.) — record a FAILED batch so the
      // history shows the attempt instead of silently dropping it
      await prisma.exportBatch.create({
        data: {
          officeId: data.officeId,
          createdByUserId: data.userId,
          filters: {
            clientIds: data.clientIds ?? null,
            periodFrom: data.periodFrom,
            periodTo: data.periodTo,
            includeExported: data.includeExported,
          },
          status: 'FAILED',
          documentCount: 0,
        },
      })
      await updateJobLog(jobLogId, 'FAILED', undefined, result.error)
      return { ok: false, error: result.error }
    }

    await updateJobLog(jobLogId, 'COMPLETED', {
      batchId: result.batchId,
      documentCount: result.documentCount,
    })
    return { ok: true, batchId: result.batchId, documentCount: result.documentCount }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    // Unexpected crash mid-run: the engine's own batch (if created) stays
    // PENDING — mark it FAILED so the history never shows a zombie
    await prisma.exportBatch.updateMany({
      where: { officeId: data.officeId, createdByUserId: data.userId, status: 'PENDING' },
      data: { status: 'FAILED' },
    })
    await updateJobLog(jobLogId, 'FAILED', undefined, errMsg)
    throw error
  }
}
