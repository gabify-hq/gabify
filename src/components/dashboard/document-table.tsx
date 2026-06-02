'use client'

import { useState } from 'react'
import { FileText, ExternalLink } from 'lucide-react'
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
    if (confidence >= 0.85) return 'text-green-600'
    if (confidence >= 0.6) return 'text-amber-600'
    return 'text-red-500'
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {!hideClientFilter && (
          <Select value={filterClient} onValueChange={handleClientChange}>
            <SelectTrigger className="h-8 w-[200px] border-gray-200 bg-white text-[12px] text-gray-600 focus:ring-green-400">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12px]">Todos os clientes</SelectItem>
              {MOCK_CLIENTS.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-[12px]">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={filterType} onValueChange={handleTypeChange}>
          <SelectTrigger className="h-8 w-[160px] border-gray-200 bg-white text-[12px] text-gray-600 focus:ring-green-400">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[12px]">Todos os tipos</SelectItem>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key} className="text-[12px]">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPeriod} onValueChange={handlePeriodChange}>
          <SelectTrigger className="h-8 w-[120px] border-gray-200 bg-white text-[12px] text-gray-600 focus:ring-green-400">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[12px]">Todos</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p} value={p} className="data text-[12px]">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto data text-[11px] text-gray-400">
          {filtered.length} doc{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-100 bg-gray-50 hover:bg-gray-50">
              <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Ficheiro
              </TableHead>
              {!hideClientFilter && (
                <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Cliente
                </TableHead>
              )}
              <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Tipo
              </TableHead>
              <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Período
              </TableHead>
              <TableHead className="h-9 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Valor
              </TableHead>
              <TableHead className="h-9 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Conf.
              </TableHead>
              <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Estado
              </TableHead>
              <TableHead className="h-9 w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((doc) => (
              <TableRow
                key={doc.id}
                className="border-gray-100 transition-colors duration-100 hover:bg-gray-50"
              >
                <TableCell className="py-2.5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-gray-400" />
                    <span className="max-w-[220px] truncate text-[12px] font-medium text-gray-700">
                      {doc.filename}
                    </span>
                  </div>
                </TableCell>
                {!hideClientFilter && (
                  <TableCell className="py-2.5 text-[12px] text-gray-500">
                    {doc.clientName}
                  </TableCell>
                )}
                <TableCell className="py-2.5 text-[12px] text-gray-500">
                  {doc.typeLabel}
                </TableCell>
                <TableCell className="py-2.5">
                  <span className="data text-[11px] text-gray-400">{doc.period}</span>
                </TableCell>
                <TableCell className="py-2.5 text-right">
                  <span className="data text-[12px] font-semibold text-gray-700">
                    {doc.extractedAmount != null
                      ? `€${doc.extractedAmount.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`
                      : <span className="font-normal text-gray-300">-</span>}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-right">
                  <span className={cn('data text-[12px] font-bold', confidenceClass(doc.confidence))}>
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
                    className="pressable rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    title="Ver documento"
                    onClick={() => setPreviewDoc(doc)}
                  >
                    <ExternalLink className="h-3.5 w-3.5 stroke-[1.75]" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-gray-100">
                <TableCell colSpan={hideClientFilter ? 7 : 8} className="py-12 text-center text-[12px] text-gray-400">
                  Nenhum documento encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Document preview modal */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="modal-enter max-w-sm border-gray-200 bg-white shadow-xl">
          <DialogHeader>
            <DialogTitle className="truncate text-[13px] font-bold text-gray-900">
              {previewDoc?.filename}
            </DialogTitle>
          </DialogHeader>
          {previewDoc && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-gray-50 p-4 text-[12px]">
                <dt className="text-gray-400">Tipo</dt>
                <dd className="font-semibold text-gray-800">{previewDoc.typeLabel}</dd>
                <dt className="text-gray-400">Cliente</dt>
                <dd className="font-semibold text-gray-800">{previewDoc.clientName}</dd>
                <dt className="text-gray-400">Período</dt>
                <dd className="data font-semibold text-gray-800">{previewDoc.period}</dd>
                {previewDoc.extractedDate && (
                  <>
                    <dt className="text-gray-400">Data doc.</dt>
                    <dd className="data font-semibold text-gray-800">{previewDoc.extractedDate}</dd>
                  </>
                )}
                {previewDoc.extractedAmount != null && (
                  <>
                    <dt className="text-gray-400">Valor</dt>
                    <dd className="data font-bold text-green-700">
                      €{previewDoc.extractedAmount.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                    </dd>
                  </>
                )}
                {previewDoc.extractedVATNumber && (
                  <>
                    <dt className="text-gray-400">NIF</dt>
                    <dd className="data font-semibold text-gray-800">{previewDoc.extractedVATNumber}</dd>
                  </>
                )}
                <dt className="text-gray-400">Confiança AI</dt>
                <dd className={cn('data font-bold', confidenceClass(previewDoc.confidence))}>
                  {Math.round(previewDoc.confidence * 100)}%
                </dd>
              </dl>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  Localização R2
                </p>
                <code className="break-all text-[10px] text-gray-500">{previewDoc.r2Key}</code>
              </div>
              <p className="text-[10px] text-gray-400">
                Em produção: signed URL com expiração de 1 hora.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
