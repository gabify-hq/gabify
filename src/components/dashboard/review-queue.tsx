'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, X, Eye, Loader2, CheckCheck, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ReviewItemDTO {
  id: string
  version: number
  status: 'NEEDS_REVIEW' | 'PRE_VALIDATED'
  typeLabel: string
  supplierName: string | null
  supplierNif: string | null
  documentNumber: string | null
  issueDate: string | null
  totalAmount: number | null
  flags: string[]
  filename: string
  clientName: string | null
}

const FLAG_LABELS: Record<string, string> = {
  DUPLICATE_SUSPECT: 'Duplicado?',
  WRONG_CLIENT_SUSPECT: 'Cliente errado?',
  SENDER_UNVERIFIED: 'Remetente não verificado',
  TOO_LARGE_FOR_AUTOSPLIT: 'Grande demais p/ divisão automática',
  ARITHMETIC_MISMATCH: 'Totais não batem certo',
  VAT_SENSITIVE: 'IVA a confirmar',
}

/**
 * Review queue (S3.1) — mobile-first card list. Validate/reject per document,
 * bulk validate for PRE_VALIDATED. Field-level correction goes through the
 * review API (409 on concurrent edits — A7).
 */
export function ReviewQueue({ items }: { items: ReviewItemDTO[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function decide(item: ReviewItemDTO, decision: 'validate' | 'reject'): Promise<void> {
    setBusyId(item.id)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/documents/${item.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, expectedVersion: item.version }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMessage(
          res.status === 409
            ? 'Documento atualizado por outro utilizador — a lista foi recarregada.'
            : data?.error ?? 'Ocorreu um erro.'
        )
      }
      router.refresh()
    } catch {
      setErrorMessage('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setBusyId(null)
    }
  }

  async function bulkValidate(): Promise<void> {
    const preValidated = items.filter((i) => i.status === 'PRE_VALIDATED')
    if (preValidated.length === 0) return
    setBulkBusy(true)
    setErrorMessage(null)
    try {
      const res = await fetch('/api/documents/review/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: preValidated.map((i) => ({ documentId: i.id, expectedVersion: i.version })),
        }),
      })
      if (!res.ok) {
        setErrorMessage('Não foi possível validar em lote.')
      } else {
        const { data } = await res.json()
        const conflicts = data.results.filter((r: { result: string }) => r.result !== 'OK').length
        if (conflicts > 0) {
          setErrorMessage(`${conflicts} documento(s) tinham sido atualizados entretanto e não foram validados.`)
        }
      }
      router.refresh()
    } catch {
      setErrorMessage('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setBulkBusy(false)
    }
  }

  async function preview(id: string): Promise<void> {
    const res = await fetch(`/api/documents/${id}`)
    if (!res.ok) return
    const { data } = await res.json()
    window.open(data.url, '_blank')
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CheckCheck className="mb-3 h-8 w-8 stroke-[1] text-green-300" />
        <p className="text-[13px] font-semibold text-gray-500">Nada para rever.</p>
        <p className="mt-1 text-[12px] text-gray-400">Todos os documentos estão validados.</p>
      </div>
    )
  }

  const preValidatedCount = items.filter((i) => i.status === 'PRE_VALIDATED').length

  return (
    <div className="flex flex-col gap-3">
      {errorMessage && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600" role="alert">
          {errorMessage}
        </p>
      )}

      {preValidatedCount > 1 && (
        <button
          onClick={bulkValidate}
          disabled={bulkBusy}
          className="pressable flex items-center justify-center gap-1.5 self-start rounded-lg bg-green-600 px-3 py-2 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5 stroke-[2]" />}
          Validar {preValidatedCount} pré-validados
        </button>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link
                  href={`/review/${item.id}`}
                  className="truncate text-[13px] font-semibold text-gray-800 hover:text-green-700 hover:underline"
                >
                  {item.documentNumber ?? item.filename}
                </Link>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    item.status === 'PRE_VALIDATED'
                      ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                      : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                  )}
                >
                  {item.status === 'PRE_VALIDATED' ? 'Pré-validado' : 'A rever'}
                </span>
                {item.flags.map((flag) => (
                  <span
                    key={flag}
                    className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600 ring-1 ring-red-100"
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {FLAG_LABELS[flag] ?? flag}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[12px] text-gray-500">
                {item.typeLabel}
                {item.supplierName && <> · {item.supplierName}</>}
                {item.supplierNif && <span className="data"> ({item.supplierNif})</span>}
                {item.clientName && <> · {item.clientName}</>}
              </p>
              <p className="data mt-0.5 text-[11px] text-gray-400">
                {item.issueDate ?? 'sem data'}
                {item.totalAmount !== null && (
                  <> · €{item.totalAmount.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</>
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => preview(item.id)}
                className="pressable rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                title="Pré-visualizar"
                aria-label={`Pré-visualizar ${item.filename}`}
              >
                <Eye className="h-4 w-4 stroke-[1.75]" />
              </button>
              <button
                onClick={() => decide(item, 'validate')}
                disabled={busyId !== null}
                className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                Validar
              </button>
              <button
                onClick={() => decide(item, 'reject')}
                disabled={busyId !== null}
                className="pressable flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5 stroke-[2.5]" />
                Rejeitar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
