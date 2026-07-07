'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Upload, Loader2, CheckCircle2, AlertCircle, ChevronLeft, Download, ArrowRight, Copy,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Bank statement import wizard (fase C3) — same 3-step pattern as the
 * document import (S2.4): file → human-confirmed column mapping → report.
 * Re-importing an already-imported file offers an explicit "force" path.
 */

type BankMapping = {
  bookingDate: string
  description: string
  amount?: string
  debit?: string
  credit?: string
  valueDate?: string
  balance?: string
  externalRef?: string
}

const REQUIRED_FIELDS = ['bookingDate', 'description'] as const
const OPTIONAL_FIELDS = ['amount', 'debit', 'credit', 'valueDate', 'balance', 'externalRef'] as const
type MappingField = (typeof REQUIRED_FIELDS)[number] | (typeof OPTIONAL_FIELDS)[number]

const FIELD_LABELS: Record<MappingField, string> = {
  bookingDate: 'Data do movimento',
  description: 'Descrição',
  amount: 'Montante (com sinal)',
  debit: 'Débito',
  credit: 'Crédito',
  valueDate: 'Data-valor',
  balance: 'Saldo',
  externalRef: 'Referência',
}

interface ReportLine {
  line: number
  reason: string
}

interface AccountOption {
  id: string
  name: string
  clientName: string
}

type Step =
  | { name: 'pick' }
  | {
      name: 'mapping'
      importId: string
      mapping: Partial<Record<MappingField, string>>
      mappingSource: 'heuristic' | 'ai'
      sample: Array<Record<string, string>>
      headers: string[]
      filename: string
    }
  | {
      name: 'done'
      imported: number
      skipped: ReportLine[]
      errors: ReportLine[]
      filename: string
    }

