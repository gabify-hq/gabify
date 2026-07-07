'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plug, Send, Eye, AlertTriangle, X, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Ligações" section of the client page — a LIST of external-system
 * connections where TOConline is the first entry (system, state, independent
 * source/destination capability toggles: pull of issued invoices / push of
 * purchases). The whole integration is doc-driven and was NEVER tested
 * against the real TOConline API — the UI says so, and connections are born
 * in dry-run: pushes only write previews until the OWNER explicitly goes
 * live, and pulls only preview the documents they would create.
 */

export interface ToconlineConnectionInfo {
  status: 'ACTIVE' | 'ERROR' | 'DISABLED'
  dryRun: boolean
  oauthUrl: string
  apiUrl: string
  oauthClientId: string
  lastError: string | null
  pullEnabled: boolean
  pushEnabled: boolean
  lastPullAt: string | null // DD/MM/YYYY HH:mm or null
}

export interface ToconlinePushableDocument {
  id: string
  number: string
  date: string // DD/MM/YYYY
  supplier: string
  total: string // formatted euros
  pushStatus: 'PENDING' | 'SENT' | 'ERROR' | null
  pushError: string | null
}

interface ToconlineIntegrationPanelProps {
  clientId: string
  connection: ToconlineConnectionInfo | null
  documents: ToconlinePushableDocument[]
  /** Documents imported from this system (source API_PULL) for this client. */
  importedCount: number
  canManage: boolean
  canGoLive: boolean
}

const CONNECTION_LABELS: Record<ToconlineConnectionInfo['status'], string> = {
  ACTIVE: 'Ativa',
  ERROR: 'Erro',
  DISABLED: 'Desligada',
}
const CONNECTION_STYLES: Record<ToconlineConnectionInfo['status'], string> = {
  ACTIVE: 'bg-green-50 text-green-700',
  ERROR: 'bg-red-50 text-red-500',
  DISABLED: 'bg-gray-100 text-gray-400',
}

const PUSH_LABELS: Record<NonNullable<ToconlinePushableDocument['pushStatus']>, string> = {
  PENDING: 'Pendente',
  SENT: 'Enviado',
  ERROR: 'Erro',
}
const PUSH_STYLES: Record<NonNullable<ToconlinePushableDocument['pushStatus']>, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  SENT: 'bg-green-50 text-green-700',
  ERROR: 'bg-red-50 text-red-500',
}

interface PreviewEntry {
  id: string
  endpoint: string
  method: string
  body: unknown
  createdAt: string
}

const GO_LIVE_WARNING =
  'Esta integração nunca foi testada contra o TOConline real. Ativar envia documentos reais.'

