'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Database, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Ligações — Fontes" section of the client page: Moloni and InvoiceXpress as
 * SOURCE connectors (pull of issued invoices only — no destination toggle, no
 * dry-run). Each row shows the connection state, a credentials form with
 * how-to-obtain instructions, last sync + imported count, a "Sincronizar agora"
 * button, errors, and a permanent "NÃO TESTADA CONTRA API REAL" warning.
 */

export type SourceSystemSlug = 'moloni' | 'invoicexpress'

export interface SourceConnectionInfo {
  status: 'ATIVA' | 'ERRO' | 'DESLIGADA'
  pullEnabled: boolean
  lastPullAt: string | null // DD/MM/YYYY HH:mm or null
  lastError: string | null
  importedCount: number
  hasCredentials: boolean
  accountName?: string // InvoiceXpress
  companyId?: number // Moloni
  companyName?: string // Moloni
}

interface FieldSpec {
  key: string
  label: string
  type: 'text' | 'password' | 'number'
  placeholder?: string
}

interface SystemSpec {
  slug: SourceSystemSlug
  label: string
  fields: FieldSpec[]
  instructions: string
}

const SYSTEMS: SystemSpec[] = [
  {
    slug: 'moloni',
    label: 'Moloni',
    fields: [
      { key: 'companyId', label: 'ID da empresa (company_id)', type: 'number', placeholder: 'ex: 12345' },
      { key: 'companyName', label: 'Nome da empresa (opcional)', type: 'text' },
      { key: 'username', label: 'Utilizador Moloni (email)', type: 'text' },
      { key: 'password', label: 'Palavra-passe Moloni', type: 'password' },
    ],
    instructions:
      'Introduza o utilizador e a palavra-passe da conta Moloni do cliente e o ID da empresa (Moloni → Definições → Empresas). As credenciais são guardadas cifradas.',
  },
  {
    slug: 'invoicexpress',
    label: 'InvoiceXpress',
    fields: [
      { key: 'accountName', label: 'Nome da conta (subdomínio)', type: 'text', placeholder: 'ex: a-minha-empresa' },
      { key: 'apiKey', label: 'Chave de API (api_key)', type: 'password' },
    ],
    instructions:
      'O subdomínio é a parte antes de .app.invoicexpress.com. A chave de API obtém-se no InvoiceXpress → Definições → Conta → Chave de API. É guardada cifrada.',
  },
]

const STATUS_LABELS: Record<SourceConnectionInfo['status'], string> = {
  ATIVA: 'Ativa',
  ERRO: 'Erro',
  DESLIGADA: 'Desligada',
}
const STATUS_STYLES: Record<SourceConnectionInfo['status'], string> = {
  ATIVA: 'bg-green-50 text-green-700',
  ERRO: 'bg-red-50 text-red-500',
  DESLIGADA: 'bg-gray-100 text-gray-400',
}

const NOT_TESTED_WARNING =
  'Conector implementado mas NÃO TESTADO contra a API real. Valide os primeiros documentos importados manualmente.'

interface SourceConnectionsPanelProps {
  clientId: string
  moloni: SourceConnectionInfo | null
  invoicexpress: SourceConnectionInfo | null
  canManage: boolean
}

export function SourceConnectionsPanel({
  clientId,
  moloni,
  invoicexpress,
  canManage,
}: SourceConnectionsPanelProps) {
  const byslug: Record<SourceSystemSlug, SourceConnectionInfo | null> = { moloni, invoicexpress }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h2 className="text-[13px] font-semibold text-gray-800">Ligações — Fontes de faturação</h2>
      </div>
      <p className="flex items-start gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 stroke-[2]" />
        {NOT_TESTED_WARNING}
      </p>
      {SYSTEMS.map((spec) => (
        <SourceConnectionRow
          key={spec.slug}
          clientId={clientId}
          spec={spec}
          connection={byslug[spec.slug]}
          canManage={canManage}
        />
      ))}
    </div>
  )
}

