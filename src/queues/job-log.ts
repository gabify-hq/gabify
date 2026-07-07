import { prisma } from '@/lib/prisma'
import type { JobStatus } from '@prisma/client'

/** Shared JobLog helpers — every worker logs start and end (spec rule 6). */

export async function createJobLog(
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

export async function updateJobLog(
  id: string,
  status: Extract<JobStatus, 'RUNNING' | 'COMPLETED' | 'FAILED'>,
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
