import { ClipboardCheck } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ReviewQueue, type ReviewItemDTO } from '@/components/dashboard/review-queue'
import { DOCUMENT_TYPE_LABELS } from '@/lib/document-types'
import type { DocumentType } from '@/types'

/** Document review queue (S3.1) — NEEDS_REVIEW + PRE_VALIDATED, office-scoped. */
export default async function ReviewPage() {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  const documents = officeId
    ? await prisma.document.findMany({
        where: {
          officeId,
          deletedAt: null,
          status: { in: ['NEEDS_REVIEW', 'PRE_VALIDATED'] },
          parentDocumentId: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          version: true,
          status: true,
          type: true,
          confidence: true,
          supplierName: true,
          supplierNif: true,
          documentNumber: true,
          issueDate: true,
          totalAmount: true,
          flags: true,
          originalFilename: true,
          client: { select: { name: true } },
          attachment: { select: { filename: true } },
        },
      })
    : []

  const items: ReviewItemDTO[] = documents.map((d) => ({
    id: d.id,
    version: d.version,
    status: d.status as ReviewItemDTO['status'],
    typeLabel: DOCUMENT_TYPE_LABELS[d.type as DocumentType] ?? d.type,
    supplierName: d.supplierName,
    supplierNif: d.supplierNif,
    documentNumber: d.documentNumber,
    issueDate: d.issueDate ? d.issueDate.toLocaleDateString('pt-PT') : null,
    totalAmount: d.totalAmount !== null ? Number(d.totalAmount) : null,
    flags: d.flags,
    filename: d.originalFilename ?? d.attachment?.filename ?? d.id,
    clientName: d.client?.name ?? null,
  }))

  const preValidated = items.filter((i) => i.status === 'PRE_VALIDATED').length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck className="h-4 w-4 stroke-[1.75] text-gray-400" />
          <h1 className="text-[13px] font-semibold text-gray-800">Fila de revisão</h1>
          <span className="data rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-400">
            {items.length}
          </span>
        </div>
        {preValidated > 0 && (
          <span className="text-[11px] font-medium text-green-700">
            {preValidated} pré-validado{preValidated !== 1 ? 's' : ''} prontos para validar
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <ReviewQueue items={items} />
      </div>
    </div>
  )
}
