'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Counters {
  needsReview: number
  preValidated: number
  duplicateSuspects: number
  toExport: number
}

async function fetchTotal(params: Record<string, string>): Promise<number> {
  const query = new URLSearchParams({ ...params, limit: '1' })
  const res = await fetch(`/api/documents?${query.toString()}`)
  if (!res.ok) throw new Error()
  const { data } = await res.json()
  return data.total as number
}

/**
 * Document pipeline counter tiles fed by GET /api/documents (S5.2) —
 * each tile is the `total` of the same filtered query its link opens.
 */
export function DocumentCounters() {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<
    { attempt: number; counters: Counters | null; failed: boolean } | null
  >(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchTotal({ status: 'NEEDS_REVIEW', rootOnly: '1' }),
      fetchTotal({ status: 'PRE_VALIDATED', rootOnly: '1' }),
      fetchTotal({ flag: 'DUPLICATE_SUSPECT' }),
      fetchTotal({ status: 'VALIDATED' }),
    ])
      .then(([needsReview, preValidated, duplicateSuspects, toExport]) => {
        if (!cancelled) {
          setResult({
            attempt,
            counters: { needsReview, preValidated, duplicateSuspects, toExport },
            failed: false,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ attempt, counters: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const current = result?.attempt === attempt ? result : null
  const counters = current?.counters ?? null
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (current?.failed) {
    return (
      <p className="text-[12px] text-gray-400">
        Não foi possível carregar os contadores.{' '}
        <button onClick={retry} className="font-semibold text-gray-600 underline hover:text-gray-800">
          Tentar novamente
        </button>
      </p>
    )
  }

  const value = (n: number | undefined) => (counters === null ? '…' : String(n))

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy={counters === null}>
      <Link href="/review?status=NEEDS_REVIEW" className="pressable flex flex-col gap-1 rounded-lg border border-amber-100 bg-amber-50 p-3 transition-colors hover:bg-amber-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">A rever</span>
        <span className="data text-[22px] font-bold leading-none text-amber-800">{value(counters?.needsReview)}</span>
      </Link>
      <Link href="/review?status=PRE_VALIDATED" className="pressable flex flex-col gap-1 rounded-lg border border-green-100 bg-green-50 p-3 transition-colors hover:bg-green-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-green-600">Pré-validados</span>
        <span className="data text-[22px] font-bold leading-none text-green-800">{value(counters?.preValidated)}</span>
      </Link>
      <Link href="/review?flag=DUPLICATE_SUSPECT" className="pressable flex flex-col gap-1 rounded-lg border border-red-100 bg-red-50 p-3 transition-colors hover:bg-red-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-red-500">Duplicados?</span>
        <span className="data text-[22px] font-bold leading-none text-red-700">{value(counters?.duplicateSuspects)}</span>
      </Link>
      <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Por exportar</span>
        <span className="data text-[22px] font-bold leading-none text-gray-800">{value(counters?.toExport)}</span>
      </div>
    </div>
  )
}