export function BankImportWizard({ canWrite }: { canWrite: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null)
  const [accountId, setAccountId] = useState('')
  const [step, setStep] = useState<Step>({ name: 'pick' })
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [forceOffer, setForceOffer] = useState<File | null>(null)

  useEffect(() => {
    fetch('/api/bank/accounts?limit=200')
      .then(async (res) => (res.ok ? (await res.json()).data.items : []))
      .then((items: AccountOption[]) => setAccounts(items))
      .catch(() => setAccounts([]))
  }, [])

  async function uploadStatement(file: File, force: boolean): Promise<void> {
    setBusy(true)
    setErrorMessage(null)
    setForceOffer(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('bankAccountId', accountId)
      if (force) form.append('force', 'true')
      const res = await fetch('/api/bank/imports', { method: 'POST', body: form })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        if (res.status === 409 && body?.canForce) {
          setForceOffer(file)
          setErrorMessage('Este ficheiro já foi importado para esta conta.')
        } else {
          setErrorMessage(body?.error ?? 'Não foi possível ler o extrato.')
        }
        return
      }
      setStep({
        name: 'mapping',
        importId: body.data.importId,
        mapping: body.data.proposedMapping,
        mappingSource: body.data.mappingSource,
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
      const mapping = Object.fromEntries(
        Object.entries(step.mapping).filter(([, v]) => v !== undefined && v !== '')
      )
      const res = await fetch(`/api/bank/imports/${step.importId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping }),
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
        imported: body.data.imported,
        skipped: body.data.skippedDuplicates ?? [],
        errors: body.data.errors ?? [],
        filename: step.filename,
      })
    } catch {
      setErrorMessage('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  function downloadReport(): void {
    if (step.name !== 'done') return
    const lines = [
      'tipo;linha;motivo',
      ...step.skipped.map((e) => `duplicado;${e.line};"${e.reason.replace(/"/g, '""')}"`),
      ...step.errors.map((e) => `erro;${e.line};"${e.reason.replace(/"/g, '""')}"`),
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-extrato-${step.filename.replace(/\.[^.]+$/, '')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!canWrite) {
    return (
      <p className="py-16 text-center text-[13px] text-gray-400">
        Sem permissões para importar extratos.
      </p>
    )
  }

  const headers = step.name === 'mapping' ? step.headers : []
  const missingAmount =
    step.name === 'mapping' &&
    !step.mapping.amount && !step.mapping.debit && !step.mapping.credit

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {/* Step indicator */}
      <ol className="flex items-center gap-2 text-[11px] font-semibold">
        {(['Ficheiro', 'Mapeamento', 'Resultado'] as const).map((label, i) => {
          const active =
            (step.name === 'pick' && i === 0) ||
            (step.name === 'mapping' && i === 1) ||
            (step.name === 'done' && i === 2)
          const done = (step.name === 'mapping' && i === 0) || (step.name === 'done' && i < 2)
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
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          {errorMessage}
          {forceOffer && (
            <button
              onClick={() => void uploadStatement(forceOffer, true)}
              disabled={busy}
              className="pressable flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Copy className="h-3 w-3" />
              Forçar reimportação (duplicados são ignorados)
            </button>
          )}
        </div>
      )}

      {/* Step 1 — account + file */}
      {step.name === 'pick' && (
        <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-10">
          <p className="text-center text-[13px] text-gray-500">
            Escolha a conta e o extrato bancário (CSV ou Excel, máx. 10MB).
            <br />
            <span className="text-[11px] text-gray-400">
              As colunas são detetadas automaticamente — confirma antes de importar.
            </span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={busy || accounts === null}
              aria-label="Conta bancária"
              className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-green-400"
            >
              <option value="">
                {accounts === null ? 'A carregar contas…' : 'Escolher conta…'}
              </option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.clientName} — {a.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || accountId === ''}
              className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 stroke-[2]" />}
              Escolher ficheiro
            </button>
          </div>
          {accounts !== null && accounts.length === 0 && (
            <p className="text-[12px] text-gray-400">
              Sem contas bancárias —{' '}
              <Link href="/bank" className="font-semibold underline hover:text-gray-600">
                crie uma conta primeiro
              </Link>
              .
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void uploadStatement(file, false)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {/* Step 2 — confirm mapping */}
      {step.name === 'mapping' && (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-gray-500">
            Confirme como as colunas de <span className="font-semibold text-gray-700">{step.filename}</span>{' '}
            correspondem aos campos do extrato. Nada é importado sem esta confirmação.
            {step.mappingSource === 'ai' && (
              <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                proposto por IA
              </span>
            )}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map((field) => (
              <label key={field} className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {FIELD_LABELS[field]}
                  {(REQUIRED_FIELDS as readonly string[]).includes(field) && ' *'}
                </span>
                <select
                  value={step.mapping[field] ?? ''}
                  onChange={(e) =>
                    setStep({
                      ...step,
                      mapping: { ...step.mapping, [field]: e.target.value || undefined },
                    })
                  }
                  className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-400"
                >
                  <option value="">—</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {missingAmount && (
            <p className="text-[12px] text-amber-700">
              Indique a coluna de montante — ou as colunas de débito/crédito separadas.
            </p>
          )}

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
              disabled={busy || missingAmount || !step.mapping.bookingDate || !step.mapping.description}
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
              <span className="font-bold">{step.imported}</span> movimento{step.imported !== 1 ? 's' : ''} importado{step.imported !== 1 ? 's' : ''}
              {step.skipped.length > 0 && (
                <> · <span className="font-bold">{step.skipped.length}</span> duplicado{step.skipped.length !== 1 ? 's' : ''} ignorado{step.skipped.length !== 1 ? 's' : ''}</>
              )}
              {step.errors.length > 0 && (
                <> · <span className="font-bold text-red-600">{step.errors.length}</span> linha{step.errors.length !== 1 ? 's' : ''} com erro</>
              )}
              . As sugestões de conciliação já foram calculadas.
            </p>
          </div>

          {(step.errors.length > 0 || step.skipped.length > 0) && (
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Linhas não importadas
                </span>
                <button
                  onClick={downloadReport}
                  className="pressable flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700"
                >
                  <Download className="h-3 w-3" />
                  Descarregar relatório
                </button>
              </div>
              <ul className="divide-y divide-gray-50">
                {step.skipped.map((e) => (
                  <li key={`s-${e.line}`} className="flex items-start gap-2 px-3 py-2 text-[12px]">
                    <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="data shrink-0 font-bold text-gray-500">linha {e.line}</span>
                    <span className="text-gray-600">{e.reason}</span>
                  </li>
                ))}
                {step.errors.map((e) => (
                  <li key={`e-${e.line}`} className="flex items-start gap-2 px-3 py-2 text-[12px]">
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
              href="/bank"
              className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700"
            >
              Ir para a conciliação
            </Link>
            <button
              onClick={() => setStep({ name: 'pick' })}
              className="pressable flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Importar outro extrato
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
