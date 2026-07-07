'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ReviewQueue, type ReviewItemDTO } from '@/components/dashboard/review-queue'
import { DOCUMENT_TYPE_LABELS } from '@/lib/document-types'
import type { DocumentType } from '@/types'

interface ReviewQueueClientProps {
  status?: string
  clientId?: string
  flag?: string
}

interface ApiDocumentItem {
  id: string
  version: number
  status: string
  type: string
  supplierName: string | null
  supplierNif: string | null
  documentNumber: string | null
  issueDate: string | null // YYYY-MM-DD
  totalAmount: string | null
  flags: string[]
  filename: string
  clientName: string | null
}

function isoToPtDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/**
 * Review queue fed by GET /api/documents (S5.2) — the filters in the URL map
 * 1:1 to the endpoint's query params; no server-component Prisma queries.
 */
export function ReviewQueueClient({ status, clientId, flag }: ReviewQueueClientProps) {
  const statusFilter =
    status === 'NEEDS_REVIEW' || status === 'PRE_VALIDATED'
      ? status
      : 'NEEDS_REVIEW,PRE_VALIDATED'

  // Results are keyed by the filter set + attempt counter: a result for a
  // different key means "loading" — no synchronous setState inside effects.
  const filterKey = `${statusFilter}|${clientId ?? ''}|${flag ?? ''}`
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<
    { key: string; items: ReviewItemDTO[] | null; failed: boolean } | null
  >(null)

  const loadKey = `${filterKey}|${attempt}`
  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ status: statusFilter, rootOnly: '1', limit: '200' })
    if (clientId) params.set('clientId', clientId)
    if (flag) params.set('flag', flag)
    fetch(`/api/documents?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error()
        const { data } = await res.json()
        const items = (data.items as ApiDocumentItem[]).map((d) => ({
          id: d.id,
          version: d.version,
          status: d.status as ReviewItemDTO['status'],
          typeLabel: DOCUMENT_TYPE_LABELS[d.type as DocumentType] ?? d.type,
          supplierName: d.supplierName,
          supplierNif: d.supplierNif,
          documentNumber: d.documentNumber,
          issueDate: d.issueDate ? isoToPtDate(d.issueDate) : null,
          totalAmount: d.totalAmount !== null ? Number(d.totalAmount) : null,
          flags: d.flags,
          filename: d.filename,
          clientName: d.clientName,
        }))
        if (!cancelled) setResult({ key: loadKey, items, failed: false })
      })
      .catch(() => {
        if (!cancelled) setResult({ key: loadKey, items: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [loadKey, statusFilter, clientId, flag])

  const current = result?.key === loadKey ? result : null
  const items = current?.items ?? null
  const failed = current?.failed ?? false
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const preValidated = items?.filter((i) => i.status === 'PRE_VALIDATED').length ?? 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck className="h-4 w-4 stroke-[1.75] text-gray-400" />
          <h1 className="text-[13px] font-semibold text-gray-800">Fila de revisão</h1>
          <span className="data rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-400">
            {items === null ? '…' : items.length}
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
        {failed ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-[12px] text-gray-500">Não foi possível carregar a fila de revisão.</p>
            <button
              onClick={retry}
              className="pressable flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tentar novamente
            </button>
          </div>
        ) : items === null ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar documentos…
          </div>
        ) : (
          <ReviewQueue items={items} />
        )}
      </div>
    </div>
  )
}
