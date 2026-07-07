'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Upload, Loader2, CheckCircle2, AlertCircle, ChevronLeft, Download, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClientOptionDTO } from '@/server/dto'

interface ImportWizardProps {
  clients: ClientOptionDTO[]
  canWrite: boolean
}

type Mapping = {
  date: string
  documentNumber: string
  supplierNif: string
  netAmount: string
  vatRate: string
  totalAmount: string
}

const FIELD_LABELS: Record<keyof Mapping, string> = {
  date: 'Data',
  documentNumber: 'Nº documento',
  supplierNif: 'NIF fornecedor',
  netAmount: 'Base',
  vatRate: 'Taxa de IVA',
  totalAmount: 'Total',
}

interface ReportError {
  line: number
  reason: string
}

type Step =
  | { name: 'pick' }
  | {
      name: 'mapping'
      batchId: string
      mapping: Mapping
      sample: Array<Record<string, string>>
      headers: string[]
      filename: string
    }
  | { name: 'done'; imported: number; errors: ReportError[]; filename: string }

/**
 * Two-step import (S2.4/AC-2.5): nothing is imported until the human confirms
 * the column mapping. Per-line errors are shown and downloadable as CSV.
 */
export function ImportWizard({ clients, canWrite }: ImportWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [clientId, setClientId] = useState('')
  const [step, setStep] = useState<Step>({ name: 'pick' })
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Detected headers come from the API in file order (S5.3); the sample-row
  // keys are only the fallback for responses without them
  const headers = useMemo(() => {
    if (step.name !== 'mapping') return []
    if (step.headers.length > 0) return step.headers
    return step.sample.length > 0 ? Object.keys(step.sample[0]) : []
  }, [step])

  async function uploadSheet(file: File): Promise<void> {
    setBusy(true)
    setErrorMessage(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (clientId) form.append('clientId', clientId)
      const res = await fetch('/api/documents/import', { method: 'POST', body: form })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMessage(body?.error ?? 'Não foi possível ler a folha.')
        return
      }
      setStep({
        name: 'mapping',
        batchId: body.data.batchId,
        mapping: body.data.proposedMapping,
        sample: body.data.sample ?? [],
        headers: ((body.data.headers ?? []) as Array<{ original: string }>).map((h) => h.original),
        filename: file.name,
      })
    } catch {
      setErrorMessage('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport(): Promise<void> {
    if (step.name !== 'mapping') return
    setBusy(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/documents/import/${step.batchId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping: step.mapping }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMessage(
          res.status === 409
            ? 'Esta importação já foi confirmada.'
            : body?.error ?? 'A importação falhou.'
        )
        return
      }
      setStep({
        name: 'done',
        imported: body.data.report.imported,
        errors: body.data.report.errors ?? [],
        filename: step.filename,
      })
    } catch {
      setErrorMessage('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  function downloadErrorReport(): void {
    if (step.name !== 'done') return
    const lines = ['linha;motivo', ...step.errors.map((e) => `${e.line};"${e.reason.replace(/"/g, '""')}"`)]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `erros-importacao-${step.filename.replace(/\.[^.]+$/, '')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!canWrite) {
    return (
      <p className="py-16 text-center text-[13px] text-gray-400">
        Sem permissões para importar documentos.
      </p>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {/* Step indicator */}
      <ol className="flex items-center gap-2 text-[11px] font-semibold">
        {(['Ficheiro', 'Mapeamento', 'Resultado'] as const).map((label, i) => {
          const active =
            (step.name === 'pick' && i === 0) ||
            (step.name === 'mapping' && i === 1) ||
            (step.name === 'done' && i === 2)
          const done =
            (step.name === 'mapping' && i === 0) || (step.name === 'done' && i < 2)
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                  done ? 'bg-green-600 text-white' : active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                )}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={active || done ? 'text-gray-800' : 'text-gray-400'}>{label}</span>
              {i < 2 && <ArrowRight className="h-3 w-3 text-gray-300" />}
            </li>
          )
        })}
      </ol>

      {errorMessage && (
        <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          {errorMessage}
        </p>
      )}

      {/* Step 1 — pick file */}
      {step.name === 'pick' && (
        <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-10">
          <p className="text-center text-[13px] text-gray-500">
            Escolha uma folha CSV ou Excel com os lançamentos.
            <br />
            <span className="text-[11px] text-gray-400">
              Campos mínimos: data, nº documento, NIF, base, taxa de IVA, total.
            </span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={busy}
              aria-label="Cliente dos lançamentos"
              className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-green-400"
            >
              <option value="">Sem cliente associado</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 stroke-[2]" />}
              Escolher ficheiro
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void uploadSheet(file)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {/* Step 2 — confirm mapping */}
      {step.name === 'mapping' && (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-gray-500">
            Confirme como as colunas de <span className="font-semibold text-gray-700">{step.filename}</span> correspondem
            aos campos do Gabify. Nada é importado sem esta confirmação.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(FIELD_LABELS) as Array<keyof Mapping>).map((field) => (
              <label key={field} className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {FIELD_LABELS[field]}
                </span>
                <select
                  value={step.mapping[field]}
                  onChange={(e) =>
                    setStep({ ...step, mapping: { ...step.mapping, [field]: e.target.value } })
                  }
                  className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-400"
                >
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* Sample rows */}
          {step.sample.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {step.sample.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      {headers.map((h) => (
                        <td key={h} className="data px-3 py-1.5 text-gray-600">{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={confirmImport}
              disabled={busy}
              className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 stroke-[2]" />}
              Confirmar e importar
            </button>
            <button
              onClick={() => setStep({ name: 'pick' })}
              disabled={busy}
              className="pressable rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — report */}
      {step.name === 'done' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            <p className="text-[13px] text-green-800">
              <span className="font-bold">{step.imported}</span> lançamento{step.imported !== 1 ? 's' : ''} importado{step.imported !== 1 ? 's' : ''}
              {step.errors.length > 0 && (
                <> · <span className="font-bold text-red-600">{step.errors.length}</span> linha{step.errors.length !== 1 ? 's' : ''} com erro</>
              )}
              . Estão na fila de revisão.
            </p>
          </div>

          {step.errors.length > 0 && (
            <div className="rounded-xl border border-red-100 bg-white">
              <div className="flex items-center justify-between border-b border-red-50 px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                  Linhas não importadas
                </span>
                <button
                  onClick={downloadErrorReport}
                  className="pressable flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700"
                >
                  <Download className="h-3 w-3" />
                  Descarregar relatório
                </button>
              </div>
              <ul className="divide-y divide-red-50">
                {step.errors.map((e) => (
                  <li key={e.line} className="flex items-start gap-2 px-3 py-2 text-[12px]">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                    <span className="data shrink-0 font-bold text-gray-500">linha {e.line}</span>
                    <span className="text-gray-600">{e.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <Link
              href="/review"
              className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700"
            >
              Ir para a fila de revisão
            </Link>
            <button
              onClick={() => setStep({ name: 'pick' })}
              className="pressable flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Importar outra folha
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
