'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FolderDown } from 'lucide-react'
import type { ClientOptionDTO } from '@/server/dto'

interface ExportFormProps {
  clients: ClientOptionDTO[]
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Export request form (audit F1.3): pick client(s) + period, optionally
 * re-include already-exported documents. Submits to POST /api/exports, which
 * only enqueues — the history below shows progress.
 */
export function ExportForm({ clients }: ExportFormProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [periodFrom, setPeriodFrom] = useState(currentMonth())
  const [periodTo, setPeriodTo] = useState(currentMonth())
  const [includeExported, setIncludeExported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function toggleClient(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((c) => c !== id)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (periodFrom > periodTo) {
      setError('O mês inicial não pode ser depois do mês final.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(selected.length > 0 ? { clientIds: selected } : {}),
          periodFrom,
          periodTo,
          includeExported,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? 'Não foi possível iniciar a exportação.')
        return
      }
      setNotice('Exportação em curso — aparece no histórico abaixo quando terminar.')
      router.refresh()
    } catch {
      setError('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Clientes (vazio = todos)
        </p>
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {clients.map((client) => (
            <label key={client.id} className="flex items-center gap-2 text-[12px] text-gray-700">
              <input
                type="checkbox"
                checked={selected.includes(client.id)}
                onChange={(e) => toggleClient(client.id, e.target.checked)}
                disabled={busy}
                className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-400"
              />
              {client.name}
            </label>
          ))}
          {clients.length === 0 && (
            <p className="text-[12px] text-gray-400">Ainda não há clientes.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            De (mês)
          </span>
          <input
            type="month"
            value={periodFrom}
            onChange={(e) => setPeriodFrom(e.target.value)}
            disabled={busy}
            required
            className="data mt-0.5 block h-8 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Até (mês)
          </span>
          <input
            type="month"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
            disabled={busy}
            required
            className="data mt-0.5 block h-8 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-[12px] text-gray-600">
          <input
            type="checkbox"
            checked={includeExported}
            onChange={(e) => setIncludeExported(e.target.checked)}
            disabled={busy}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          Incluir já exportados
        </label>
        <button
          type="submit"
          disabled={busy}
          className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FolderDown className="h-3.5 w-3.5 stroke-[2]" />
          )}
          Exportar
        </button>
      </div>
      <p className="text-[11px] text-gray-400">
        Só documentos validados entram na exportação. O ficheiro é um ZIP organizado por
        Cliente/Ano/Mês com lancamentos.csv, resumo_iva.csv e lancamentos.xlsx.
      </p>

      {error && (
        <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-[12px] text-green-700">
          {notice}
        </p>
      )}
    </form>
  )
}
