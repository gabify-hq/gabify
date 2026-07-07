'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check, X, ChevronLeft, ChevronDown, ChevronUp, Loader2, AlertTriangle, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DOCUMENT_TYPE_LABELS } from '@/lib/document-types'
import type { ClientOptionDTO } from '@/server/dto'
import type { DocumentType, UserRole } from '@/types'

export interface CorrectionDocumentDTO {
  id: string
  version: number
  status: string
  type: string
  typeLabel: string
  filename: string
  mimeType: string
  hasFile: boolean
  confidence: number | null
  extractionSource: string | null
  flags: string[]
  supplierName: string | null
  supplierNif: string | null
  documentNumber: string | null
  issueDate: string // DD/MM/YYYY or ''
  dueDate: string | null
  currency: string
  vatBreakdown: Array<{ region?: string; rate: number; baseCents: number; vatCents: number }>
  withholdingCents: number | null
  totalCents: number | null
  accountCode: string | null
  accountIsSuggestion: boolean
  vatTreatment: string | null
  clientId: string | null
  suggestedClientId: string | null
}

interface DocumentCorrectionFormProps {
  document: CorrectionDocumentDTO
  clients: ClientOptionDTO[]
  role: UserRole
}

const VAT_TREATMENTS = ['DEDUTIVEL_TOTAL', 'NAO_DEDUTIVEL', 'AUTOLIQUIDACAO', 'ISENTO'] as const

const VAT_TREATMENT_LABELS: Record<string, string> = {
  DEDUTIVEL_TOTAL: 'Dedutível total',
  NAO_DEDUTIVEL: 'Não dedutível',
  AUTOLIQUIDACAO: 'Autoliquidação',
  ISENTO: 'Isento',
}

const FLAG_LABELS: Record<string, string> = {
  DUPLICATE_SUSPECT: 'Duplicado?',
  WRONG_CLIENT_SUSPECT: 'Cliente errado?',
  SENDER_UNVERIFIED: 'Remetente não verificado',
  TOO_LARGE_FOR_AUTOSPLIT: 'Grande demais p/ divisão automática',
  ARITHMETIC_MISMATCH: 'Totais não batem certo',
  VAT_SENSITIVE: 'IVA a confirmar',
}

const EXTRACTION_LABELS: Record<string, string> = {
  QR: 'QR fiscal AT',
  XML: 'Fatura eletrónica (XML)',
  AI_TEXT: 'Leitura automática (texto)',
  AI_PDF: 'Leitura automática (PDF)',
  AI_VISION: 'Leitura automática (imagem)',
  IMPORT: 'Importado de folha',
}

