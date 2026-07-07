'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, ExternalLink, Loader2, RefreshCw, Send, Sparkles } from 'lucide-react'

/**
 * Read-only assistant chat (mobile-first, pt-PT).
 *
 * History lives in memory only — nothing persisted client-side (v1).
 * Tool results arrive structured from the API so tables/CSV come from the
 * SERVER data, never from text the model produced.
 */

interface ToolTrace {
  tool: string
  input: Record<string, unknown>
  data: unknown
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  results?: ToolTrace[]
  failed?: boolean
}

const SUGGESTED_QUESTIONS = [
  'Faturas da EDP acima de 100€ em maio',
  'Total de IVA a 23% por fornecedor este trimestre',
  'Há faturas duplicadas?',
  'Movimentos bancários por conciliar',
]

const DOC_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING_CLASSIFICATION: { label: 'Por classificar', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  CLASSIFIED: { label: 'Classificado', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  NEEDS_REVIEW: { label: 'A rever', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  REVIEWED: { label: 'Revisto', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  PRE_VALIDATED: { label: 'Pré-validado', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  VALIDATED: { label: 'Validado', className: 'bg-green-50 text-green-700 ring-green-200' },
  EXPORTED: { label: 'Exportado', className: 'bg-green-50 text-green-700 ring-green-200' },
  SPLIT: { label: 'Dividido', className: 'bg-gray-100 text-gray-500 ring-gray-200' },
  ERROR: { label: 'Erro', className: 'bg-red-50 text-red-700 ring-red-200' },
}

const TX_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  UNRECONCILED: { label: 'Por conciliar', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  SUGGESTED: { label: 'Sugerida', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  RECONCILED: { label: 'Conciliada', className: 'bg-green-50 text-green-700 ring-green-200' },
  IGNORED: { label: 'Ignorada', className: 'bg-gray-100 text-gray-500 ring-gray-200' },
}

const GROUP_BY_LABEL: Record<string, string> = {
  supplier: 'Fornecedor',
  client: 'Cliente',
  vatRate: 'Taxa de IVA (%)',
  month: 'Mês',
}

const METRIC_LABEL: Record<string, string> = {
  total: 'Total',
  base: 'Base',
  vat: 'IVA',
}

/** Integer-cents → "1 234,56 €" (display only — no float arithmetic). */
function formatCentsPt(cents: number | null): string {
  if (cents === null) return '—'
  const sign = cents < 0 ? '−' : ''
  const abs = Math.abs(cents)
  const euros = Math.floor(abs / 100)
  const rest = String(abs % 100).padStart(2, '0')
  return `${sign}${euros.toLocaleString('pt-PT')},${rest} €`
}

/** Integer-cents → "1234,56" for CSV (A9: decimal comma). */
function csvCents(cents: number | null): string {
  if (cents === null) return ''
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

function isoToPt(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

interface TableSpec {
  title: string
  headers: string[]
  rows: string[][]
  /** Pre-formatted display rows (may differ from CSV rows, e.g. badges). */
  display?: React.ReactNode[][]
  link?: { href: string; label: string }
}

interface DocumentItem {
  id: string
  status: string
  supplierName: string | null
  supplierNif: string | null
  documentNumber: string | null
  issueDate: string | null
  totalCents: number | null
  clientName: string | null
}

interface AggregateData {
  groupBy: string
  metric: string
  groups: Array<{ key: string; valueCents: number; count: number }>
}

interface BankTxItem {
  id: string
  bookingDate: string
  description: string
  amountCents: number
  status: string
  accountName: string
  clientName: string
}

interface SummaryData {
  byStatus: Record<string, { count: number; sumCents: number }>
}

function statusBadge(map: Record<string, { label: string; className: string }>, status: string) {
  const badge = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-600 ring-gray-200' }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${badge.className}`}>
      {badge.label}
    </span>
  )
}

function toTableSpec(trace: ToolTrace): TableSpec | null {
  if (trace.tool === 'search_documents' || trace.tool === 'find_duplicate_suspects') {
    const items = (trace.data as { items?: DocumentItem[] }).items ?? []
    if (items.length === 0) return null
    const isDuplicates = trace.tool === 'find_duplicate_suspects'
    const statusParam = typeof trace.input.status === 'string' ? trace.input.status : null
    return {
      title: isDuplicates ? 'Suspeitos de duplicado' : 'Documentos',
      headers: ['Fornecedor', 'NIF', 'Nº doc', 'Data', 'Cliente', 'Estado', 'Total'],
      rows: items.map((d) => [
        d.supplierName ?? '',
        d.supplierNif ?? '',
        d.documentNumber ?? '',
        isoToPt(d.issueDate),
        d.clientName ?? '',
        DOC_STATUS_BADGE[d.status]?.label ?? d.status,
        csvCents(d.totalCents),
      ]),
      display: items.map((d) => [
        d.supplierName ?? '—',
        d.supplierNif ?? '—',
        d.documentNumber ?? '—',
        isoToPt(d.issueDate),
        d.clientName ?? '—',
        statusBadge(DOC_STATUS_BADGE, d.status),
        <span key="t" className="tabular-nums">{formatCentsPt(d.totalCents)}</span>,
      ]),
      link: isDuplicates
        ? { href: '/review?flag=DUPLICATE_SUSPECT', label: 'Ver na fila de revisão' }
        : {
            href: statusParam ? `/review?status=${encodeURIComponent(statusParam)}` : '/documents',
            label: statusParam ? 'Ver na fila de revisão' : 'Ver em documentos',
          },
    }
  }

  if (trace.tool === 'aggregate_documents') {
    const data = trace.data as AggregateData
    if (!data.groups || data.groups.length === 0) return null
    const keyLabel = GROUP_BY_LABEL[data.groupBy] ?? data.groupBy
    const metricLabel = METRIC_LABEL[data.metric] ?? data.metric
    return {
      title: `${metricLabel} por ${keyLabel.toLowerCase()}`,
      headers: [keyLabel, `${metricLabel} (€)`, 'Nº docs'],
      rows: data.groups.map((g) => [g.key, csvCents(g.valueCents), String(g.count)]),
      display: data.groups.map((g) => [
        g.key,
        <span key="v" className="tabular-nums">{formatCentsPt(g.valueCents)}</span>,
        String(g.count),
      ]),
      link: { href: '/documents', label: 'Ver em documentos' },
    }
  }

  if (trace.tool === 'search_bank_transactions') {
    const items = (trace.data as { items?: BankTxItem[] }).items ?? []
    if (items.length === 0) return null
    const statusParam = typeof trace.input.status === 'string' ? trace.input.status : null
    return {
      title: 'Movimentos bancários',
      headers: ['Data', 'Descrição', 'Conta', 'Cliente', 'Estado', 'Montante'],
      rows: items.map((t) => [
        isoToPt(t.bookingDate),
        t.description,
        t.accountName,
        t.clientName,
        TX_STATUS_BADGE[t.status]?.label ?? t.status,
        csvCents(t.amountCents),
      ]),
      display: items.map((t) => [
        isoToPt(t.bookingDate),
        t.description,
        t.accountName,
        t.clientName,
        statusBadge(TX_STATUS_BADGE, t.status),
        <span key="a" className="tabular-nums">{formatCentsPt(t.amountCents)}</span>,
      ]),
      link: {
        href: statusParam ? `/bank?status=${encodeURIComponent(statusParam)}` : '/bank',
        label: 'Ver no banco',
      },
    }
  }

  if (trace.tool === 'reconciliation_summary') {
    const data = trace.data as SummaryData
    const statuses = Object.keys(data.byStatus ?? {})
    if (statuses.length === 0) return null
    return {
      title: 'Resumo de conciliação',
      headers: ['Estado', 'Nº movimentos', 'Soma (€)'],
      rows: statuses.map((s) => [
        TX_STATUS_BADGE[s]?.label ?? s,
        String(data.byStatus[s].count),
        csvCents(data.byStatus[s].sumCents),
      ]),
      display: statuses.map((s) => [
        statusBadge(TX_STATUS_BADGE, s),
        String(data.byStatus[s].count),
        <span key="s" className="tabular-nums">{formatCentsPt(data.byStatus[s].sumCents)}</span>,
      ]),
      link: { href: '/bank', label: 'Ver no banco' },
    }
  }

  return null
}

/** CSV pt-PT (A9): UTF-8 BOM, `;` separator, decimal comma. Client-side only. */
function downloadCsv(spec: TableSpec): void {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const lines = [
    spec.headers.map(escape).join(';'),
    ...spec.rows.map((row) => row.map(escape).join(';')),
  ]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `assistente-${spec.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function ResultTable({ trace }: { trace: ToolTrace }) {
  const spec = toTableSpec(trace)
  if (!spec) return null
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
        <span className="text-[11px] font-semibold text-gray-700">{spec.title}</span>
        <div className="flex items-center gap-3">
          {spec.link && (
            <Link
              href={spec.link.href}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 hover:underline"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              {spec.link.label}
            </Link>
          )}
          <button
            type="button"
            onClick={() => downloadCsv(spec)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label={`Exportar tabela ${spec.title} em CSV`}
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              {spec.headers.map((header) => (
                <th key={header} className="whitespace-nowrap px-3 py-1.5 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(spec.display ?? spec.rows).map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="whitespace-nowrap px-3 py-1.5 text-gray-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = scrollRef.current
    if (element && typeof element.scrollTo === 'function') {
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, isLoading])

  async function send(question: string) {
    const trimmed = question.trim()
    if (trimmed === '' || isLoading) return

    // In-memory session history — user/assistant text turns only, capped at 20
    const history = messages
      .filter((m) => !m.failed)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }))

    setMessages((current) => [...current, { role: 'user', content: trimmed }])
    setInput('')
    setIsLoading(true)
    try {
      const response = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, history }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.success) {
        const message =
          typeof body?.error === 'string'
            ? body.error
            : 'O assistente não conseguiu responder — tente novamente'
        setMessages((current) => [
          ...current,
          { role: 'assistant', content: message, failed: true },
        ])
        return
      }
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: body.data.answer, results: body.data.results ?? [] },
      ])
    } catch {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: 'Sem ligação — verifique a internet e tente novamente', failed: true },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  function retryLast() {
    const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastQuestion) return
    // Drop the trailing failed exchange before retrying
    setMessages((current) => {
      const next = [...current]
      if (next.at(-1)?.failed) next.pop()
      if (next.at(-1)?.role === 'user') next.pop()
      return next
    })
    void send(lastQuestion.content)
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {isEmpty && (
          <div className="mx-auto flex max-w-lg flex-col items-center gap-4 pt-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <Sparkles className="h-5 w-5 text-green-700" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold text-gray-800">
                Pergunte sobre os dados do seu gabinete
              </h2>
              <p className="mt-1 text-[12px] text-gray-500">
                O assistente só consulta — nunca altera nada. Cada resposta cita os dados
                encontrados e pode ser exportada em CSV.
              </p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void send(question)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-[12px] font-medium text-gray-700 transition-colors hover:border-green-300 hover:bg-green-50"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {messages.map((message, index) => (
            <div
              key={index}
              className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  message.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-green-600 px-3.5 py-2 text-[13px] text-white'
                    : message.failed
                      ? 'max-w-[85%] rounded-2xl rounded-bl-sm border border-red-200 bg-red-50 px-3.5 py-2 text-[13px] text-red-700'
                      : 'w-full max-w-[95%] rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-3.5 py-2 text-[13px] text-gray-800'
                }
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.failed && (
                  <button
                    type="button"
                    onClick={retryLast}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 underline"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Tentar novamente
                  </button>
                )}
                {message.results?.map((trace, traceIndex) => (
                  <ResultTable key={traceIndex} trace={trace} />
                ))}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-3.5 py-2 text-[12px] text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                A consultar os dados…
              </div>
            </div>
          )}
        </div>
      </div>

      <form
        className="border-t border-gray-200 bg-white px-4 py-3 sm:px-6"
        onSubmit={(event) => {
          event.preventDefault()
          void send(input)
        }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <label htmlFor="assistant-question" className="sr-only">
            Pergunta ao assistente
          </label>
          <input
            id="assistant-question"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ex.: total de IVA a 23% por fornecedor este trimestre"
            maxLength={1000}
            disabled={isLoading}
            className="h-10 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-green-400 focus:bg-white focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isLoading || input.trim() === ''}
            aria-label="Enviar pergunta"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl text-[10px] text-gray-400">
          O assistente é apenas de consulta — não cria, altera nem apaga dados. O histórico
          desta conversa não fica guardado.
        </p>
      </form>
    </div>
  )
}
