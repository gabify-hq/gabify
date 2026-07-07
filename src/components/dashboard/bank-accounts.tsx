'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Bank accounts per client (fase C3) — dense table + inline create form. */

interface AccountDTO {
  id: string
  clientId: string
  clientName: string
  name: string
  iban: string | null
  currency: string
  active: boolean
  unreconciledCount: number
}

interface ClientOption {
  id: string
  name: string
}

interface BankAccountsProps {
  clients: ClientOption[]
  canManage: boolean
  onFilterAccount?: (accountId: string) => void
}

export function BankAccounts({ clients, canManage, onFilterAccount }: BankAccountsProps) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ attempt: number; items: AccountDTO[] | null; failed: boolean } | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [iban, setIban] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/bank/accounts?limit=200')
      .then(async (res) => {
        if (!res.ok) throw new Error()
        const { data } = await res.json()
        if (!cancelled) setResult({ attempt, items: data.items, failed: false })
      })
      .catch(() => {
        if (!cancelled) setResult({ attempt, items: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const current = result?.attempt === attempt ? result : null
  const items = current?.items ?? null

  async function createAccount(): Promise<void> {
    setBusy(true)
    setFormError(null)
    try {
      const res = await fetch('/api/bank/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          name: name.trim(),
          ...(iban.trim() !== '' ? { iban: iban.trim() } : {}),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setFormError(body?.error ?? 'Não foi possível criar a conta.')
        return
      }
      setName('')
      setIban('')
      setClientId('')
      setFormOpen(false)
      reload()
    } catch {
      setFormError('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-gray-400">
          Contas bancárias
        </h2>
        {canManage && (
          <button
            onClick={() => setFormOpen((v) => !v)}
            className="pressable flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:border-gray-300"
          >
            <Plus className="h-3 w-3" />
            Nova conta
          </button>
        )}
      </div>

      {formOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void createAccount()
          }}
          className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Cliente</span>
              <select
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={busy}
                className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-400"
              >
                <option value="">Escolher cliente…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nome da conta</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                placeholder="ex.: Conta BCP à ordem"
                className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">IBAN (opcional)</span>
              <input
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                disabled={busy}
                placeholder="PT50…"
                className="data h-9 rounded-lg border border-gray-200 bg-white px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </label>
          </div>
          {formError && (
            <p role="alert" className="text-[12px] text-red-600">{formError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || clientId === '' || name.trim() === ''}
              className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              Criar conta
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              disabled={busy}
              className="pressable rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {current?.failed ? (
        <div className="flex items-center gap-2 py-4 text-[12px] text-gray-500">
          Não foi possível carregar as contas.
          <button onClick={reload} className="pressable flex items-center gap-1 font-semibold text-gray-700">
            <RefreshCw className="h-3 w-3" /> Repetir
          </button>
        </div>
      ) : items === null ? (
        <div className="flex items-center gap-2 py-4 text-[12px] text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar contas…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center">
          <Landmark className="h-6 w-6 stroke-[1] text-gray-300" />
          <p className="text-[12px] text-gray-500">
            Sem contas bancárias. {canManage ? 'Crie a primeira para importar extratos.' : ''}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Cliente', 'Conta', 'IBAN', 'Por conciliar'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((a, i) => (
                <tr
                  key={a.id}
                  className={cn('hover:bg-gray-50', i < items.length - 1 && 'border-b border-gray-100')}
                >
                  <td className="px-3 py-2 font-semibold text-gray-700">{a.clientName}</td>
                  <td className="px-3 py-2 text-gray-600">{a.name}</td>
                  <td className="data px-3 py-2 text-gray-500">{a.iban ?? '—'}</td>
                  <td className="px-3 py-2">
                    {a.unreconciledCount > 0 ? (
                      <button
                        onClick={() => onFilterAccount?.(a.id)}
                        className="pressable rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100"
                      >
                        {a.unreconciledCount}
                      </button>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
