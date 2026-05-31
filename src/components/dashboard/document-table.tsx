'use client'

import { useState } from 'react'
import { FileText, ExternalLink, X } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatusPill } from './status-badge'
import type { MockDocument } from '@/lib/mock-data'
import { MOCK_CLIENTS, DOCUMENT_TYPE_LABELS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

interface DocumentTableProps {
  documents: MockDocument[]
  hideClientFilter?: boolean
}

export function DocumentTable({ documents, hideClientFilter = false }: DocumentTableProps) {
  const [filterClient, setFilterClient] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterPeriod, setFilterPeriod] = useState<string>('all')
  const [previewDoc, setPreviewDoc] = useState<MockDocument | null>(null)

  const handleClientChange = (v: string | null) => setFilterClient(v ?? 'all')
  const handleTypeChange = (v: string | null) => setFilterType(v ?? 'all')
  const handlePeriodChange = (v: string | null) => setFilterPeriod(v ?? 'all')

  const periods = Array.from(new Set(documents.map((d) => d.period))).sort().reverse()

  const filtered = documents.filter((doc) => {
    if (filterClient !== 'all' && doc.clientId !== filterClient) return false
    if (filterType !== 'all' && doc.type !== filterType) return false
    if (filterPeriod !== 'all' && doc.period !== filterPeriod) return false
    return true
  })

  const docStatusVariant = (status: MockDocument['status']) => {
    if (status === 'CLASSIFIED') return 'classified' as const
    if (status === 'NEEDS_REVIEW') return 'needs-review' as const
    return 'reviewed' as const
  }

  const docStatusLabel = (status: MockDocument['status']) => {
    if (status === 'CLASSIFIED') return 'Classificado'
    if (status === 'NEEDS_REVIEW') return 'Rever'
    return 'Confirmado'
  }

  const confidenceClass = (confidence: number) => {
    if (confidence >= 0.85) return 'text-green-400'
    if (confidence >= 0.6) return 'text-amber-400'
    return 'text-red-400'
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {!hideClientFilter && (
          <Select value={filterClient} onValueChange={handleClientChange}>
            <SelectTrigger className="h-7 w-[200px] border-zinc-700 bg-zinc-900 text-[12px] text-zinc-300 focus:ring-zinc-600">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-900">
              <SelectItem value="all" className="text-[12px] text-zinc-300">Todos os clientes</SelectItem>
              {MOCK_CLIENTS.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-[12px] text-zinc-300">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={filterType} onValueChange={handleTypeChange}>
          <SelectTrigger className="h-7 w-[160px] border-zinc-700 bg-zinc-900 text-[12px] text-zinc-300 focus:ring-zinc-600">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent className="border-zinc-700 bg-zinc-900">
            <SelectItem value="all" className="text-[12px] text-zinc-300">Todos os tipos</SelectItem>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key} className="text-[12px] text-zinc-300">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPeriod} onValueChange={handlePeriodChange}>
          <SelectTrigger className="h-7 w-[120px] border-zinc-700 bg-zinc-900 text-[12px] text-zinc-300 focus:ring-zinc-600">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent className="border-zinc-700 bg-zinc-900">
            <SelectItem value="all" className="text-[12px] text-zinc-300">Todos</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p} value={p} className="data text-[12px] text-zinc-300">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto data text-[11px] text-zinc-600">
          {filtered.length} doc{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border border-zinc-800 bg-zinc-900 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="h-9 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                Ficheiro
              </TableHead>
              {!hideClientFilter && (
                <TableHead className="h-9 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  Cliente
                </TableHead>
              )}
              <TableHead className="h-9 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                Tipo
              </TableHead>
              <TableHead className="h-9 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                Período
              </TableHead>
              <TableHead className="h-9 text-right text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                Valor
              </TableHead>
              <TableHead className="h-9 text-right text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                Conf.
              </TableHead>
              <TableHead className="h-9 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                Estado
              </TableHead>
              <TableHead className="h-9 w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((doc) => (
              <TableRow
                key={doc.id}
                className="border-zinc-800/60 hover:bg-zinc-800/30 transition-colors duration-100"
              >
                <TableCell className="py-2.5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-zinc-600" />
                    <span className="max-w-[220px] truncate text-[12px] text-zinc-300">
                      {doc.filename}
                    </span>
                  </div>
                </TableCell>
                {!hideClientFilter && (
                  <TableCell className="py-2.5 text-[12px] text-zinc-500">
                    {doc.clientName}
                  </TableCell>
                )}
                <TableCell className="py-2.5 text-[12px] text-zinc-400">
                  {doc.typeLabel}
                </TableCell>
                <TableCell className="py-2.5">
                  <span className="data text-[11px] text-zinc-600">{doc.period}</span>
                </TableCell>
                <TableCell className="py-2.5 text-right">
                  <span className="data text-[12px] text-zinc-300">
                    {doc.extractedAmount != null
                      ? `€${doc.extractedAmount.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`
                      : <span className="text-zinc-700">—</span>}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-right">
                  <span className={cn('data text-[12px] font-semibold', confidenceClass(doc.confidence))}>
                    {Math.round(doc.confidence * 100)}%
                  </span>
                </TableCell>
                <TableCell className="py-2.5">
                  <StatusPill
                    variant={docStatusVariant(doc.status)}
                    label={docStatusLabel(doc.status)}
                  />
                </TableCell>
                <TableCell className="py-2.5">
                  <button
                    className="pressable rounded p-1 text-zinc-700 transition-colors hover:bg-zinc-800 hover:text-zinc-400"
                    title="Ver documento"
                    onClick={() => setPreviewDoc(doc)}
                  >
                    <ExternalLink className="h-3.5 w-3.5 stroke-[1.5]" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-zinc-800">
                <TableCell colSpan={hideClientFilter ? 7 : 8} className="py-12 text-center text-[12px] text-zinc-600">
                  Nenhum documento encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Document preview modal */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="modal-enter max-w-sm border-zinc-800 bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="truncate text-[13px] font-semibold text-zinc-200">
              {previewDoc?.filename}
            </DialogTitle>
          </DialogHeader>
          {previewDoc && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-zinc-950 p-3 text-[12px]">
                <dt className="text-zinc-600">Tipo</dt>
                <dd className="font-medium text-zinc-200">{previewDoc.typeLabel}</dd>
                <dt className="text-zinc-600">Cliente</dt>
                <dd className="font-medium text-zinc-200">{previewDoc.clientName}</dd>
                <dt className="text-zinc-600">Período</dt>
                <dd className="data font-medium text-zinc-200">{previewDoc.period}</dd>
                {previewDoc.extractedDate && (
                  <>
                    <dt className="text-zinc-600">Data doc.</dt>
                    <dd className="data font-medium text-zinc-200">{previewDoc.extractedDate}</dd>
                  </>
                )}
                {previewDoc.extractedAmount != null && (
                  <>
                    <dt className="text-zinc-600">Valor</dt>
                    <dd className="data font-semibold text-zinc-100">
                      €{previewDoc.extractedAmount.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                    </dd>
                  </>
                )}
                {previewDoc.extractedVATNumber && (
                  <>
                    <dt className="text-zinc-600">NIF</dt>
                    <dd className="data font-medium text-zinc-200">{previewDoc.extractedVATNumber}</dd>
                  </>
                )}
                <dt className="text-zinc-600">Confiança AI</dt>
                <dd className={cn('data font-semibold', confidenceClass(previewDoc.confidence))}>
                  {Math.round(previewDoc.confidence * 100)}%
                </dd>
              </dl>
              <div className="rounded-md bg-zinc-950 p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  Localização R2
                </p>
                <code className="break-all text-[10px] text-zinc-500">{previewDoc.r2Key}</code>
              </div>
              <p className="text-[10px] text-zinc-700">
                Em produção: signed URL com expiração de 1 hora.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
