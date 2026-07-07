import { FileText, Mail, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PortalDocumentDTO } from '@/server/services/portal-service'

/**
 * Portal document list (fase P3) — renders ONLY the public DTO. Internal
 * statuses/flags never reach this component; labels are pt-PT.
 * Mobile-first: single-column rows, generous touch targets.
 */

const STATUS_LABELS: Record<PortalDocumentDTO['status'], string> = {
  PROCESSING: 'Em processamento',
  PROCESSED: 'Processado',
  RETURNED: 'Devolvido',
}

const STATUS_STYLES: Record<PortalDocumentDTO['status'], string> = {
  PROCESSING: 'bg-blue-50 text-blue-600',
  PROCESSED: 'bg-green-50 text-green-700',
  RETURNED: 'bg-red-50 text-red-600',
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  })
}

interface PortalDocumentTableProps {
  items: PortalDocumentDTO[]
}

export function PortalDocumentTable({ items }: PortalDocumentTableProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-10 text-center">
        <FileText className="h-6 w-6 stroke-[1.25] text-gray-300" />
        <p className="text-[13px] font-medium text-gray-500">Sem documentos</p>
        <p className="text-[12px] text-gray-400">
          Os documentos que carregar aparecem aqui com o estado atualizado.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {items.map((doc) => (
        <li key={doc.id} className="flex items-center gap-3 px-3 py-3">
          {doc.origin === 'EMAIL' ? (
            <Mail aria-label="Recebido por email" className="h-4 w-4 shrink-0 stroke-[1.5] text-gray-300" />
          ) : (
            <Upload aria-label="Carregado no portal" className="h-4 w-4 shrink-0 stroke-[1.5] text-gray-300" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-gray-800">{doc.filename}</p>
            <p className="text-[11px] text-gray-400">{formatDate(doc.submittedAt)}</p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              STATUS_STYLES[doc.status],
            )}
          >
            {STATUS_LABELS[doc.status]}
          </span>
        </li>
      ))}
    </ul>
  )
}