export function ToconlineIntegrationPanel({
  clientId,
  connection,
  documents,
  importedCount,
  canManage,
  canGoLive,
}: ToconlineIntegrationPanelProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ oauthUrl: '', apiUrl: '', oauthClientId: '', oauthClientSecret: '' })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmGoLive, setConfirmGoLive] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewDoc, setPreviewDoc] = useState<string | null>(null)
  const [previews, setPreviews] = useState<PreviewEntry[] | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

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
    const ok = await call(
      `/api/clients/${clientId}/toconline`,
      { method: 'PUT', body: JSON.stringify(form) },
      'save',
    )
    if (ok) {
      setShowForm(false)
      setForm({ oauthUrl: '', apiUrl: '', oauthClientId: '', oauthClientSecret: '' })
      setNotice('Ligação guardada. Verifique o estado — as credenciais foram validadas junto do TOConline.')
    }
  }

  async function setCapability(field: 'pullEnabled' | 'pushEnabled', value: boolean): Promise<void> {
    const ok = await call(
      `/api/clients/${clientId}/toconline`,
      { method: 'PATCH', body: JSON.stringify({ [field]: value }) },
      `capability-${field}`,
    )
    if (ok) {
      setNotice(
        field === 'pullEnabled'
          ? value
            ? 'Importação de faturas emitidas ativada.'
            : 'Importação de faturas emitidas desativada.'
          : value
            ? 'Envio de compras ativado nesta ligação.'
            : 'Envio de compras desativado nesta ligação.',
      )
    }
  }

  async function syncNow(): Promise<void> {
    setBusy('sync')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/toconline/pull`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? 'Não foi possível iniciar a sincronização')
        return
      }
      setNotice(
        body?.data?.dryRun
          ? 'Sincronização em fila (modo de teste — só serão geradas pré-visualizações).'
          : 'Sincronização em fila — os documentos novos aparecem em breve.',
      )
      router.refresh()
    } catch {
      setError('Sem ligação ao servidor')
    } finally {
      setBusy(null)
    }
  }

  async function setDryRun(dryRun: boolean): Promise<void> {
    setConfirmGoLive(false)
    const ok = await call(
      `/api/clients/${clientId}/toconline/dry-run`,
      { method: 'POST', body: JSON.stringify({ dryRun }) },
      'dry-run',
    )
    if (ok) setNotice(dryRun ? 'Modo de teste (dry-run) ativado.' : 'Envios reais ATIVADOS.')
  }

  async function disconnect(): Promise<void> {
    if (!window.confirm('Desligar a integração TOConline deste cliente?')) return
    await call(`/api/clients/${clientId}/toconline`, { method: 'DELETE' }, 'disconnect')
  }

  async function pushSelected(): Promise<void> {
    if (selected.size === 0) return
    setBusy('push')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/toconline/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, documentIds: [...selected] }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? 'Não foi possível iniciar o envio')
        return
      }
      const items: Array<{ queued: boolean; error?: string }> = body?.data?.items ?? []
      const queued = items.filter((i) => i.queued).length
      const refused = items.length - queued
      setNotice(
        `${queued} documento${queued === 1 ? '' : 's'} em fila${
          body?.data?.dryRun ? ' (modo de teste — só será gerada a pré-visualização)' : ''
        }${refused > 0 ? `; ${refused} recusado${refused === 1 ? '' : 's'}` : ''}.`,
      )
      setSelected(new Set())
      router.refresh()
    } catch {
      setError('Sem ligação ao servidor')
    } finally {
      setBusy(null)
    }
  }

  async function openPreview(documentId: string): Promise<void> {
    setPreviewDoc(documentId)
    setPreviews(null)
    setPreviewError(null)
    try {
      const res = await fetch(`/api/documents/${documentId}/toconline`)
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setPreviewError(body?.error ?? 'Não foi possível carregar os detalhes')
        return
      }
      setPreviews(body?.data?.previews ?? [])
    } catch {
      setPreviewError('Sem ligação ao servidor')
    }
  }

  function toggleSelected(id: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectable = documents.filter((d) => d.pushStatus !== 'SENT' && d.pushStatus !== 'PENDING')

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h2 className="text-[13px] font-semibold text-gray-800">Ligações</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
        <span className="text-[12px] font-semibold text-gray-700">TOConline</span>
        {connection && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              CONNECTION_STYLES[connection.status],
            )}
          >
            {CONNECTION_LABELS[connection.status]}
          </span>
        )}
        {connection && connection.status !== 'DISABLED' && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              connection.dryRun ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600',
            )}
          >
            {connection.dryRun ? 'Modo de teste (dry-run)' : 'Envios reais ativos'}
          </span>
        )}

        {/* Capability toggles — source (pull) and destination (push), independent */}
        {connection && connection.status !== 'DISABLED' && (
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 pt-1">
            <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <input
                type="checkbox"
                role="switch"
                checked={connection.pullEnabled}
                disabled={!canManage || busy === 'capability-pullEnabled'}
                onChange={(e) => setCapability('pullEnabled', e.target.checked)}
                aria-label="Fonte: importar faturas emitidas (pull)"
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              Fonte — importar faturas emitidas
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <input
                type="checkbox"
                role="switch"
                checked={connection.pushEnabled}
                disabled={!canManage || busy === 'capability-pushEnabled'}
                onChange={(e) => setCapability('pushEnabled', e.target.checked)}
                aria-label="Destino: enviar compras (push)"
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              Destino — enviar compras
            </label>
            {connection.pullEnabled && (
              <span className="text-[11px] text-gray-400">
                Última sincronização: {connection.lastPullAt ?? 'nunca'} · {importedCount} importado
                {importedCount === 1 ? '' : 's'}
              </span>
            )}
            {connection.pullEnabled && canManage && (
              <button
                type="button"
                onClick={syncNow}
                disabled={busy === 'sync'}
                className="pressable flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-300 disabled:opacity-50"
              >
                {busy === 'sync' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3 stroke-[2]" />
                )}
                Sincronizar agora
              </button>
            )}
          </div>
        )}
      </div>

      <p className="flex items-start gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 stroke-[2]" />
        Integração implementada mas ainda NÃO testada contra o TOConline real. Enquanto o modo de
        teste estiver ativo, os envios apenas geram uma pré-visualização do que seria enviado.
      </p>

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

      {/* ── Connection ── */}
      {!connection && !showForm && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-center">
          <p className="text-[12px] text-gray-400">
            Este cliente ainda não tem ligação ao TOConline.
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="pressable mt-2 rounded-lg bg-green-600 px-3 py-1.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-green-700"
            >
              Ligar ao TOConline
            </button>
          )}
        </div>
      )}

      {connection && !showForm && (
        <div className="space-y-2">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Endereço da API</dt>
              <dd className="data truncate text-[12px] text-gray-700">{connection.apiUrl}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Identificador OAuth</dt>
              <dd className="data truncate text-[12px] text-gray-700">{connection.oauthClientId}</dd>
            </div>
          </dl>
          {connection.lastError && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-[11px] text-red-600">
              Último erro: {connection.lastError}
            </p>
          )}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="pressable rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
              >
                Editar credenciais
              </button>
              {connection.status !== 'DISABLED' && connection.dryRun && canGoLive && (
                <button
                  type="button"
                  onClick={() => setConfirmGoLive(true)}
                  disabled={busy === 'dry-run'}
                  className="pressable rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:border-amber-300 disabled:opacity-50"
                >
                  Ativar envios reais…
                </button>
              )}
              {connection.status !== 'DISABLED' && !connection.dryRun && (
                <button
                  type="button"
                  onClick={() => setDryRun(true)}
                  disabled={busy === 'dry-run'}
                  className="pressable rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600 transition-colors hover:border-blue-300 disabled:opacity-50"
                >
                  Voltar ao modo de teste
                </button>
              )}
              {connection.status !== 'DISABLED' && (
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={busy === 'disconnect'}
                  className="pressable rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:border-red-200 hover:text-red-500 disabled:opacity-50"
                >
                  Desligar integração
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Go-live confirmation — explicit warning required by design */}
      {confirmGoLive && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3" role="alertdialog" aria-label="Confirmar envios reais">
          <p className="flex items-start gap-1.5 text-[12px] font-semibold text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 stroke-[2]" />
            {GO_LIVE_WARNING}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDryRun(false)}
              disabled={busy === 'dry-run'}
              className="pressable rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              {busy === 'dry-run' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Compreendo, ativar envios reais'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmGoLive(false)}
              className="pressable rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-500 transition-colors hover:border-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Credentials form ── */}
      {showForm && canManage && (
        <form onSubmit={saveConnection} className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-[11px] text-gray-500">
            Os 4 dados obtêm-se no TOConline da empresa do cliente: entrar com conta de
            <strong> Empresário</strong> → menu <strong>Empresa → Configurações → Dados API</strong> →
            introduzir os dados do integrador → abrir o link recebido por email (válido 72h).
          </p>
          {(
            [
              ['oauthUrl', 'Endereço de autenticação OAuth (OAUTH_URL)', 'https://…'],
              ['apiUrl', 'Endereço da API (API_URL)', 'https://…'],
              ['oauthClientId', 'Identificador (OAUTH_CLIENT_ID)', ''],
              ['oauthClientSecret', 'Segredo (OAUTH_CLIENT_SECRET)', ''],
            ] as const
          ).map(([key, label, placeholder]) => (
            <label key={key} className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
              <input
                type={key === 'oauthClientSecret' ? 'password' : 'text'}
                required
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                disabled={busy === 'save'}
                placeholder={placeholder}
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
              Guardar e validar ligação
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

      {/* ── Documents to push (destination capability only) ── */}
      {connection && connection.status !== 'DISABLED' && connection.pushEnabled && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Faturas recebidas validadas
            </span>
            {canManage && (
              <button
                type="button"
                onClick={pushSelected}
                disabled={selected.size === 0 || busy === 'push'}
                className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {busy === 'push' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 stroke-[2]" />
                )}
                Enviar para TOConline{selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
            )}
          </div>

          {documents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-center text-[12px] text-gray-400">
              Sem faturas recebidas validadas para enviar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {canManage && <th className="w-8 py-1.5" aria-label="Selecionar" />}
                    <th className="py-1.5 pr-3">Documento</th>
                    <th className="py-1.5 pr-3">Fornecedor</th>
                    <th className="py-1.5 pr-3 text-right">Total</th>
                    <th className="py-1.5 pr-3">Envio</th>
                    <th className="py-1.5" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="text-[12px] text-gray-700 hover:bg-gray-50">
                      {canManage && (
                        <td className="py-1.5">
                          {selectable.some((d) => d.id === doc.id) && (
                            <input
                              type="checkbox"
                              checked={selected.has(doc.id)}
                              onChange={() => toggleSelected(doc.id)}
                              aria-label={`Selecionar ${doc.number}`}
                              className="h-3.5 w-3.5 rounded border-gray-300"
                            />
                          )}
                        </td>
                      )}
                      <td className="py-1.5 pr-3">
                        <span className="data font-medium">{doc.number}</span>
                        <span className="ml-2 text-[11px] text-gray-400">{doc.date}</span>
                      </td>
                      <td className="max-w-[180px] truncate py-1.5 pr-3">{doc.supplier}</td>
                      <td className="data py-1.5 pr-3 text-right">{doc.total}</td>
                      <td className="py-1.5 pr-3">
                        {doc.pushStatus ? (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              PUSH_STYLES[doc.pushStatus],
                            )}
                            title={doc.pushError ?? undefined}
                          >
                            {PUSH_LABELS[doc.pushStatus]}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => openPreview(doc.id)}
                          aria-label={`Ver detalhes do envio de ${doc.number}`}
                          className="pressable inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
                        >
                          <Eye className="h-3 w-3 stroke-[2]" />
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Preview dialog ── */}
      {previewDoc && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3" role="dialog" aria-label="Detalhes do envio">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              O que seria enviado
            </span>
            <button
              type="button"
              onClick={() => setPreviewDoc(null)}
              aria-label="Fechar detalhes"
              className="pressable rounded p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {previewError && <p className="text-[12px] text-red-600">{previewError}</p>}
          {!previews && !previewError && (
            <p className="flex items-center gap-1.5 text-[12px] text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…
            </p>
          )}
          {previews && previews.length === 0 && (
            <p className="text-[12px] text-gray-400">
              Ainda não há pré-visualizações para este documento — envie-o em modo de teste primeiro.
            </p>
          )}
          {previews?.map((p) => (
            <div key={p.id} className="rounded-lg border border-gray-200 bg-white p-2">
              <p className="data text-[11px] font-semibold text-gray-600">
                {p.method} {p.endpoint}
              </p>
              <pre className="data mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2 text-[11px] text-gray-600">
                {JSON.stringify(p.body, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
