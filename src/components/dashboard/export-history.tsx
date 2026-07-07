'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { StatusPill } from './status-badge'

export interface ExportBatchDTO {
  id: string
  status: string // PENDING | COMPLETED | FAILED
  periodLabel: string
  clientsLabel: string
  documentCount: number
  createdAt: string // DD/MM/YYYY HH:mm
}

const REFRESH_WHILE_PENDING_MS = 5000

interface ExportHistoryProps {
  batches: ExportBatchDTO[]
}

/** Export history with live status and per-batch signed-URL download (F1.3). */
export function ExportHistory({ batches }: ExportHistoryProps) {
  const router = useRouter()
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasPending = batches.some((b) => b.status === 'PENDING')
  useEffect(() => {
    if (!hasPending) return
    const timer = setInterval(() => router.refresh(), REFRESH_WHILE_PENDING_MS)
    return () => clearInterval(timer)
  }, [hasPending, router])

  async function download(batchId: string) {
    setDownloading(batchId)
    setError(null)
    try {
      const res = await fetch(`/api/exports/${batchId}/download`)
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.data?.url) {
        setError('Não foi possível gerar o link de download. Tente novamente.')
        return
      }
      window.open(body.data.url, '_blank')
    } catch {
      setError('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="section-label">Histórico de exportações</span>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="pressable flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="h-3 w-3 stroke-[2]" />
          Atualizar
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          {error}
        </p>
      )}

      {batches.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center shadow-sm">
          <p className="text-[13px] font-semibold text-gray-500">Ainda não há exportações.</p>
          <p className="mt-1 text-[12px] text-gray-400">
            Escolha o período acima e carregue em Exportar.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {batches.map((batch) => (
            <li
              key={batch.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm"
            >
              <span className="data text-[11px] text-gray-400">{batch.createdAt}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-gray-700">
                {batch.periodLabel} · {batch.clientsLabel}
              </span>
              <span className="data text-[11px] text-gray-400">
                {batch.documentCount} doc{batch.documentCount !== 1 ? 's' : ''}
              </span>
              {batch.status === 'COMPLETED' && <StatusPill variant="approved" label="Concluído" />}
              {batch.status === 'PENDING' && <StatusPill variant="processing" label="Em curso" />}
              {batch.status === 'FAILED' && <StatusPill variant="rejected" label="Falhou" />}
              {batch.status === 'COMPLETED' && (
                <button
                  type="button"
                  onClick={() => download(batch.id)}
                  disabled={downloading === batch.id}
                  className="pressable flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {downloading === batch.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3 stroke-[2]" />
                  )}
                  Descarregar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
