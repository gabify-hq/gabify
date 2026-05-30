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
import { StatusBadge } from './status-badge'
import type { MockDocument } from '@/lib/mock-data'
import { MOCK_CLIENTS, DOCUMENT_TYPE_LABELS } from '@/lib/mock-data'

interface DocumentTableProps {
  documents: MockDocument[]
}

export function DocumentTable({ documents }: DocumentTableProps) {
  const [filterClient, setFilterClient] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterPeriod, setFilterPeriod] = useState<string>('all')

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

  const confidenceLabel = (confidence: number): string => {
    if (confidence >= 0.9) return `${Math.round(confidence * 100)}%`
    return `${Math.round(confidence * 100)}%`
  }

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

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterClient} onValueChange={handleClientChange}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue placeholder="Todos os clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {MOCK_CLIENTS.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={handleTypeChange}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPeriod} onValueChange={handlePeriodChange}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-neutral-500">
          {filtered.length} documento{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[280px] text-xs">Ficheiro</TableHead>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs">Período</TableHead>
              <TableHead className="text-xs">Valor</TableHead>
              <TableHead className="text-xs">Confiança</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((doc) => (
              <TableRow key={doc.id} className="hover:bg-neutral-50">
                <TableCell className="py-2.5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
                    <span className="max-w-[240px] truncate text-xs text-neutral-700">
                      {doc.filename}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-2.5 text-xs text-neutral-600">
                  {doc.clientName}
                </TableCell>
                <TableCell className="py-2.5">
                  <span className="text-xs text-neutral-600">{doc.typeLabel}</span>
                </TableCell>
                <TableCell className="py-2.5 text-xs text-neutral-500">
                  {doc.period}
                </TableCell>
                <TableCell className="py-2.5 text-xs text-neutral-700">
                  {doc.extractedAmount != null
                    ? `€${doc.extractedAmount.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`
                    : '—'}
                </TableCell>
                <TableCell className="py-2.5">
                  <span
                    className={
                      doc.confidence >= 0.85
                        ? 'text-xs text-green-600'
                        : doc.confidence >= 0.6
                          ? 'text-xs text-yellow-600'
                          : 'text-xs text-red-600'
                    }
                  >
                    {confidenceLabel(doc.confidence)}
                  </span>
                </TableCell>
                <TableCell className="py-2.5">
                  <StatusBadge
                    variant={docStatusVariant(doc.status)}
                    label={docStatusLabel(doc.status)}
                  />
                </TableCell>
                <TableCell className="py-2.5">
                  <button
                    className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                    title="Ver documento"
                    // TODO: open signed URL from R2
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-neutral-400">
                  Nenhum documento encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
