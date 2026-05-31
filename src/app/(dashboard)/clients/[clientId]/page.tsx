import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, AlertCircle, CheckCircle2, Clock, FileText } from 'lucide-react'
import { StatusPill } from '@/components/dashboard/status-badge'
import { DocumentTable } from '@/components/dashboard/document-table'
import {
  getClientById,
  getDocumentsByClientId,
  MOCK_EMAILS,
  DOCUMENT_TYPE_LABELS,
} from '@/lib/mock-data'
import { cn } from '@/lib/utils'

interface ClientPageProps {
  params: Promise<{ clientId: string }>
}

const statusConfig = {
  complete:   { icon: CheckCircle2, color: 'text-green-400', border: 'bg-green-500', progress: 'bg-green-500', variant: 'complete' as const },
  incomplete: { icon: Clock,        color: 'text-amber-400', border: 'bg-amber-400', progress: 'bg-amber-400', variant: 'incomplete' as const },
  missing:    { icon: AlertCircle,  color: 'text-red-400',   border: 'bg-red-500',   progress: 'bg-red-500',   variant: 'missing' as const },
}

const emailStatusVariant = (status: string) => {
  if (status === 'UNREAD') return 'unread' as const
  if (status === 'PROCESSED') return 'approved' as const
  return 'draft' as const
}

const emailStatusLabel = (status: string) => {
  if (status === 'UNREAD') return 'Não lido'
  if (status === 'PROCESSED') return 'Processado'
  return 'Lido'
}

export default async function ClientPage({ params }: ClientPageProps) {
  const { clientId } = await params
  const client = getClientById(clientId)
  if (!client) notFound()

  const documents = getDocumentsByClientId(clientId)
  const clientEmails = MOCK_EMAILS.filter((e) => e.clientId === clientId)
  const config = statusConfig[client.status]
  const Icon = config.icon

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-2.5">
        <Link
          href="/clients"
          className="pressable flex items-center gap-1 text-[12px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ChevronLeft className="h-3.5 w-3.5 stroke-[1.5]" />
          Clientes
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Client header card */}
          <div className="relative overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 p-5">
            <span className={cn('absolute left-0 top-0 bottom-0 w-0.5', config.border)} />
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-[15px] font-semibold text-zinc-100">{client.name}</h1>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                  <span className="data text-[11px] text-zinc-500">NIF {client.nif}</span>
                  <span className="data text-[11px] text-zinc-600">{client.email}</span>
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {client.emailDomains.map((d) => (
                    <span key={d} className="data rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                      @{d}
                    </span>
                  ))}
                  {client.knownEmails.map((e) => (
                    <span key={e} className="data rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                      {e}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Icon className={cn('h-4 w-4', config.color)} />
                <StatusPill variant={config.variant} label={
                  client.status === 'complete' ? 'Completo' :
                  client.status === 'incomplete' ? 'Incompleto' : 'Em falta'
                } />
              </div>
            </div>
          </div>

          {/* Documentation progress */}
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="section-label">Documentação — Abril 2025</span>
              <span className={cn('data text-[13px] font-bold', config.color)}>
                {client.completionPct}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800">
              <div
                className={cn('h-full rounded-full transition-all', config.progress)}
                style={{ width: `${client.completionPct}%` }}
              />
            </div>
            {client.missingDocuments.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {client.missingDocuments.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <AlertCircle className="h-3 w-3 shrink-0 text-red-500" />
                    <span className="text-zinc-400">{DOCUMENT_TYPE_LABELS[doc.type]}</span>
                    <span className="data text-zinc-600">— {doc.period}</span>
                  </div>
                ))}
              </div>
            )}
            {client.missingDocuments.length === 0 && (
              <p className="flex items-center gap-1.5 text-[12px] text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Documentação completa.
              </p>
            )}
          </div>

          {/* Recent emails */}
          {clientEmails.length > 0 && (
            <div className="rounded-md border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className="border-b border-zinc-800 px-4 py-2.5">
                <span className="section-label">Emails recentes ({clientEmails.length})</span>
              </div>
              <ul className="divide-y divide-zinc-800/60">
                {clientEmails.map((email) => (
                  <li key={email.id}>
                    <Link
                      href={`/inbox/${email.id}`}
                      className="pressable flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-zinc-800/40"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-zinc-600" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[12px] font-medium text-zinc-300">{email.subject}</p>
                        <p className="data text-[10px] text-zinc-600">{email.fromName}</p>
                      </div>
                      <StatusPill
                        variant={emailStatusVariant(email.status)}
                        label={emailStatusLabel(email.status)}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Documents */}
          {documents.length > 0 && (
            <div>
              <div className="mb-2.5">
                <span className="section-label">Documentos ({documents.length})</span>
              </div>
              <DocumentTable documents={documents} hideClientFilter />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
