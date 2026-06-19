'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Loader2, X, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Client {
  id: string
  name: string
}

interface AssociateSenderDialogProps {
  fromEmail: string
  emailCount: number
  clients: Client[]
}

export function AssociateSenderDialog({
  fromEmail,
  emailCount,
  clients,
}: AssociateSenderDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ emailsMatched: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function openDialog() {
    setSelectedClientId(clients[0]?.id ?? '')
    setResult(null)
    setError(null)
    setOpen(true)
  }

  function closeDialog() {
    if (isPending) return
    setOpen(false)
  }

  function handleConfirm() {
    if (!selectedClientId) return

    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/emails/associate-sender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEmail, clientId: selectedClientId }),
      })

      const data = await res.json() as {
        success?: boolean
        data?: { emailsMatched: number }
        error?: string
      }

      if (!res.ok) {
        setError(data.error ?? 'Erro inesperado. Tente novamente.')
        return
      }

      setResult(data.data ?? { emailsMatched: 0 })
      router.refresh()

      // Auto-close after 1.5s so user sees the success message
      setTimeout(() => setOpen(false), 1500)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        aria-label={`Associar ${fromEmail} a um cliente`}
      >
        <UserPlus className="h-3 w-3 stroke-[1.75]" aria-hidden="true" />
        Associar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="associate-dialog-title"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDialog}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2
                id="associate-dialog-title"
                className="text-[14px] font-bold text-gray-900"
              >
                Identificar remetente
              </h2>
              <button
                type="button"
                onClick={closeDialog}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Fechar"
              >
                <X className="h-4 w-4 stroke-[1.75]" />
              </button>
            </div>

            <div className="px-5 py-4">
              {/* Sender info */}
              <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Remetente
                </p>
                <p className="mt-0.5 text-[13px] font-semibold text-gray-900">
                  {fromEmail}
                </p>
                <p className="text-[11px] text-gray-500">
                  {emailCount} email{emailCount !== 1 ? 's' : ''} por associar
                </p>
              </div>

              {result ? (
                /* Success state */
                <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                  <p className="text-[12px] font-semibold text-green-800">
                    {result.emailsMatched} email{result.emailsMatched !== 1 ? 's' : ''} associado{result.emailsMatched !== 1 ? 's' : ''}
                  </p>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <p className="text-[12px] text-red-700" role="alert">{error}</p>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="associate-client-select"
                      className="mb-1.5 block text-[12px] font-semibold text-slate-700"
                    >
                      Associar a cliente
                    </label>
                    <select
                      id="associate-client-select"
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      disabled={isPending}
                      className={cn(
                        'w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-slate-900',
                        'focus:border-green-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20',
                        'disabled:opacity-50'
                      )}
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {!result && (
              <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={isPending}
                  className="h-8 cursor-pointer rounded-lg px-3 text-[12px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isPending || !selectedClientId}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-green-600 px-4 text-[12px] font-bold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      A associar...
                    </>
                  ) : (
                    'Confirmar'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
