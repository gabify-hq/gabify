import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ReviewQueue, type ReviewItemDTO } from '@/components/dashboard/review-queue'
import { DOCUMENT_TYPE_LABELS } from '@/lib/document-types'
import type { DocumentType } from '@/types'

interface ReviewPageProps {
  searchParams: Promise<{ status?: string; clientId?: string; flag?: string }>
}

/** Document review queue (S3.1) — NEEDS_REVIEW + PRE_VALIDATED, office-scoped, filterable. */
export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''
  const { status, clientId, flag } = await searchParams

  const statusFilter =
    status === 'NEEDS_REVIEW' || status === 'PRE_VALIDATED'
      ? [status]
      : (['NEEDS_REVIEW', 'PRE_VALIDATED'] as const)

  const documents = officeId
    ? await prisma.document.findMany({
        where: {
          officeId,
          deletedAt: null,
          status: { in: statusFilter as never },
          parentDocumentId: null,
          ...(clientId ? { clientId } : {}),
          ...(flag ? { flags: { has: flag } } : {}),
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

      {/* Status filter chips */}
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-5 py-2">
        {[
          { href: '/review', label: 'Tudo', active: !status },
          { href: '/review?status=NEEDS_REVIEW', label: 'A rever', active: status === 'NEEDS_REVIEW' },
          { href: '/review?status=PRE_VALIDATED', label: 'Pré-validados', active: status === 'PRE_VALIDATED' },
        ].map((chip) => (
          <Link
            key={chip.label}
            href={chip.href}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
              chip.active
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}
          >
            {chip.label}
          </Link>
        ))}
        {(clientId || flag) && (
          <Link href="/review" className="text-[11px] font-medium text-gray-400 underline hover:text-gray-600">
            limpar filtros
          </Link>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <ReviewQueue items={items} />
      </div>
    </div>
  )
}
