import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Mail, Phone, Building2, Hash, Pencil } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { can } from '@/server/authz/can'
import { listClientDocuments } from '@/server/services/document-service'
import { EditClientDialog } from '@/components/dashboard/edit-client-dialog'
import { ClientDocumentTimeline } from '@/components/dashboard/client-document-timeline'
import type { TimelineDocument, TimelinePeriod } from '@/components/dashboard/client-document-timeline'
import { PortalAccessManager } from '@/components/portal/portal-access-manager'
import type { PortalInvitationDTO, PortalUserDTO } from '@/components/portal/portal-access-manager'
import { ToconlineIntegrationPanel } from '@/components/dashboard/toconline-integration-panel'
import type {
  ToconlineConnectionInfo,
  ToconlinePushableDocument,
} from '@/components/dashboard/toconline-integration-panel'
import { SourceConnectionsPanel } from '@/components/dashboard/source-connections-panel'
import type { SourceConnectionInfo } from '@/components/dashboard/source-connections-panel'
import { getMoloniConnection } from '@/server/sources/moloni/moloni-connection-service'
import { getInvoicexpressConnection } from '@/server/sources/invoicexpress/invoicexpress-connection-service'
import type { SourceConnectionDTO } from '@/server/sources/source-connection-dto'
import {
  TOCONLINE_PUSH_ELIGIBLE_STATUSES,
  TOCONLINE_PUSH_ELIGIBLE_TYPES,
} from '@/server/toconline/toconline-push-service'
import { formatDatePt } from '@/lib/timezone'
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

