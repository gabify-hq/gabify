import { FolderDown } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { can } from '@/server/authz/can'
import { ExportForm } from '@/components/dashboard/export-form'
import { ExportHistory, type ExportBatchDTO } from '@/components/dashboard/export-history'

interface BatchFilters {
  clientIds?: string[] | null
  periodFrom?: string
  periodTo?: string
}

function periodLabel(filters: BatchFilters): string {
  const from = filters.periodFrom ?? '—'
  const to = filters.periodTo ?? '—'
  return from === to ? from : `${from} → ${to}`
}

/**
 * /exports — trigger + history for the file export engine (audit F1.3 / C-3).
 * The engine (export-service) is untouched: this page enqueues jobs and reads
 * the ExportBatch history.
 */
export default async function ExportsPage() {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''
  const canRun = can(session?.user?.role, 'export:run')

  const [clients, dbBatches] = await Promise.all([
    officeId
      ? prisma.client.findMany({
          where: { officeId, deletedAt: null },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    officeId
      ? prisma.exportBatch.findMany({
          where: { officeId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            status: true,
            filters: true,
            documentCount: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ])

  const clientNameById = new Map(clients.map((c) => [c.id, c.name]))
  const batches: ExportBatchDTO[] = dbBatches.map((batch) => {
    const filters = (batch.filters ?? {}) as BatchFilters
    const ids = filters.clientIds ?? null
    const clientsLabel =
      ids && ids.length > 0
        ? ids.map((id) => clientNameById.get(id) ?? 'Cliente removido').join(', ')
        : 'Todos os clientes'
    return {
      id: batch.id,
      status: batch.status,
      periodLabel: periodLabel(filters),
      clientsLabel,
      documentCount: batch.documentCount,
      createdAt: batch.createdAt.toLocaleString('pt-PT', {
        timeZone: 'Europe/Lisbon',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-3">
        <FolderDown className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h1 className="text-[13px] font-semibold text-gray-800">Exportar</h1>
        <span className="data rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-400">
          {batches.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {canRun ? (
          <ExportForm clients={clients} />
        ) : (
          <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[12px] text-gray-500">
            O seu perfil é apenas de consulta — a exportação está reservada a quem pode
            alterar dados. Pode consultar o histórico abaixo.
          </p>
        )}
        <ExportHistory batches={batches} />
      </div>
    </div>
  )
}
