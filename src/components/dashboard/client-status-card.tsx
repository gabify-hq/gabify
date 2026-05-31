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
    iconClass: 'text-green-400',
    leftBorder: 'bg-green-500',
    progressClass: 'bg-green-500',
  },
  incomplete: {
    icon: Clock,
    iconClass: 'text-amber-400',
    leftBorder: 'bg-amber-400',
    progressClass: 'bg-amber-400',
  },
  missing: {
    icon: AlertCircle,
    iconClass: 'text-red-400',
    leftBorder: 'bg-red-500',
    progressClass: 'bg-red-500',
  },
}

export function ClientStatusCard({ client }: ClientStatusCardProps) {
  const config = statusConfig[client.status]
  const Icon = config.icon

  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 p-4">
      {/* Left status border */}
      <span className={cn('absolute left-0 top-0 bottom-0 w-0.5', config.leftBorder)} />

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/clients/${client.id}`}
            className="pressable text-[13px] font-semibold text-zinc-200 transition-colors hover:text-white"
          >
            {client.name}
          </Link>
          <p className="data mt-0.5 text-[11px] text-zinc-600">NIF {client.nif}</p>
        </div>
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.iconClass)} />
      </div>

      {/* Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-600">Abril 2025</span>
          <span className={cn('data text-[11px] font-semibold', config.iconClass)}>
            {client.completionPct}%
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-zinc-800">
          <div
            className={cn('h-full rounded-full transition-all', config.progressClass)}
            style={{ width: `${client.completionPct}%` }}
          />
        </div>
      </div>

      {/* Missing documents */}
      {client.missingDocuments.length > 0 && (
        <div className="space-y-1">
          {client.missingDocuments.map((doc, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-700" />
              {DOCUMENT_TYPE_LABELS[doc.type]}
              <span className="data text-zinc-700">— {doc.period}</span>
            </div>
          ))}
        </div>
      )}

      {client.status === 'complete' && (
        <p className="text-[11px] text-green-400/70">Documentação completa.</p>
      )}
    </div>
  )
}
