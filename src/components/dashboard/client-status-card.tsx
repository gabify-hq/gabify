import Link from 'next/link'
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MockClient } from '@/lib/mock-data'
import { DOCUMENT_TYPE_LABELS } from '@/lib/mock-data'

interface ClientStatusCardProps {
  client: MockClient
}

const statusConfig = {
  complete: {
    icon: CheckCircle2,
    iconClass: 'text-green-600',
    leftBorder: 'bg-green-500',
    progressClass: 'bg-green-500',
    cardClass: 'ring-green-100',
    pctClass: 'text-green-700',
  },
  incomplete: {
    icon: Clock,
    iconClass: 'text-amber-600',
    leftBorder: 'bg-amber-500',
    progressClass: 'bg-amber-500',
    cardClass: 'ring-amber-100',
    pctClass: 'text-amber-700',
  },
  missing: {
    icon: AlertCircle,
    iconClass: 'text-red-500',
    leftBorder: 'bg-red-500',
    progressClass: 'bg-red-500',
    cardClass: 'ring-red-100',
    pctClass: 'text-red-600',
  },
}

export function ClientStatusCard({ client }: ClientStatusCardProps) {
  const config = statusConfig[client.status]
  const Icon = config.icon

  return (
    <div className={cn(
      'relative flex flex-col gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm ring-1',
      config.cardClass,
    )}>
      {/* Left status border */}
      <span className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl', config.leftBorder)} />

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/clients/${client.id}`}
            className="pressable text-[13px] font-bold text-gray-900 transition-colors hover:text-green-700"
          >
            {client.name}
          </Link>
          <p className="data mt-0.5 text-[11px] text-gray-400">NIF {client.nif}</p>
        </div>
        <Icon className={cn('mt-0.5 h-4.5 w-4.5 shrink-0', config.iconClass)} />
      </div>

      {/* Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-gray-400">Abril 2025</span>
          <span className={cn('data text-[12px] font-bold', config.pctClass)}>
            {client.completionPct}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-100">
          <div
            className={cn('h-full rounded-full transition-all duration-500', config.progressClass)}
            style={{ width: `${client.completionPct}%` }}
          />
        </div>
      </div>

      {/* Missing documents */}
      {client.missingDocuments.length > 0 && (
        <div className="space-y-1.5">
          {client.missingDocuments.map((doc, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <AlertCircle className="h-3 w-3 shrink-0 text-red-400" />
              <span className="text-gray-500">{DOCUMENT_TYPE_LABELS[doc.type]}</span>
              <span className="data text-gray-400">· {doc.period}</span>
            </div>
          ))}
        </div>
      )}

      {client.status === 'complete' && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-green-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Documentação completa
        </p>
      )}
    </div>
  )
}
