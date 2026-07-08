'use client'

import { useState } from 'react'
import {
  ChevronDown, ChevronRight, FileText, Eye, Download,
  AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS } from '@/lib/document-types'
import type { DocumentType, DocumentStatus } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TimelineDocument {
  id: string
  type: string
  /** REAL lifecycle state (audit F1.2) — never collapsed into 3 buckets. */
  status: DocumentStatus
  confidence: number
  filename: string
  /** Intake source label (pt-PT): Email, Carregado, Portal do cliente… */
  sourceLabel: string
  extractedDate: string | null
  extractedAmount: number | null
  extractedVATNumber: string | null
  r2Key: string | null
  classificationSource: string | null
}

export interface TimelinePeriod {
  key: string           // YYYY-MM
  label: string         // "Abril 2026"
  documents: TimelineDocument[]
  needsReviewCount: number
}

interface ClientDocumentTimelineProps {
  periods: TimelinePeriod[]
}

const SOURCE_LABEL: Record<string, string> = {
  'at-qr-code':       'QR Code Fiscal AT',
  'filename-pattern': 'Nome do ficheiro',
  'claude-vision':    'Visão artificial (imagem)',
  'claude-pdf':       'Leitura de PDF',
  'claude-text':      'Análise de texto',
}

// ── Type badge colours ─────────────────────────────────────────────────────────

