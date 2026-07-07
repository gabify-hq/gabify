'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, Trash2, Power } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Bank rules CRUD (fase C3) — applied before matching, first match by
 * ascending priority. IGNORE auto-ignores; SUGGEST_CLIENT redirects
 * candidate matching to the target client.
 */

interface RuleDTO {
  id: string
  bankAccountId: string | null
  bankAccountName: string | null
  matchType: 'CONTAINS' | 'EQUALS' | 'SIMPLE_REGEX'
  pattern: string
  action: 'IGNORE' | 'SUGGEST_CLIENT'
  targetClientId: string | null
  targetClientName: string | null
  priority: number
  active: boolean
}

interface Option {
  id: string
  name: string
}

const MATCH_LABELS: Record<RuleDTO['matchType'], string> = {
  CONTAINS: 'Contém',
  EQUALS: 'Igual',
  SIMPLE_REGEX: 'Regex simples',
}

const ACTION_LABELS: Record<RuleDTO['action'], string> = {
  IGNORE: 'Ignorar',
  SUGGEST_CLIENT: 'Sugerir cliente',
}

export function BankRulesManager({ clients }: { clients: Option[] }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ attempt: number; items: RuleDTO[] | null; failed: boolean } | null>(null)
  const [accounts, setAccounts] = useState<Array<Option & { clientName: string }>>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    matchType: 'CONTAINS' as RuleDTO['matchType'],
    pattern: '',
    action: 'IGNORE' as RuleDTO['action'],
    targetClientId: '',
    bankAccountId: '',
    priority: '100',
  })

  useEffect(() => {
    fetch('/api/bank/accounts?limit=200')
      .then(async (res) => (res.ok ? (await res.json()).data.items : []))
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/bank/rules?limit=200')
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

  async function createRule(): Promise<void> {
    setCreating(true)
    setFormError(null)
    try {
      const res = await fetch('/api/bank/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchType: form.matchType,
          pattern: form.pattern.trim(),
          action: form.action,
          ...(form.action === 'SUGGEST_CLIENT' ? { targetClientId: form.targetClientId } : {}),
          ...(form.bankAccountId !== '' ? { bankAccountId: form.bankAccountId } : {}),
          priority: Number(form.priority) || 100,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setFormError(body?.error ?? 'Não foi possível criar a regra.')
        return
      }
      setForm({ matchType: 'CONTAINS', pattern: '', action: 'IGNORE', targetClientId: '', bankAccountId: '', priority: '100' })
      reload()
    } catch {
      setFormError('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setCreating(false)
    }
  }

  async function toggleRule(rule: RuleDTO): Promise<void> {
    setBusyId(rule.id)
    try {
      await fetch(`/api/bank/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !rule.active }),
      })
      reload()
    } finally {
      setBusyId(null)
    }
  }

  async function deleteRule(rule: RuleDTO): Promise<void> {
    setBusyId(rule.id)
    try {
      await fetch(`/api/bank/rules/${rule.id}`, { method: 'DELETE' })
      reload()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Create form */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void createRule()
        }}
        className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nova regra</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <select
            value={form.matchType}
            onChange={(e) => setForm({ ...form, matchType: e.target.value as RuleDTO['matchType'] })}
            aria-label="Tipo de correspondência"
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            {Object.entries(MATCH_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input
            required
            value={form.pattern}
            onChange={(e) => setForm({ ...form, pattern: e.target.value })}
            placeholder="Padrão na descrição"
            aria-label="Padrão"
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-400 lg:col-span-2"
          />
          <select
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value as RuleDTO['action'] })}
            aria-label="Ação"
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            {Object.entries(ACTION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          {form.action === 'SUGGEST_CLIENT' ? (
            <select
              required
              value={form.targetClientId}
              onChange={(e) => setForm({ ...form, targetClientId: e.target.value })}
              aria-label="Cliente alvo"
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-400"
            >
              <option value="">Cliente alvo…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <select
              value={form.bankAccountId}
              onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
              aria-label="Conta bancária"
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-400"
            >
              <option value="">Todas as contas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.clientName} — {a.name}</option>
              ))}
            </select>
          )}
          <button
            type="submit"
            disabled={creating || form.pattern.trim() === '' || (form.action === 'SUGGEST_CLIENT' && form.targetClientId === '')}
            className="pressable flex h-9 items-center justify-center gap-1 rounded-lg bg-green-600 px-3 text-[12px] font-bold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Criar
          </button>
        </div>
        {formError && (
          <p role="alert" className="text-[12px] text-red-600">{formError}</p>
        )}
      </form>

      {/* Rules table */}
      {current?.failed ? (
        <div className="flex items-center gap-2 py-4 text-[12px] text-gray-500">
          Não foi possível carregar as regras.
          <button onClick={reload} className="pressable flex items-center gap-1 font-semibold text-gray-700">
            <RefreshCw className="h-3 w-3" /> Repetir
          </button>
        </div>
      ) : items === null ? (
        <div className="flex items-center gap-2 py-4 text-[12px] text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar regras…
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-[12px] text-gray-500">
          Sem regras. As regras aplicam-se antes do matching — por exemplo, ignorar comissões bancárias.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Prioridade', 'Correspondência', 'Padrão', 'Ação', 'Âmbito', 'Estado', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={r.id} className={cn('hover:bg-gray-50', i < items.length - 1 && 'border-b border-gray-100')}>
                  <td className="data px-3 py-2 text-gray-500">{r.priority}</td>
                  <td className="px-3 py-2 text-gray-600">{MATCH_LABELS[r.matchType]}</td>
                  <td className="data px-3 py-2 font-semibold text-gray-800">{r.pattern}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {ACTION_LABELS[r.action]}
                    {r.targetClientName && <span className="text-gray-400"> → {r.targetClientName}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.bankAccountName ?? 'Todas as contas'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                        r.active
                          ? 'bg-green-50 text-green-700 ring-green-200'
                          : 'bg-gray-100 text-gray-500 ring-gray-200'
                      )}
                    >
                      {r.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1">
                      <button
                        disabled={busyId === r.id}
                        onClick={() => void toggleRule(r)}
                        aria-label={r.active ? `Desativar regra ${r.pattern}` : `Ativar regra ${r.pattern}`}
                        className="pressable rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button
                        disabled={busyId === r.id}
                        onClick={() => void deleteRule(r)}
                        aria-label={`Apagar regra ${r.pattern}`}
                        className="pressable rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </span>
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
