import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, AlertCircle, CheckCircle2, Clock, FileText } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { StatusBadge } from '@/components/dashboard/status-badge'
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
  complete: { icon: CheckCircle2, iconClass: 'text-green-500', label: 'Completo', variant: 'complete' as const },
  incomplete: { icon: Clock, iconClass: 'text-yellow-500', label: 'Incompleto', variant: 'incomplete' as const },
  missing: { icon: AlertCircle, iconClass: 'text-red-500', label: 'Em falta', variant: 'missing' as const },
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
      <div className="flex items-center gap-3 border-b border-neutral-200 px-6 py-3.5">
        <Link
          href="/clients"
          className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Clientes
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Client header */}
          <div className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-5">
            <div className="space-y-1">
              <h1 className="text-[17px] font-semibold text-neutral-900">{client.name}</h1>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-500">
                <span>NIF {client.nif}</span>
                <span>{client.email}</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {client.emailDomains.map((d) => (
                  <span key={d} className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                    @{d}
                  </span>
                ))}
                {client.knownEmails.map((e) => (
                  <span key={e} className="rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600">
                    {e}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Icon className={cn('h-4 w-4', config.iconClass)} />
              <StatusBadge variant={config.variant} label={config.label} />
            </div>
          </div>

          {/* Documentation status */}
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800">Documentação — Abril 2025</h2>
              <span className="text-sm font-medium text-neutral-700">{client.completionPct}%</span>
            </div>
            <Progress
              value={client.completionPct}
              className={cn(
                'h-2',
                client.status === 'complete' && '[&>div]:bg-green-500',
                client.status === 'incomplete' && '[&>div]:bg-yellow-500',
                client.status === 'missing' && '[&>div]:bg-red-500'
              )}
            />
            {client.missingDocuments.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Em falta
                </p>
                <ul className="space-y-1.5">
                  {client.missingDocuments.map((doc, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-neutral-700">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                      {DOCUMENT_TYPE_LABELS[doc.type]} — {doc.period}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {client.missingDocuments.length === 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Toda a documentação recebida.
              </p>
            )}
          </div>

          {/* Recent emails */}
          {clientEmails.length > 0 && (
            <div className="rounded-lg border border-neutral-200 bg-white">
              <div className="border-b border-neutral-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-neutral-800">
                  Emails recentes ({clientEmails.length})
                </h2>
              </div>
              <ul className="divide-y divide-neutral-100">
                {clientEmails.map((email) => (
                  <li key={email.id}>
                    <Link
                      href={`/inbox/${email.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-800">{email.subject}</p>
                        <p className="text-xs text-neutral-500">{email.fromName}</p>
                      </div>
                      <StatusBadge
                        variant={email.status === 'UNREAD' ? 'unread' : email.status === 'PROCESSED' ? 'approved' : 'draft'}
                        label={email.status === 'UNREAD' ? 'Não lido' : email.status === 'PROCESSED' ? 'Processado' : 'Lido'}
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
              <h2 className="mb-3 text-sm font-semibold text-neutral-800">
                Documentos ({documents.length})
              </h2>
              <DocumentTable documents={documents} hideClientFilter />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