function SourceConnectionRow({
  clientId,
  spec,
  connection,
  canManage,
}: {
  clientId: string
  spec: SystemSpec
  connection: SourceConnectionInfo | null
  canManage: boolean
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const basePath = `/api/clients/${clientId}/sources/${spec.slug}`

  async function call(path: string, init: RequestInit, busyKey: string): Promise<boolean> {
    setBusy(busyKey)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? 'O pedido falhou — tente novamente')
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('Sem ligação ao servidor')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function saveConnection(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const payload: Record<string, unknown> = {}
    for (const field of spec.fields) {
      const value = form[field.key] ?? ''
      if (field.type === 'number') {
        if (value !== '') payload[field.key] = Number(value)
      } else {
        payload[field.key] = value
      }
    }
    const ok = await call(basePath, { method: 'PUT', body: JSON.stringify(payload) }, 'save')
    if (ok) {
      setShowForm(false)
      setForm({})
      setNotice('Ligação guardada (credenciais cifradas).')
    }
  }

  async function togglePull(value: boolean): Promise<void> {
    const ok = await call(basePath, { method: 'PATCH', body: JSON.stringify({ pullEnabled: value }) }, 'pull')
    if (ok) {
      setNotice(value ? 'Importação de faturas emitidas ativada.' : 'Importação desativada.')
    }
  }

  async function syncNow(): Promise<void> {
    setBusy('sync')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`${basePath}/sync`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? 'Não foi possível iniciar a sincronização')
        return
      }
      setNotice('Sincronização em fila — os documentos novos aparecem em breve.')
      router.refresh()
    } catch {
      setError('Sem ligação ao servidor')
    } finally {
      setBusy(null)
    }
  }

  async function disconnect(): Promise<void> {
    if (!window.confirm(`Desligar a ligação ${spec.label} deste cliente?`)) return
    await call(basePath, { method: 'DELETE' }, 'disconnect')
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-gray-700">{spec.label}</span>
        {connection && (
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLES[connection.status])}>
            {STATUS_LABELS[connection.status]}
          </span>
        )}
        {connection && connection.pullEnabled && (
          <span className="text-[11px] text-gray-400">
            Última sincronização: {connection.lastPullAt ?? 'nunca'} · {connection.importedCount} importado
            {connection.importedCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {connection && connection.status !== 'DESLIGADA' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <input
              type="checkbox"
              role="switch"
              checked={connection.pullEnabled}
              disabled={!canManage || busy === 'pull'}
              onChange={(e) => togglePull(e.target.checked)}
              aria-label={`Fonte ${spec.label}: importar faturas emitidas`}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            Importar faturas emitidas
          </label>
          {connection.pullEnabled && canManage && (
            <button
              type="button"
              onClick={syncNow}
              disabled={busy === 'sync'}
              className="pressable flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-300 disabled:opacity-50"
            >
              {busy === 'sync' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 stroke-[2]" />}
              Sincronizar agora
            </button>
          )}
        </div>
      )}

      {connection?.lastError && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-[11px] text-red-600">
          Último erro: {connection.lastError}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-[12px] text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-green-100 bg-green-50 px-3 py-1.5 text-[12px] text-green-700">
          {notice}
        </p>
      )}

      {!connection && !showForm && (
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-gray-400">Sem ligação {spec.label}.</span>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="pressable rounded-lg bg-green-600 px-3 py-1.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-green-700"
            >
              Ligar ao {spec.label}
            </button>
          )}
        </div>
      )}

      {connection && !showForm && canManage && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="pressable rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
          >
            Editar credenciais
          </button>
          {connection.status !== 'DESLIGADA' && (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy === 'disconnect'}
              className="pressable rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:border-red-200 hover:text-red-500 disabled:opacity-50"
            >
              Desligar
            </button>
          )}
        </div>
      )}

      {showForm && canManage && (
        <form onSubmit={saveConnection} className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[11px] text-gray-500">{spec.instructions}</p>
          {spec.fields.map((field) => (
            <label key={field.key} className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{field.label}</span>
              <input
                type={field.type === 'number' ? 'text' : field.type}
                inputMode={field.type === 'number' ? 'numeric' : undefined}
                required={field.key !== 'companyName'}
                value={form[field.key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                disabled={busy === 'save'}
                placeholder={field.placeholder}
                className="data mt-0.5 h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400 disabled:bg-gray-50"
              />
            </label>
          ))}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy === 'save'}
              className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {busy === 'save' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar ligação
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="pressable rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-500 transition-colors hover:border-gray-300"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
