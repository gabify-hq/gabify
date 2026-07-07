'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Landmark, Loader2, RefreshCw, Check, Undo2, EyeOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScoreBreakdownLine } from './score-breakdown'

/**
 * Bank reconciliation queue (fase C3) — mobile-first. Suggestions show the
 * score and its breakdown; autoMatch suggestions accept with one tap; partial
 * (multi-document) reconciliation via checkboxes; ignore requires a reason.
 */

interface SuggestionDTO {
  id: string
  documentId: string
  scoreTotal: number
  scoreBreakdown: { amount: number; date: number; entity: number; reference: number }
  autoMatch: boolean
  status: string
  documentNumber: string | null
  supplierName: string | null
  issueDate: string | null
  totalAmount: string | null
}

interface TransactionDTO {
  id: string
  bankAccountId: string
  bankAccountName: string
  clientName: string
  bookingDate: string
  description: string
  amountCents: number
  status: 'UNRECONCILED' | 'SUGGESTED' | 'RECONCILED' | 'IGNORED'
  version: number
  suggestions: SuggestionDTO[]
}

interface AccountOptionDTO {
  id: string
  name: string
  clientName: string
}

const STATUS_CHIPS = [
  { value: 'UNRECONCILED,SUGGESTED', label: 'Por conciliar' },
  { value: 'SUGGESTED', label: 'Sugeridas' },
  { value: 'RECONCILED', label: 'Conciliadas' },
  { value: 'IGNORED', label: 'Ignoradas' },
] as const

