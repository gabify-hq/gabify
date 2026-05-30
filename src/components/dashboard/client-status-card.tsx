import Link from 'next/link'
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { MockClient } from '@/lib/mock-data'
import { DOCUMENT_TYPE_LABELS } from '@/lib/mock-data'

interface ClientStatusCardProps {
  client: MockClient
}

const statusConfig = {
  complete: {
    icon: CheckCircle2,
    iconClass: 'text-green-500',
    borderClass: 'border-neutral-200',
    label: 'Completo',
  },
  incomplete: {
    icon: Clock,
    iconClass: 'text-yellow-500',
    borderClass: 'border-yellow-200',
    label: 'Incompleto',
  },
  missing: {
    icon: AlertCircle,
    iconClass: 'text-red-500',
    borderClass: 'border-red-200',
    label: 'Em falta',
  },
}

export function ClientStatusCard({ client }: ClientStatusCardProps) {
  const config = statusConfig[client.status]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-white p-4',
        config.borderClass
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/clients/${client.id}`}
            className="text-sm font-medium text-neutral-900 hover:text-blue-600 hover:underline"
          >
            {client.name}
          </Link>
          <p className="mt-0.5 text-xs text-neutral-500">NIF {client.nif}</p>
        </div>
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.iconClass)} />
      </div>

      {/* Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">Documentação Abril 2025</span>
          <span className="text-[11px] font-medium text-neutral-700">{client.completionPct}%</span>
        </div>
        <Progress
          value={client.completionPct}
          className={cn(
            'h-1.5',
            client.status === 'complete' && '[&>div]:bg-green-500',
            client.status === 'incomplete' && '[&>div]:bg-yellow-500',
            client.status === 'missing' && '[&>div]:bg-red-500'
          )}
        />
      </div>

      {/* Missing documents */}
      {client.missingDocuments.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium text-neutral-500">Em falta:</p>
          <ul className="space-y-0.5">
            {client.missingDocuments.map((doc, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                <span className="h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                {DOCUMENT_TYPE_LABELS[doc.type]} — {doc.period}
              </li>
            ))}
          </ul>
        </div>
      )}

      {client.status === 'complete' && (
        <p className="text-[12px] text-green-600">Toda a documentação recebida.</p>
      )}
    </div>
  )
}