const TYPE_COLOUR: Record<string, string> = {
  AT_COMMUNICATION: 'bg-blue-50 text-blue-600',
  BANK_STATEMENT:   'bg-purple-50 text-purple-600',
  INVOICE_RECEIPT:  'bg-green-50 text-green-600',
  INVOICE_RECEIVED: 'bg-emerald-50 text-emerald-600',
  INVOICE_ISSUED:   'bg-teal-50 text-teal-600',
  RECEIPT:          'bg-gray-100 text-gray-500',
  PAYROLL:          'bg-orange-50 text-orange-600',
  TAX_DOCUMENT:     'bg-red-50 text-red-500',
  SOCIAL_SECURITY:  'bg-cyan-50 text-cyan-600',
  CONTRACT:         'bg-indigo-50 text-indigo-600',
  BALANCE_SHEET:    'bg-slate-100 text-slate-600',
  INCOME_STATEMENT: 'bg-slate-100 text-slate-600',
  OTHER:            'bg-gray-100 text-gray-400',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceClass(c: number) {
  if (c >= 0.85) return 'text-green-600'
  if (c >= 0.6)  return 'text-amber-600'
  return 'text-red-500'
}

function typeLabel(type: string) {
  return DOCUMENT_TYPE_LABELS[type as DocumentType] ?? type
}

// ── Period section ────────────────────────────────────────────────────────────

function PeriodSection({ period, defaultOpen }: { period: TimelinePeriod; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [preview, setPreview] = useState<TimelineDocument | null>(null)

  const allOk = period.needsReviewCount === 0
  const StatusIcon = allOk ? CheckCircle2 : AlertTriangle
  const statusColour = allOk ? 'text-green-400' : 'text-amber-400'

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Period header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="pressable flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 stroke-[2] text-gray-400" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 stroke-[2] text-gray-400" />}

        <span className="flex-1 text-[13px] font-semibold text-gray-800">{period.label}</span>

        <span className="data text-[11px] text-gray-400">
          {period.documents.length} doc{period.documents.length !== 1 ? 's' : ''}
        </span>

        {period.needsReviewCount > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-amber-500">
            <AlertTriangle className="h-3 w-3 stroke-[2]" />
            {period.needsReviewCount} para rever
          </span>
        )}

        <StatusIcon className={cn('h-3.5 w-3.5 shrink-0 stroke-[2]', statusColour)} />
      </button>

      {/* Document rows */}
      {open && (
        <div className="divide-y divide-gray-100">
          {period.documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-gray-300" />

              {/* Type badge */}
              <span className={cn(
                'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                TYPE_COLOUR[doc.type] ?? TYPE_COLOUR.OTHER
              )}>
                {typeLabel(doc.type)}
              </span>

              {/* Filename */}
              <span className="min-w-0 flex-1 truncate text-[12px] text-gray-700">
                {doc.filename}
              </span>

              {/* Intake source */}
              <span className="hidden shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 sm:inline">
                {doc.sourceLabel}
              </span>

              {/* Amount */}
              {doc.extractedAmount != null && (
                <span className="data shrink-0 text-[12px] font-semibold text-gray-700">
                  €{doc.extractedAmount.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                </span>
              )}

              {/* Confidence */}
              <span className={cn('data shrink-0 text-[11px] font-bold', confidenceClass(doc.confidence))}>
                {Math.round(doc.confidence * 100)}%
              </span>

              {/* Status dot — real lifecycle state */}
              <span
                title={DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
                className={cn('h-1.5 w-1.5 shrink-0 rounded-full', {
                  'bg-amber-400':
                    doc.status === 'NEEDS_REVIEW' || doc.status === 'PRE_VALIDATED',
                  'bg-green-400':
                    doc.status === 'VALIDATED' ||
                    doc.status === 'EXPORTED' ||
                    doc.status === 'CLASSIFIED' ||
                    doc.status === 'REVIEWED',
                  'bg-blue-400': doc.status === 'PENDING_CLASSIFICATION',
                  'bg-gray-300': doc.status === 'SPLIT',
                })}
              />

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  className="pressable rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  title="Pré-visualizar"
                  onClick={() => setPreview(doc)}
                >
                  <Eye className="h-3.5 w-3.5 stroke-[1.75]" />
                </button>
                <button
                  className="pressable rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  title="Descarregar"
                  onClick={async () => {
                    const res = await fetch(`/api/documents/${doc.id}`)
                    if (!res.ok) return
                    const { data } = await res.json()
                    window.open(data.url, '_blank')
                  }}
                >
                  <Download className="h-3.5 w-3.5 stroke-[1.75]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="modal-enter max-w-sm border-gray-200 bg-white shadow-xl">
          <DialogHeader>
            <DialogTitle className="truncate text-[13px] font-bold text-gray-900">
              {preview?.filename}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-gray-50 p-4 text-[12px]">
                <dt className="text-gray-400">Tipo</dt>
                <dd className="font-semibold text-gray-800">{typeLabel(preview.type)}</dd>
                <dt className="text-gray-400">Estado</dt>
                <dd className={cn('font-semibold', {
                  'text-amber-600':
                    preview.status === 'NEEDS_REVIEW' || preview.status === 'PRE_VALIDATED',
                  'text-blue-600': preview.status === 'PENDING_CLASSIFICATION',
                  'text-green-600':
                    preview.status !== 'NEEDS_REVIEW' &&
                    preview.status !== 'PRE_VALIDATED' &&
                    preview.status !== 'PENDING_CLASSIFICATION',
                })}>
                  {DOCUMENT_STATUS_LABELS[preview.status] ?? preview.status}
                </dd>
                <dt className="text-gray-400">Origem</dt>
                <dd className="font-semibold text-gray-800">{preview.sourceLabel}</dd>
                {preview.extractedDate && (
                  <>
                    <dt className="text-gray-400">Data doc.</dt>
                    <dd className="data font-semibold text-gray-800">{preview.extractedDate}</dd>
                  </>
                )}
                {preview.extractedAmount != null && (
                  <>
                    <dt className="text-gray-400">Valor</dt>
                    <dd className="data font-bold text-green-700">
                      €{preview.extractedAmount.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                    </dd>
                  </>
                )}
                {preview.extractedVATNumber && (
                  <>
                    <dt className="text-gray-400">NIF emitente</dt>
                    <dd className="data font-semibold text-gray-800">{preview.extractedVATNumber}</dd>
                  </>
                )}
                <dt className="text-gray-400">Confiança AI</dt>
                <dd className={cn('data font-bold', confidenceClass(preview.confidence))}>
                  {Math.round(preview.confidence * 100)}%
                </dd>
                {preview.classificationSource && (
                  <>
                    <dt className="text-gray-400">Origem</dt>
                    <dd className="font-semibold text-gray-800">
                      {SOURCE_LABEL[preview.classificationSource] ?? preview.classificationSource}
                    </dd>
                  </>
                )}
              </dl>
              <button
                className="pressable flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
                onClick={async () => {
                  const res = await fetch(`/api/documents/${preview.id}`)
                  if (!res.ok) return
                  const { data } = await res.json()
                  window.open(data.url, '_blank')
                }}
              >
                <Download className="h-3.5 w-3.5 stroke-[1.75]" />
                Descarregar ficheiro
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientDocumentTimeline({ periods }: ClientDocumentTimelineProps) {
  if (periods.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-12">
        <div className="flex flex-col items-center gap-2 text-center">
          <Clock className="h-8 w-8 text-gray-200" />
          <p className="text-[12px] text-gray-400">Nenhum documento recebido ainda.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {periods.map((period, i) => (
        <PeriodSection key={period.key} period={period} defaultOpen={i === 0} />
      ))}
    </div>
  )
}