const STATUS_BADGE: Record<TransactionDTO['status'], { label: string; className: string }> = {
  UNRECONCILED: { label: 'Por conciliar', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  SUGGESTED: { label: 'Sugerida', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  RECONCILED: { label: 'Conciliada', className: 'bg-green-50 text-green-700 ring-green-200' },
  IGNORED: { label: 'Ignorada', className: 'bg-gray-100 text-gray-500 ring-gray-200' },
}

function formatCentsPt(cents: number): string {
  const sign = cents < 0 ? '−' : ''
  const abs = Math.abs(cents)
  const euros = Math.floor(abs / 100)
  const rest = String(abs % 100).padStart(2, '0')
  return `${sign}${euros.toLocaleString('pt-PT')},${rest} €`
}

function isoToPt(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function decimalToPt(value: string | null): string {
  if (value === null) return '—'
  const [euros, cents = '00'] = value.split('.')
  return `${Number(euros).toLocaleString('pt-PT')},${cents.padEnd(2, '0').slice(0, 2)} €`
}

interface BankQueueProps {
  initialStatus?: string
  initialAccountId?: string
}

export function BankQueue({ initialStatus, initialAccountId }: BankQueueProps) {
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? 'UNRECONCILED,SUGGESTED')
  const [accountId, setAccountId] = useState(initialAccountId ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [accounts, setAccounts] = useState<AccountOptionDTO[] | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<
    { key: string; items: TransactionDTO[] | null; total: number; failed: boolean } | null
  >(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Per-transaction UI state: selected suggestion docs + open ignore form
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [ignoreOpen, setIgnoreOpen] = useState<string | null>(null)
  const [ignoreReason, setIgnoreReason] = useState('')

  useEffect(() => {
    fetch('/api/bank/accounts?limit=200')
      .then(async (res) => (res.ok ? (await res.json()).data.items : []))
      .then((items: AccountOptionDTO[]) => setAccounts(items))
      .catch(() => setAccounts([]))
  }, [])

  const loadKey = `${statusFilter}|${accountId}|${from}|${to}|${attempt}`
  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ status: statusFilter, limit: '200' })
    if (accountId) params.set('bankAccountId', accountId)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    fetch(`/api/bank/transactions?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error()
        const { data } = await res.json()
        if (!cancelled) {
          setResult({ key: loadKey, items: data.items, total: data.total, failed: false })
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ key: loadKey, items: null, total: 0, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [loadKey, statusFilter, accountId, from, to])

  const current = result?.key === loadKey ? result : null
  const items = current?.items ?? null
  const failed = current?.failed ?? false
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  async function callAction(txId: string, url: string, body?: unknown): Promise<void> {
    setBusyId(txId)
    setActionError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setActionError(
          res.status === 409
            ? 'A transação foi atualizada por outro utilizador — recarregue.'
            : payload?.error ?? 'A ação falhou.'
        )
        return
      }
      setIgnoreOpen(null)
      setIgnoreReason('')
      reload()
    } catch {
      setActionError('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setBusyId(null)
    }
  }

  function reconcile(tx: TransactionDTO, documentIds: string[]): void {
    void callAction(tx.id, `/api/bank/transactions/${tx.id}/reconcile`, {
      documentIds,
      expectedVersion: tx.version,
    })
  }

  const selectedSumHint = useMemo(() => {
    return (tx: TransactionDTO): string | null => {
      const ids = selected[tx.id] ?? []
      if (ids.length < 2) return null
      const sum = tx.suggestions
        .filter((s) => ids.includes(s.documentId) && s.totalAmount !== null)
        .reduce((acc, s) => acc + Math.round(Number(s.totalAmount) * 100), 0)
      return `Selecionados: ${formatCentsPt(sum)} · Movimento: ${formatCentsPt(Math.abs(tx.amountCents))}`
    }
  }, [selected])

  return (
    <div className="flex flex-col gap-3">
      {/* Filters — stacked on mobile */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setStatusFilter(chip.value)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
              statusFilter === chip.value
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          aria-label="Filtrar por conta bancária"
          className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-green-400"
        >
          <option value="">Todas as contas</option>
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.clientName} — {a.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="Desde"
          className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-green-400"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Até"
          className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-green-400"
        />
        <span className="data text-[11px] text-gray-400">
          {current === null ? '…' : `${current.total} movimento${current.total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {actionError && (
        <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          {actionError}
        </p>
      )}

      {failed ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-[12px] text-gray-500">Não foi possível carregar os movimentos.</p>
          <button
            onClick={reload}
            className="pressable flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar novamente
          </button>
        </div>
      ) : items === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          A carregar movimentos…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Landmark className="h-8 w-8 stroke-[1] text-gray-300" />
          <p className="text-[13px] font-semibold text-gray-500">Sem movimentos neste filtro</p>
          <p className="text-[12px] text-gray-400">Importe um extrato para começar a conciliar.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((tx) => {
            const badge = STATUS_BADGE[tx.status]
            const busy = busyId === tx.id
            const txSelected = selected[tx.id] ?? []
            const actionable = tx.status === 'UNRECONCILED' || tx.status === 'SUGGESTED'
            return (
              <li key={tx.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                {/* Transaction row — wraps on mobile */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                  <span className="data text-[11px] text-gray-400">{isoToPt(tx.bookingDate)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-800">
                    {tx.description}
                  </span>
                  <span
                    className={cn(
                      'data text-[13px] font-bold',
                      tx.amountCents < 0 ? 'text-gray-800' : 'text-green-700'
                    )}
                  >
                    {formatCentsPt(tx.amountCents)}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                      badge.className
                    )}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-50 px-3 py-1.5">
                  <span className="text-[11px] text-gray-400">
                    {tx.clientName} · {tx.bankAccountName}
                  </span>
                  <span className="flex-1" />
                  {actionable && (
                    <>
                      {ignoreOpen === tx.id ? (
                        <span className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={ignoreReason}
                            onChange={(e) => setIgnoreReason(e.target.value)}
                            placeholder="Motivo para ignorar"
                            aria-label="Motivo para ignorar"
                            className="h-7 w-44 rounded-lg border border-gray-200 px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-400"
                          />
                          <button
                            disabled={busy || ignoreReason.trim() === ''}
                            onClick={() =>
                              void callAction(tx.id, `/api/bank/transactions/${tx.id}/reconcile`, {
                                ignore: true,
                                reason: ignoreReason.trim(),
                                expectedVersion: tx.version,
                              })
                            }
                            className="pressable rounded-lg bg-gray-800 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Ignorar'}
                          </button>
                          <button
                            onClick={() => {
                              setIgnoreOpen(null)
                              setIgnoreReason('')
                            }}
                            aria-label="Cancelar ignorar"
                            className="pressable rounded-lg border border-gray-200 p-1 text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => setIgnoreOpen(tx.id)}
                          className="pressable flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-50"
                        >
                          <EyeOff className="h-3 w-3" />
                          Ignorar
                        </button>
                      )}
                    </>
                  )}
                  {(tx.status === 'RECONCILED' || tx.status === 'IGNORED') && (
                    <button
                      disabled={busy}
                      onClick={() => void callAction(tx.id, `/api/bank/transactions/${tx.id}/unreconcile`)}
                      className="pressable flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                      Reverter
                    </button>
                  )}
                </div>

                {/* Suggestions with score + breakdown */}
                {actionable && tx.suggestions.length > 0 && (
                  <div className="border-t border-gray-100 px-3 py-2">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Sugestões
                    </p>
                    <ul className="space-y-1.5">
                      {tx.suggestions.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={txSelected.includes(s.documentId)}
                              onChange={(e) =>
                                setSelected((prev) => ({
                                  ...prev,
                                  [tx.id]: e.target.checked
                                    ? [...(prev[tx.id] ?? []), s.documentId]
                                    : (prev[tx.id] ?? []).filter((id) => id !== s.documentId),
                                }))
                              }
                              aria-label={`Selecionar documento ${s.documentNumber ?? s.documentId}`}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-400"
                            />
                            <span className="min-w-0 truncate text-[12px] text-gray-700">
                              <span className="font-semibold">{s.supplierName ?? 'Fornecedor'}</span>
                              {s.documentNumber && <span className="text-gray-400"> · {s.documentNumber}</span>}
                              {s.issueDate && <span className="text-gray-400"> · {isoToPt(s.issueDate)}</span>}
                            </span>
                          </label>
                          <span className="data text-[12px] font-semibold text-gray-700">
                            {decimalToPt(s.totalAmount)}
                          </span>
                          <span
                            className={cn(
                              'data inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset',
                              s.scoreTotal >= 75
                                ? 'bg-green-50 text-green-700 ring-green-200'
                                : 'bg-amber-50 text-amber-700 ring-amber-200'
                            )}
                          >
                            {s.scoreTotal}
                          </span>
                          {s.autoMatch && (
                            <button
                              disabled={busy}
                              onClick={() => reconcile(tx, [s.documentId])}
                              className="pressable flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              Aceitar
                            </button>
                          )}
                          <ScoreBreakdownLine breakdown={s.scoreBreakdown} />
                        </li>
                      ))}
                    </ul>
                    {txSelected.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          disabled={busy}
                          onClick={() => reconcile(tx, txSelected)}
                          className="pressable flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Conciliar {txSelected.length} documento{txSelected.length !== 1 ? 's' : ''}
                        </button>
                        {selectedSumHint(tx) && (
                          <span className="data text-[10px] text-gray-400">{selectedSumHint(tx)}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
