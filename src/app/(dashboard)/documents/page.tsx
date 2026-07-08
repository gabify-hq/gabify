import Link from 'next/link'
import { FileText, FileSpreadsheet } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listOfficeDocuments } from '@/server/services/document-service'
import { DocumentTable } from '@/components/dashboard/document-table'
import { UploadDocuments } from '@/components/dashboard/upload-documents'
import type { DocumentDTO } from '@/server/dto'

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

  // Every intake source (EMAIL, MANUAL_UPLOAD, IMPORT, PORTAL_UPLOAD, API_PULL)
  // — office-scoped directly, never via the email-attachment chain (audit F1.2)
  const rows = officeId ? await listOfficeDocuments(officeId) : []

  const documents: DocumentDTO[] = rows.map((doc) => {
    const dateRef = doc.extractedDate ?? doc.createdAt
    return {
      id: doc.id,
      clientId: doc.clientId ?? '',
      clientName: doc.clientName ?? 'Sem cliente',
      filename: doc.filename,
      type: doc.type,
      typeLabel: doc.typeLabel,
      confidence: doc.confidence,
      status: doc.status,
      source: doc.source,
      sourceLabel: doc.sourceLabel,
      extractedDate: doc.extractedDate ? doc.extractedDate.toLocaleDateString('pt-PT') : null,
      extractedAmount: doc.extractedAmount,
      extractedVATNumber: doc.extractedVATNumber,
      r2Key: doc.r2Key ?? '',
      createdAt: doc.createdAt,
      period: `${String(dateRef.getMonth() + 1).padStart(2, '0')}/${dateRef.getFullYear()}`,
      classificationSource: doc.classificationSource,
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
        <div className="flex items-center gap-3">
          {needsReview > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-[11px] font-medium text-amber-400">
                {needsReview} para rever
              </span>
            </div>
          )}
          <Link
            href="/documents/import"
            className="pressable flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-300"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 stroke-[1.75]" />
            Importar folha
          </Link>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <UploadDocuments clients={clients} />
        <DocumentTable documents={documents} clients={clients} />
      </div>
    </div>
  )
}
