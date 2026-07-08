import { notFound } from 'next/navigation'
import { Activity } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'

const RECENT_LOGS_LIMIT = 100

const STATUS_LABELS: Record<string, string> = {
  QUEUED: 'Em fila',
  RUNNING: 'A correr',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
  RETRYING: 'A repetir',
}

/**
 * /admin/jobs — minimal operational visibility (audit F3.12 — A-5).
 * OWNER-only read of the existing JobLog: recent runs per queue, failures in
 * red, attempt counts (same jobId = BullMQ retries). No new framework, no
 * external alerting — that stays documented as future work (BACKLOG.md).
 */
export default async function AdminJobsPage() {
  const session = await auth()
  if (session?.user?.role !== 'OWNER' || !session.user.officeId) {
    notFound()
  }
  const officeId = session.user.officeId

  const logs = await prisma.jobLog.findMany({
    where: { officeId },
    orderBy: { createdAt: 'desc' },
    take: RECENT_LOGS_LIMIT,
    select: {
      id: true,
      queue: true,
      jobId: true,
      status: true,
      error: true,
      createdAt: true,
      completedAt: true,
    },
  })

  // Attempts per jobId — BullMQ retries reuse the id, each run logs a row
  const attemptsByJobId = new Map<string, number>()
  for (const log of logs) {
    attemptsByJobId.set(log.jobId, (attemptsByJobId.get(log.jobId) ?? 0) + 1)
  }

  // Per-queue summary: last run + failures within the listed window
  const queues = new Map<string, { total: number; failed: number; lastAt: Date }>()
  for (const log of logs) {
    const agg = queues.get(log.queue) ?? { total: 0, failed: 0, lastAt: log.createdAt }
    agg.total += 1
    if (log.status === 'FAILED') agg.failed += 1
    if (log.createdAt > agg.lastAt) agg.lastAt = log.createdAt
    queues.set(log.queue, agg)
  }

  const formatDateTime = (date: Date) =>
    date.toLocaleString('pt-PT', {
      timeZone: 'Europe/Lisbon',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-3">
        <Activity className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h1 className="text-[13px] font-semibold text-gray-800">Execuções de tarefas</h1>
        <span className="data rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-400">
          últimas {logs.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {/* Per-queue summary */}
        <div className="flex flex-wrap gap-2">
          {[...queues.entries()].map(([queue, agg]) => (
            <div
              key={queue}
              className={cn(
                'rounded-xl border bg-white px-4 py-3 shadow-sm',
                agg.failed > 0 ? 'border-red-200' : 'border-gray-200',
              )}
            >
              <p className="data text-[11px] font-bold text-gray-700">{queue}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {agg.total} execução{agg.total !== 1 ? 'ões' : ''} ·{' '}
                {agg.failed > 0 ? (
                  <span className="font-bold text-red-600">{agg.failed} falhada{agg.failed !== 1 ? 's' : ''}</span>
                ) : (
                  <span className="text-green-600">sem falhas</span>
                )}
              </p>
              <p className="data mt-0.5 text-[10px] text-gray-400">
                Última: {formatDateTime(agg.lastAt)}
              </p>
            </div>
          ))}
          {queues.size === 0 && (
            <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-[12px] text-gray-400">
              Ainda não há execuções registadas.
            </p>
          )}
        </div>

        {/* Recent runs */}
        <ul className="space-y-1.5">
          {logs.map((log) => {
            const attempts = attemptsByJobId.get(log.jobId) ?? 1
            const failed = log.status === 'FAILED'
            return (
              <li
                key={log.id}
                className={cn(
                  'rounded-xl border bg-white px-3 py-2 shadow-sm',
                  failed ? 'border-red-200' : 'border-gray-200',
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="data text-[11px] text-gray-400">
                    {formatDateTime(log.createdAt)}
                  </span>
                  <span className="data text-[11px] font-bold text-gray-700">{log.queue}</span>
                  <span className="data min-w-0 flex-1 truncate text-[11px] text-gray-400">
                    {log.jobId}
                  </span>
                  {attempts > 1 && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                      {attempts} tentativas
                    </span>
                  )}
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                      failed
                        ? 'bg-red-50 text-red-600 ring-red-200'
                        : log.status === 'COMPLETED'
                          ? 'bg-green-50 text-green-700 ring-green-200'
                          : 'bg-blue-50 text-blue-700 ring-blue-200',
                    )}
                  >
                    {STATUS_LABELS[log.status] ?? log.status}
                  </span>
                </div>
                {log.error && (
                  <p className="data mt-1 break-all rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-700">
                    {log.error}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
