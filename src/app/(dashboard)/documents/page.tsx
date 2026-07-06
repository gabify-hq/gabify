import { FileText } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DocumentTable } from '@/components/dashboard/document-table'
import { DOCUMENT_TYPE_LABELS } from '@/lib/document-types'
import type { DocumentDTO } from '@/server/dto'
import type { DocumentType } from '@/types'

export default async function DocumentsPage() {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  const clients = officeId
    ? await prisma.client.findMany({
        where: { officeId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      })
    : []

  const dbDocuments = officeId
    ? await prisma.document.findMany({
        where: {
          attachment: {
            inboundEmail: {
              emailAccount: { officeId },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          type: true,
          status: true,
          confidence: true,
          r2Key: true,
          extractedDate: true,
          extractedAmount: true,
          extractedVATNumber: true,
          classificationSource: true,
          createdAt: true,
          clientId: true,
          client: { select: { name: true } },
          attachment: {
            select: {
              filename: true,
            },
          },
        },
      })
    : []

  // Map DB records to the shape DocumentTable expects
  const documents: DocumentDTO[] = dbDocuments.map((doc) => {
    const type = (doc.type ?? 'OTHER') as DocumentType
    const confidence = doc.confidence ?? 0

    // Derive period from extractedDate or createdAt
    const dateRef = doc.extractedDate ?? doc.createdAt
    const period = dateRef
      ? `${String(dateRef.getMonth() + 1).padStart(2, '0')}/${dateRef.getFullYear()}`
      : '-'

    // Map DB status to the 3 display states the table knows
    const status: DocumentDTO['status'] =
      doc.status === 'CLASSIFIED'
        ? 'CLASSIFIED'
        : doc.status === 'NEEDS_REVIEW' || doc.status === 'PENDING_CLASSIFICATION'
          ? 'NEEDS_REVIEW'
          : 'REVIEWED'

    return {
      id: doc.id,
      clientId: doc.clientId ?? '',
      clientName: doc.client?.name ?? 'Sem cliente',
      filename: doc.attachment?.filename ?? doc.id,
      type,
      typeLabel: DOCUMENT_TYPE_LABELS[type] ?? type,
      confidence,
      status,
      extractedDate: doc.extractedDate
        ? doc.extractedDate.toLocaleDateString('pt-PT')
        : null,
      extractedAmount: doc.extractedAmount ?? null,
      extractedVATNumber: doc.extractedVATNumber ?? null,
      r2Key: doc.r2Key ?? '',
      createdAt: doc.createdAt,
      period,
      classificationSource: doc.classificationSource ?? null,
    }
  })

  const needsReview = documents.filter((d) => d.status === 'NEEDS_REVIEW').length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 stroke-[1.75] text-gray-400" />
          <h1 className="text-[13px] font-semibold text-gray-800">Documentos</h1>
          <span className="data rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-400">
            {documents.length}
          </span>
        </div>
        {needsReview > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="text-[11px] font-medium text-amber-400">
              {needsReview} para rever
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <DocumentTable documents={documents} clients={clients} />
      </div>
    </div>
  )
}
