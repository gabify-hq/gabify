import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DocumentCorrectionForm, type CorrectionDocumentDTO } from '@/components/dashboard/document-correction-form'
import { DOCUMENT_TYPE_LABELS } from '@/lib/document-types'
import type { DocumentType } from '@/types'

interface ReviewDetailPageProps {
  params: Promise<{ documentId: string }>
}

/** Document review detail (S3.1): file preview + field-by-field correction. */
export default async function ReviewDetailPage({ params }: ReviewDetailPageProps) {
  const { documentId } = await params
  const session = await auth()
  if (!session?.user?.officeId) notFound()
  const officeId = session.user.officeId

  const doc = await prisma.document.findFirst({
    where: { id: documentId, officeId, deletedAt: null },
    include: {
      client: { select: { id: true, name: true } },
      attachment: { select: { filename: true } },
    },
  })
  if (!doc) notFound()

  const clients = await prisma.client.findMany({
    where: { officeId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  const vatBreakdown =
    (doc.vatBreakdown as Array<{ region?: string; rate: number; baseCents: number; vatCents: number }> | null) ?? []

  const dto: CorrectionDocumentDTO = {
    id: doc.id,
    version: doc.version,
    status: doc.status,
    type: doc.type,
    typeLabel: DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type,
    filename: doc.originalFilename ?? doc.attachment?.filename ?? doc.id,
    mimeType: doc.mimeType ?? 'application/pdf',
    hasFile: doc.r2Key !== null,
    confidence: doc.confidence,
    extractionSource: doc.extractionSource,
    flags: doc.flags,
    supplierName: doc.supplierName,
    supplierNif: doc.supplierNif,
    documentNumber: doc.documentNumber,
    issueDate: doc.issueDate ? doc.issueDate.toLocaleDateString('pt-PT') : '',
    dueDate: doc.dueDate ? doc.dueDate.toLocaleDateString('pt-PT') : null,
    currency: doc.currency,
    vatBreakdown,
    withholdingCents: doc.withholdingAmount !== null ? Math.round(Number(doc.withholdingAmount) * 100) : null,
    totalCents: doc.totalAmount !== null ? Math.round(Number(doc.totalAmount) * 100) : null,
    accountCode: doc.accountCode ?? doc.suggestedAccountCode,
    accountIsSuggestion: doc.accountCode === null && doc.suggestedAccountCode !== null,
    vatTreatment: doc.vatTreatment ?? doc.suggestedVatTreatment,
    clientId: doc.clientId,
    suggestedClientId: doc.suggestedClientId,
  }

  return (
    <DocumentCorrectionForm
      document={dto}
      clients={clients}
      role={session.user.role}
    />
  )
}
