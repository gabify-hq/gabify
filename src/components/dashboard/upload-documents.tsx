'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Camera, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClientOptionDTO } from '@/server/dto'

interface UploadDocumentsProps {
  clients: ClientOptionDTO[]
}

interface FileResult {
  filename: string
  ok: boolean
  error?: string
}

/**
 * Manual document upload (S2.1) — mobile-first: drag&drop on desktop,
 * direct camera capture on mobile. Per-file progress and error states.
 */
export function UploadDocuments({ clients }: UploadDocumentsProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [clientId, setClientId] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [results, setResults] = useState<FileResult[]>([])

  async function uploadFiles(files: FileList | File[]): Promise<void> {
    const list = Array.from(files)
    if (list.length === 0) return
    setIsUploading(true)
    setResults([])
    try {
      const form = new FormData()
      for (const file of list) form.append('files', file)
      if (clientId) form.append('clientId', clientId)

      const res = await fetch('/api/documents/upload', { method: 'POST', body: form })
      const body = await res.json().catch(() => null)

      if (!res.ok && !body?.data) {
        setResults(list.map((f) => ({ filename: f.name, ok: false, error: body?.error ?? 'Erro no carregamento' })))
        return
      }
      const created: Array<{ filename: string }> = body?.data?.created ?? []
      const errors: Array<{ filename: string; error: string }> = body?.data?.errors ?? []
      setResults([
        ...created.map((c) => ({ filename: c.filename, ok: true })),
        ...errors.map((e) => ({ filename: e.filename, ok: false, error: e.error })),
      ])
      router.refresh()
    } catch {
      setResults(list.map((f) => ({ filename: f.name, ok: false, error: 'Sem ligação ao servidor' })))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          void uploadFiles(e.dataTransfer.files)
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors sm:flex-row sm:justify-between sm:py-3 sm:text-left',
          isDragging ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'
        )}
      >
        <p className="text-[12px] text-gray-500">
          Arraste ficheiros para aqui (PDF, JPG, PNG, XML, ZIP — máx. 25MB)
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={isUploading}
            aria-label="Cliente dos documentos"
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            <option value="">Por classificar</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="pressable flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 stroke-[2]" />}
            Carregar
          </button>
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={isUploading}
            className="pressable flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-600 transition-colors hover:border-gray-300 sm:hidden"
          >
            <Camera className="h-3.5 w-3.5 stroke-[2]" />
            Fotografar
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.xml,.zip"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((r, i) => (
            <li
              key={`${r.filename}-${i}`}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px]',
                r.ok ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-700'
              )}
            >
              {r.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{r.filename}</span>
              {!r.ok && <span className="ml-auto shrink-0">{r.error}</span>}
              {r.ok && <span className="ml-auto shrink-0">em processamento</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