function portalInvitationState(inv: {
  acceptedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date
}): PortalInvitationDTO['state'] {
  if (inv.acceptedAt) return 'aceite'
  if (inv.revokedAt) return 'revogado'
  if (inv.expiresAt.getTime() < Date.now()) return 'expirado'
  return 'pendente'
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

  // Every intake source, scoped by Document.officeId directly (audit F1.2) —
  // the legacy attachment→inboundEmail filter hid uploads/imports/pulls
  const rows = await listClientDocuments(officeId, clientId)

  // Map to timeline docs — REAL lifecycle state, never collapsed
  const docs: TimelineDocument[] = rows.map((doc) => ({
    id: doc.id,
    type: (doc.type ?? 'OTHER') as DocumentType,
    status: doc.status,
    confidence: doc.confidence,
    filename: doc.filename,
    sourceLabel: doc.sourceLabel,
    extractedDate: doc.extractedDate
      ? doc.extractedDate.toLocaleDateString('pt-PT')
      : null,
    extractedAmount: doc.extractedAmount,
    extractedVATNumber: doc.extractedVATNumber,
    r2Key: doc.r2Key,
    classificationSource: doc.classificationSource,
  }))

  // Group by period, sort periods newest-first
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const periodMap = new Map<string, TimelineDocument[]>()
  for (const doc of docs) {
    const row = rowById.get(doc.id)!
    const key = getPeriodKey({ extractedDate: row.extractedDate, createdAt: row.createdAt })
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

  // "Acessos do portal" (fase P3) — OWNER + ACCOUNTANT only
  const canManagePortalAccess = can(session?.user?.role, 'clientInvitation:manage')
  let portalUsers: PortalUserDTO[] = []
  let portalInvitations: PortalInvitationDTO[] = []
  if (canManagePortalAccess) {
    const [users, invitations] = await Promise.all([
      prisma.user.findMany({
        where: { officeId, clientId, role: 'CLIENT', deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      prisma.invitation.findMany({
        where: { officeId, clientId, role: 'CLIENT' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, email: true, expiresAt: true, acceptedAt: true, revokedAt: true },
      }),
    ])
    portalUsers = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      since: u.createdAt.toLocaleDateString('pt-PT'),
    }))
    portalInvitations = invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      state: portalInvitationState(inv),
      expiresAt: inv.expiresAt.toLocaleDateString('pt-PT'),
    }))
  }

  // Integração TOConline (v1 — doc-driven, NÃO testada contra a API real)
  const canReadToconline = can(session?.user?.role, 'toconline:read')
  const canManageToconline = can(session?.user?.role, 'toconline:manage')
  const canGoLiveToconline = can(session?.user?.role, 'toconline:goLive')
  let toconlineConnection: ToconlineConnectionInfo | null = null
  let toconlineDocuments: ToconlinePushableDocument[] = []
  let toconlineImportedCount = 0
  if (canReadToconline) {
    const connection = await prisma.toconlineConnection.findFirst({
      where: { officeId, clientId },
      orderBy: { createdAt: 'asc' },
      select: {
        status: true,
        dryRun: true,
        oauthUrl: true,
        apiUrl: true,
        oauthClientId: true,
        lastError: true,
        pullEnabled: true,
        pushEnabled: true,
        lastPullAt: true,
      },
    })
    if (connection) {
      toconlineConnection = {
        status: connection.status,
        dryRun: connection.dryRun,
        oauthUrl: connection.oauthUrl,
        apiUrl: connection.apiUrl,
        oauthClientId: connection.oauthClientId,
        lastError: connection.lastError,
        pullEnabled: connection.pullEnabled,
        pushEnabled: connection.pushEnabled,
        lastPullAt: connection.lastPullAt
          ? connection.lastPullAt.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })
          : null,
      }
      toconlineImportedCount = await prisma.document.count({
        where: { officeId, clientId, source: 'API_PULL', deletedAt: null },
      })
      const pushable = await prisma.document.findMany({
        where: {
          officeId,
          clientId,
          deletedAt: null,
          status: { in: [...TOCONLINE_PUSH_ELIGIBLE_STATUSES] },
          type: { in: [...TOCONLINE_PUSH_ELIGIBLE_TYPES] },
        },
        orderBy: { issueDate: 'desc' },
        take: 100,
        select: {
          id: true,
          documentNumber: true,
          issueDate: true,
          supplierName: true,
          totalAmount: true,
          toconlinePushStatus: true,
          toconlinePushError: true,
        },
      })
      toconlineDocuments = pushable.map((doc) => ({
        id: doc.id,
        number: doc.documentNumber ?? doc.id.slice(0, 8),
        date: doc.issueDate ? formatDatePt(doc.issueDate) : '—',
        supplier: doc.supplierName ?? '—',
        total: doc.totalAmount ? `${String(doc.totalAmount).replace('.', ',')} €` : '—',
        pushStatus: doc.toconlinePushStatus,
        pushError: doc.toconlinePushError,
      }))
    }
  }

  // Source connectors (Moloni / InvoiceXpress) — SOURCE-only, doc-driven, NÃO
  // testados contra a API real.
  const canReadSources = can(session?.user?.role, 'source:read')
  const canManageSources = can(session?.user?.role, 'source:manage')
  let moloniConnection: SourceConnectionInfo | null = null
  let invoicexpressConnection: SourceConnectionInfo | null = null
  if (canReadSources) {
    const formatLastPull = (iso: string | null): string | null =>
      iso ? new Date(iso).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }) : null
    const toInfo = (dto: SourceConnectionDTO): SourceConnectionInfo => ({
      status: dto.status,
      pullEnabled: dto.pullEnabled,
      lastPullAt: formatLastPull(dto.lastPullAt),
      lastError: dto.lastError,
      importedCount: dto.importedCount,
      hasCredentials: dto.hasCredentials,
      accountName: dto.accountName,
      companyId: dto.companyId,
      companyName: dto.companyName,
    })
    const [moloniDto, ivxDto] = await Promise.all([
      getMoloniConnection(officeId, clientId),
      getInvoicexpressConnection(officeId, clientId),
    ])
    moloniConnection = moloniDto ? toInfo(moloniDto) : null
    invoicexpressConnection = ivxDto ? toInfo(ivxDto) : null
  }

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

          {/* Acessos do portal (P3) */}
          {canManagePortalAccess && (
            <PortalAccessManager
              clientId={client.id}
              users={portalUsers}
              invitations={portalInvitations}
            />
          )}

          {/* Integração TOConline (v1 — mostrar só quando há ligação ou o user pode criá-la) */}
          {canReadToconline && (toconlineConnection || canManageToconline) && (
            <ToconlineIntegrationPanel
              clientId={client.id}
              connection={toconlineConnection}
              documents={toconlineDocuments}
              importedCount={toconlineImportedCount}
              canManage={canManageToconline}
              canGoLive={canGoLiveToconline}
            />
          )}

          {/* Ligações — Fontes (Moloni / InvoiceXpress), doc-driven, NÃO testadas */}
          {canReadSources && (moloniConnection || invoicexpressConnection || canManageSources) && (
            <SourceConnectionsPanel
              clientId={client.id}
              moloni={moloniConnection}
              invoicexpress={invoicexpressConnection}
              canManage={canManageSources}
            />
          )}

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
