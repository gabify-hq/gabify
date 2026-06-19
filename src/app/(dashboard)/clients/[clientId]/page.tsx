import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Mail, Phone, Building2, Hash, Pencil } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DOCUMENT_TYPE_LABELS } from '@/lib/mock-data'
import { EditClientDialog } from '@/components/dashboard/edit-client-dialog'
import { ClientDocumentTimeline } from '@/components/dashboard/client-document-timeline'
import type { TimelineDocument, TimelinePeriod } from '@/components/dashboard/client-document-timeline'
import type { DocumentType } from '@/types'

interface ClientPageProps {
  params: Promise<{ clientId: string }>
}

// Portuguese month names
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// Document type display order within a period (most important first)
const TYPE_ORDER: string[] = [
  'AT_COMMUNICATION', 'BANK_STATEMENT',
  'INVOICE_RECEIPT', 'INVOICE_RECEIVED', 'INVOICE_ISSUED',
  'RECEIPT', 'PAYROLL', 'TAX_DOCUMENT', 'SOCIAL_SECURITY',
  'CONTRACT', 'BALANCE_SHEET', 'INCOME_STATEMENT', 'OTHER',
]

function getPeriodKey(doc: { extractedDate: Date | null; createdAt: Date }): string {
  const date = doc.extractedDate ?? doc.createdAt
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getPeriodLabel(key: string): string {
  const [year, month] = key.split('-')
  return `${MONTHS_PT[parseInt(month) - 1]} ${year}`
}

export default async function ClientPage({ params }: ClientPageProps) {
  const { clientId } = await params
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  // Fetch client — guard to office scope
  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId, deletedAt: null },
  })
  if (!client) notFound()

  // Fetch documents for this client (scoped via emailAccount → officeId)
  const dbDocs = await prisma.document.findMany({
    where: {
      clientId,
      attachment: { inboundEmail: { emailAccount: { officeId } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
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
      attachment: { select: { filename: true } },
    },
  })

  // Map to timeline docs
  const docs: TimelineDocument[] = dbDocs.map((doc) => {
    const type = (doc.type ?? 'OTHER') as DocumentType
    const status: TimelineDocument['status'] =
      doc.status === 'CLASSIFIED' ? 'CLASSIFIED'
      : doc.status === 'REVIEWED'  ? 'REVIEWED'
      : 'NEEDS_REVIEW'

    return {
      id: doc.id,
      type,
      status,
      confidence: doc.confidence ?? 0,
      filename: doc.attachment?.filename ?? doc.id,
      extractedDate: doc.extractedDate
        ? doc.extractedDate.toLocaleDateString('pt-PT')
        : null,
      extractedAmount: doc.extractedAmount ?? null,
      extractedVATNumber: doc.extractedVATNumber ?? null,
      r2Key: doc.r2Key ?? null,
      classificationSource: doc.classificationSource ?? null,
    }
  })

  // Group by period, sort periods newest-first
  const periodMap = new Map<string, TimelineDocument[]>()
  for (const doc of docs) {
    const key = getPeriodKey(
      dbDocs.find((d) => d.id === doc.id)!
    )
    if (!periodMap.has(key)) periodMap.set(key, [])
    periodMap.get(key)!.push(doc)
  }

  const periods: TimelinePeriod[] = Array.from(periodMap.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([key, periodDocs]) => {
      // Sort docs by type order, then filename
      const sorted = [...periodDocs].sort((a, b) => {
        const ai = TYPE_ORDER.indexOf(a.type)
        const bi = TYPE_ORDER.indexOf(b.type)
        const typeSort = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        return typeSort !== 0 ? typeSort : a.filename.localeCompare(b.filename)
      })
      return {
        key,
        label: getPeriodLabel(key),
        documents: sorted,
        needsReviewCount: sorted.filter((d) => d.status === 'NEEDS_REVIEW').length,
      }
    })

  // Stats
  const totalDocs = docs.length
  const pendingReview = docs.filter((d) => d.status === 'NEEDS_REVIEW').length
  const totalPeriods = periods.length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-2.5">
        <Link
          href="/clients"
          className="pressable flex items-center gap-1 text-[12px] font-medium text-gray-400 transition-colors hover:text-gray-700"
        >
          <ChevronLeft className="h-3.5 w-3.5 stroke-2" />
          Clientes
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-3xl space-y-4">

          {/* Client header */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                <Building2 className="h-4 w-4 stroke-[1.5] text-gray-400" />
              </div>
              <div className="space-y-1">
                <h1 className="text-[14px] font-bold text-gray-900">{client.name}</h1>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                  {client.nif && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-400">
                      <Hash className="h-2.5 w-2.5" />
                      <span className="data">{client.nif}</span>
                    </span>
                  )}
                  {client.email && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-400">
                      <Mail className="h-2.5 w-2.5" />
                      {client.email}
                    </span>
                  )}
                  {client.phone && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-400">
                      <Phone className="h-2.5 w-2.5" />
                      {client.phone}
                    </span>
                  )}
                </div>
                {(client.emailDomains.length > 0 || client.knownEmails.length > 0) && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {client.emailDomains.map((d) => (
                      <span key={d} className="data rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400">
                        @{d}
                      </span>
                    ))}
                    {client.knownEmails.map((e) => (
                      <span key={e} className="data rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-500">
                        {e}
                      </span>
                    ))}
                  </div>
                )}
                {client.notes && (
                  <p className="text-[11px] text-gray-400 pt-1">{client.notes}</p>
                )}
              </div>
            </div>
            <EditClientDialog client={{ id: client.id, name: client.name, nif: client.nif ?? null, email: client.email ?? null, emailDomains: client.emailDomains, knownEmails: client.knownEmails, notes: client.notes ?? null }} />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Documentos', value: totalDocs },
              { label: 'Para rever', value: pendingReview, warn: pendingReview > 0 },
              { label: 'Períodos', value: totalPeriods },
            ].map(({ label, value, warn }) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
                <p className={`data mt-0.5 text-[22px] font-bold ${warn ? 'text-amber-500' : 'text-gray-800'}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="section-label">Documentação por período</span>
              {pendingReview > 0 && (
                <span className="text-[11px] font-medium text-amber-500">
                  {pendingReview} documento{pendingReview !== 1 ? 's' : ''} a rever
                </span>
              )}
            </div>
            <ClientDocumentTimeline periods={periods} />
          </div>

        </div>
      </div>
    </div>
  )
}