function centsToEuroInput(cents: number | null): string {
  if (cents === null) return ''
  const euros = Math.trunc(Math.abs(cents) / 100)
  const rest = String(Math.abs(cents) % 100).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}${euros},${rest}`
}

function euroInputToCents(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '').replace('€', '')
  if (trimmed === '') return null
  const normalized = trimmed.replace(',', '.')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100)
}

function centsToDisplay(cents: number): string {
  return `${centsToEuroInput(cents)} €`
}

/**
 * Field-by-field correction (S3.1) with the file preview alongside.
 * Client-side coherence check is a WARNING only — the server stays the
 * authority (A1 tolerance, optimistic locking A7 on submit).
 */
export function DocumentCorrectionForm({ document: doc, clients, role }: DocumentCorrectionFormProps) {
  const router = useRouter()
  const canWrite = role !== 'VIEWER'
  const isLocked = doc.status === 'EXPORTED' || doc.status === 'SPLIT'

  // Editable fields (subset the review API accepts — see HANDOFF for the rest)
  const [type, setType] = useState(doc.type)
  const [supplierName, setSupplierName] = useState(doc.supplierName ?? '')
  const [supplierNif, setSupplierNif] = useState(doc.supplierNif ?? '')
  const [documentNumber, setDocumentNumber] = useState(doc.documentNumber ?? '')
  const [issueDate, setIssueDate] = useState(doc.issueDate)
  const [totalInput, setTotalInput] = useState(centsToEuroInput(doc.totalCents))
  const [accountCode, setAccountCode] = useState(doc.accountCode ?? '')
  const [vatTreatment, setVatTreatment] = useState(doc.vatTreatment ?? '')
  const [clientId, setClientId] = useState(doc.clientId ?? '')

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false) // mobile collapse
  const [busy, setBusy] = useState<'validate' | 'reject' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  useEffect(() => {
    if (!doc.hasFile) return
    let cancelled = false
    fetch(`/api/documents/${doc.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error()
        const { data } = await res.json()
        if (!cancelled) setPreviewUrl(data.url)
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true)
      })
    return () => {
      cancelled = true
    }
  }, [doc.id, doc.hasFile])

  // Client-side coherence: Σbases + ΣIVA − retenção vs total (gross OR net
  // convention, mirroring the server) — warning only, never a block
  const coherence = useMemo(() => {
    const totalCents = euroInputToCents(totalInput)
    if (totalCents === null || doc.vatBreakdown.length === 0) return null
    const bases = doc.vatBreakdown.reduce((acc, b) => acc + b.baseCents, 0)
    const vats = doc.vatBreakdown.reduce((acc, b) => acc + b.vatCents, 0)
    const withholding = doc.withholdingCents ?? 0
    const grossDelta = Math.abs(bases + vats - totalCents)
    const netDelta = Math.abs(bases + vats - withholding - totalCents)
    const delta = Math.min(grossDelta, netDelta)
    return { delta, coherent: delta <= 2 }
  }, [totalInput, doc.vatBreakdown, doc.withholdingCents])

  function buildCorrections(): Record<string, unknown> {
    const corrections: Record<string, unknown> = {}
    if (type !== doc.type) corrections.type = type
    if (supplierName !== (doc.supplierName ?? '')) corrections.supplierName = supplierName
    if (supplierNif !== (doc.supplierNif ?? '') && /^\d{9}$/.test(supplierNif)) {
      corrections.supplierNif = supplierNif
    }
    if (documentNumber !== (doc.documentNumber ?? '')) corrections.documentNumber = documentNumber
    if (issueDate !== doc.issueDate && issueDate.trim() !== '') corrections.issueDate = issueDate
    const totalCents = euroInputToCents(totalInput)
    if (totalCents !== null && totalCents !== doc.totalCents) corrections.totalCents = totalCents
    if (accountCode !== (doc.accountCode ?? '') && accountCode.trim() !== '') {
      corrections.accountCode = accountCode.trim()
    }
    if (vatTreatment !== (doc.vatTreatment ?? '') && vatTreatment !== '') {
      corrections.vatTreatment = vatTreatment
    }
    if (clientId !== (doc.clientId ?? '') && clientId !== '') corrections.clientId = clientId
    return corrections
  }

  async function submit(action: 'validate' | 'reject'): Promise<void> {
    setBusy(action)
    setErrorMessage(null)
    setConflict(false)
    try {
      const corrections = action === 'validate' ? buildCorrections() : {}
      const hasCorrections = Object.keys(corrections).length > 0
      const res = await fetch(`/api/documents/${doc.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: action === 'reject' ? 'reject' : hasCorrections ? 'correct' : 'validate',
          expectedVersion: doc.version,
          ...(hasCorrections ? { corrections } : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        if (res.status === 409) {
          setConflict(true)
          setErrorMessage('Documento atualizado por outro utilizador. Recarregue para ver a versão atual — as suas alterações mantêm-se neste formulário.')
        } else {
          setErrorMessage(data?.error ?? 'Ocorreu um erro. Tente novamente.')
        }
        return // never lose the user's input on failure
      }
      router.push('/review')
      router.refresh()
    } catch {
      setErrorMessage('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setBusy(null)
    }
  }

  const dirty = Object.keys(buildCorrections()).length > 0

  const fieldClass =
    'h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-green-400 disabled:bg-gray-50 disabled:text-gray-400'
  const labelClass = 'text-[10px] font-bold uppercase tracking-wider text-gray-400'

  const preview = doc.hasFile ? (
    previewError ? (
      <div className="flex h-full min-h-[200px] items-center justify-center text-[12px] text-gray-400">
        Não foi possível carregar a pré-visualização.
      </div>
    ) : previewUrl ? (
      doc.mimeType.startsWith('image/') ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={`Pré-visualização de ${doc.filename}`} className="h-full w-full object-contain" />
      ) : (
        <iframe src={previewUrl} title={`Pré-visualização de ${doc.filename}`} className="h-full w-full" />
      )
    ) : (
      <div className="flex h-full min-h-[200px] items-center justify-center gap-2 text-[12px] text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar pré-visualização…
      </div>
    )
  ) : (
    <div className="flex h-full min-h-[200px] items-center justify-center text-[12px] text-gray-400">
      Sem ficheiro associado.
    </div>
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-2.5">
        <Link
          href="/review"
          className="pressable flex items-center gap-1 text-[12px] font-medium text-gray-400 transition-colors hover:text-gray-700"
        >
          <ChevronLeft className="h-3.5 w-3.5 stroke-2" />
          Fila de revisão
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-gray-700">
            <FileText className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-gray-400" />
            {doc.filename}
          </span>
          {doc.extractionSource && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {EXTRACTION_LABELS[doc.extractionSource] ?? doc.extractionSource}
            </span>
          )}
          {doc.confidence !== null && (
            <span
              className={cn(
                'data rounded px-1.5 py-0.5 text-[10px] font-bold',
                doc.confidence >= 0.85 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
              )}
            >
              {Math.round(doc.confidence * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* Mobile-first: collapsible preview above the fields; side-by-side from lg */}
      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* Preview pane */}
        <div className="border-b border-gray-200 lg:flex-1 lg:border-b-0 lg:border-r">
          <button
            onClick={() => setPreviewOpen((open) => !open)}
            className="flex w-full items-center justify-between px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-gray-400 lg:hidden"
            aria-expanded={previewOpen}
          >
            Pré-visualização
            {previewOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <div className={cn('h-[45vh] lg:block lg:h-full', previewOpen ? 'block' : 'hidden')}>
            {preview}
          </div>
        </div>

        {/* Fields pane */}
        <div className="flex w-full shrink-0 flex-col gap-4 bg-gray-50 p-5 lg:w-[440px] lg:overflow-y-auto">
          {doc.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {doc.flags.map((flag) => (
                <span
                  key={flag}
                  className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600 ring-1 ring-red-100"
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {FLAG_LABELS[flag] ?? flag}
                </span>
              ))}
            </div>
          )}

          {isLocked && (
            <p className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-[12px] text-gray-500">
              Documento exportado — apenas o proprietário pode reabrir (com motivo).
            </p>
          )}

          {/* Editable fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Tipo de documento</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={!canWrite || isLocked}
                className={fieldClass}
              >
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Fornecedor</span>
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                disabled={!canWrite || isLocked}
                placeholder="Nome do fornecedor"
                className={fieldClass}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}>NIF fornecedor</span>
              <input
                value={supplierNif}
                onChange={(e) => setSupplierNif(e.target.value)}
                disabled={!canWrite || isLocked}
                placeholder="9 dígitos"
                inputMode="numeric"
                className={cn(fieldClass, 'data', supplierNif !== '' && !/^\d{9}$/.test(supplierNif) && 'border-amber-300')}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}>Nº documento</span>
              <input
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                disabled={!canWrite || isLocked}
                placeholder="FT A/123"
                className={cn(fieldClass, 'data')}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}>Data (DD/MM/AAAA)</span>
              <input
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                disabled={!canWrite || isLocked}
                placeholder="31/12/2026"
                className={cn(fieldClass, 'data')}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}>Total ({doc.currency})</span>
              <input
                value={totalInput}
                onChange={(e) => setTotalInput(e.target.value)}
                disabled={!canWrite || isLocked}
                placeholder="0,00"
                inputMode="decimal"
                className={cn(fieldClass, 'data text-right font-semibold')}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}>
                Conta SNC{doc.accountIsSuggestion && accountCode === (doc.accountCode ?? '') ? ' (sugestão)' : ''}
              </span>
              <input
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                disabled={!canWrite || isLocked}
                placeholder="6221"
                className={cn(fieldClass, 'data')}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}>Tratamento de IVA</span>
              <select
                value={vatTreatment}
                onChange={(e) => setVatTreatment(e.target.value)}
                disabled={!canWrite || isLocked}
                className={fieldClass}
              >
                <option value="">—</option>
                {VAT_TREATMENTS.map((t) => (
                  <option key={t} value={t}>{VAT_TREATMENT_LABELS[t]}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Cliente</span>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={!canWrite || isLocked}
                className={fieldClass}
              >
                <option value="">Por atribuir</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.id === doc.suggestedClientId ? ' (sugerido)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* VAT breakdown — read-only: the review API does not accept per-rate
              corrections yet (see HANDOFF.md); shown here to feed the coherence check */}
          {doc.vatBreakdown.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white">
              <p className="border-b border-gray-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                IVA por taxa (leitura)
              </p>
              <table className="w-full text-[12px]">
                <tbody>
                  {doc.vatBreakdown.map((band, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-1.5 text-gray-500">{band.rate}%{band.region && band.region !== 'PT' ? ` (${band.region})` : ''}</td>
                      <td className="data px-3 py-1.5 text-right text-gray-700">{centsToDisplay(band.baseCents)}</td>
                      <td className="data px-3 py-1.5 text-right text-gray-700">{centsToDisplay(band.vatCents)}</td>
                    </tr>
                  ))}
                  {doc.withholdingCents !== null && doc.withholdingCents !== 0 && (
                    <tr>
                      <td className="px-3 py-1.5 text-gray-500">Retenção</td>
                      <td />
                      <td className="data px-3 py-1.5 text-right text-red-600">−{centsToDisplay(doc.withholdingCents)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Coherence warning — advisory only, the server is the authority */}
          {coherence && !coherence.coherent && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              As bases + IVA − retenção não correspondem ao total (diferença de {centsToDisplay(coherence.delta)}). Pode validar na mesma — o servidor fará a verificação final.
            </p>
          )}

          {errorMessage && (
            <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600">
              {errorMessage}
              {conflict && (
                <button
                  onClick={() => router.refresh()}
                  className="ml-2 font-semibold underline hover:text-red-800"
                >
                  Recarregar
                </button>
              )}
            </p>
          )}

          {/* Actions */}
          {canWrite && !isLocked && (
            <div className="flex gap-2">
              <button
                onClick={() => submit('validate')}
                disabled={busy !== null}
                className="pressable flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {busy === 'validate' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                )}
                {dirty ? 'Guardar correções e validar' : 'Validar'}
              </button>
              <button
                onClick={() => submit('reject')}
                disabled={busy !== null}
                className="pressable flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
              >
                {busy === 'reject' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5 stroke-[2.5]" />
                )}
                Rejeitar
              </button>
            </div>
          )}
          {!canWrite && (
            <p className="text-center text-[12px] text-gray-400">
              Sem permissões de revisão — consulta apenas.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
