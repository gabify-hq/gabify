'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Pencil, ChevronLeft, Paperclip, Download, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from './status-badge'
import type { EmailDTO, EmailActionDTO } from '@/server/dto'
import { formatDateTime } from '@/lib/format'

interface EmailAttachment {
  id: string
  filename: string
  mimeType: string
}

interface EmailDetailProps {
  email: EmailDTO
  action: EmailActionDTO | undefined
  attachments?: EmailAttachment[]
}

type PendingOperation = 'approve' | 'reject' | 'retry' | null

/**
 * Draft review panel. All decisions go through the server APIs — state lives in
 * the database (EmailReview + AuditLog), never in browser storage.
 */
export function EmailDetail({ email, action, attachments = [] }: EmailDetailProps) {
  const router = useRouter()
  const currentStatus = action?.status ?? null
  const currentContent = action?.editedContent ?? action?.draftContent ?? ''

  const [isEditing, setIsEditing] = useState(false)
  const [draftText, setDraftText] = useState(currentContent)
  const [pendingOp, setPendingOp] = useState<PendingOperation>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isPending = currentStatus === 'PENDING_REVIEW'
  const isSendFailed = currentStatus === 'APPROVED_SEND_FAILED'
  const isSent = currentStatus === 'APPROVED_SENT' || currentStatus === 'SENT' || currentStatus === 'EDITED_SENT' || currentStatus === 'APPROVED'

  async function callDecisionApi(op: Exclude<PendingOperation, null>, body?: unknown): Promise<void> {
    if (!action) return
    setPendingOp(op)
    setErrorMessage(null)
    try {
      const url =
        op === 'retry'
          ? `/api/emails/${email.id}/draft/retry-send`
          : `/api/emails/${email.id}/actions/${action.id}/${op}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMessage(data?.error ?? 'Ocorreu um erro. Tente novamente.')
      }
      router.refresh()
    } catch {
      setErrorMessage('Sem ligação ao servidor. Tente novamente.')
    } finally {
      setPendingOp(null)
      setIsEditing(false)
    }
  }

  const handleApprove = () => callDecisionApi('approve')
  const handleReject = () => callDecisionApi('reject')
  const handleRetry = () => callDecisionApi('retry')
  const handleEditAndSend = () => callDecisionApi('approve', { editedBody: draftText })

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-2.5">
        <Link
          href="/inbox"
          className="pressable flex items-center gap-1 text-[12px] font-medium text-gray-400 transition-colors hover:text-gray-700"
        >
          <ChevronLeft className="h-3.5 w-3.5 stroke-2" />
          Caixa de entrada
        </Link>
      </div>

      {/* Mobile-first: stacked panes; side-by-side from lg upwards */}
      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* Original email */}
        <div className="flex flex-col border-b border-gray-200 lg:flex-1 lg:overflow-hidden lg:border-b-0 lg:border-r">
          {/* Email header */}
          <div className="border-b border-gray-100 px-6 py-5">
            <h1 className="text-[15px] font-bold text-gray-900 leading-snug">
              {email.subject}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[12px] text-gray-600">
                <span className="font-semibold text-gray-800">{email.fromName}</span>
                {' '}
                <span className="data text-gray-400">&lt;{email.fromEmail}&gt;</span>
              </span>
              <span className="data text-[11px] text-gray-400">
                {formatDateTime(email.receivedAt)}
              </span>
              {email.clientName && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                  {email.clientName}
                </span>
              )}
            </div>
          </div>

          {/* Email body */}
          <div className="px-6 py-5 lg:flex-1 lg:overflow-y-auto">
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-gray-700">
              {email.bodyText}
            </pre>

            {/* Google Drive link warning — Gmail sometimes replaces large attachments with Drive links. */}
            {attachments.length === 0 && email.bodyText && /drive\.google\.com\/file/i.test(email.bodyText) && (
              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 stroke-[1.75] text-amber-500" />
                <p className="text-[12px] text-amber-700">
                  O Gmail substituiu o anexo por um link do Google Drive. O Gabify não consegue processar ficheiros partilhados desta forma — o ficheiro tem de ser enviado como anexo directamente no email.
                </p>
              </div>
            )}

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="mt-5 border-t border-gray-100 pt-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Anexos ({attachments.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-gray-400" />
                      <span className="truncate text-[12px] text-gray-700">{att.filename}</span>
                      <span className="shrink-0 text-[10px] text-gray-400">{att.mimeType}</span>
                      <button
                        className="ml-auto shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
                        title="Descarregar"
                        aria-label={`Descarregar ${att.filename}`}
                        onClick={async () => {
                          const res = await fetch(`/api/attachments/${att.id}`)
                          if (!res.ok) return
                          const { data } = await res.json()
                          window.open(data.url, '_blank')
                        }}
                      >
                        <Download className="h-3.5 w-3.5 stroke-[1.5]" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI draft panel */}
        <div className="flex w-full shrink-0 flex-col bg-gray-50 lg:w-[400px]">
          {/* Draft header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                Rascunho AI
              </span>
              {isPending && <StatusBadge variant="pending" label="Aguarda aprovação" />}
              {isSent && <StatusBadge variant="approved" label="Aprovado e enviado" />}
              {isSendFailed && <StatusBadge variant="rejected" label="Falha no envio" />}
              {currentStatus === 'REJECTED' && <StatusBadge variant="rejected" label="Rejeitado" />}
            </div>
            {action && isPending && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="pressable flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
              >
                <Pencil className="h-3 w-3 stroke-[1.75]" />
                Editar
              </button>
            )}
          </div>

          {!action && (
            <div className="flex flex-1 items-center justify-center py-16">
              <p className="text-[13px] text-gray-400">Sem rascunho gerado</p>
            </div>
          )}

          {action && (
            <>
              {/* Draft content */}
              <div className="p-5 lg:flex-1 lg:overflow-y-auto">
                {isEditing ? (
                  <Textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    className="h-full min-h-[280px] resize-none border-gray-200 bg-white text-[13px] leading-relaxed text-gray-700 placeholder:text-gray-400 focus-visible:ring-1 focus-visible:ring-green-400"
                    autoFocus
                    disabled={pendingOp !== null}
                  />
                ) : (
                  <pre className={cn(
                    'whitespace-pre-wrap font-sans text-[13px] leading-relaxed',
                    currentStatus === 'REJECTED' ? 'text-gray-300 line-through decoration-gray-200' : 'text-gray-700'
                  )}>
                    {currentContent}
                  </pre>
                )}
              </div>

              {/* AI attribution */}
              <div className="border-t border-gray-100 px-5 py-2">
                <p className="data text-[10px] text-gray-400">
                  {action.aiModel} · {formatDateTime(action.createdAt)}
                </p>
              </div>

              {/* Error state */}
              {errorMessage && (
                <div className="border-t border-red-100 bg-red-50 px-5 py-2.5">
                  <p className="text-[12px] text-red-600">{errorMessage}</p>
                </div>
              )}

              {/* Action buttons */}
              {isPending && (
                <div className="flex gap-2 border-t border-gray-200 bg-white px-5 py-3.5">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleEditAndSend}
                        disabled={pendingOp !== null || draftText.trim() === ''}
                        className="pressable flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
                      >
                        {pendingOp === 'approve' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        )}
                        Guardar e enviar
                      </button>
                      <button
                        onClick={() => {
                          setDraftText(currentContent)
                          setIsEditing(false)
                        }}
                        disabled={pendingOp !== null}
                        className="pressable rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleApprove}
                        disabled={pendingOp !== null}
                        className="pressable flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
                      >
                        {pendingOp === 'approve' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        )}
                        Aprovar
                      </button>
                      <button
                        onClick={handleReject}
                        disabled={pendingOp !== null}
                        className="pressable flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                      >
                        {pendingOp === 'reject' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5 stroke-[2.5]" />
                        )}
                        Rejeitar
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Send failed: retry */}
              {isSendFailed && (
                <div className="flex flex-col gap-2 border-t border-gray-200 bg-white px-5 py-3.5">
                  <p className="text-[12px] text-red-600">
                    A resposta foi aprovada mas o envio falhou.
                  </p>
                  <button
                    onClick={handleRetry}
                    disabled={pendingOp !== null}
                    className="pressable flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    {pendingOp === 'retry' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 stroke-[2]" />
                    )}
                    Tentar enviar novamente
                  </button>
                </div>
              )}

              {(isSent || currentStatus === 'REJECTED') && (
                <div className="border-t border-gray-200 px-5 py-3">
                  <p className="text-center text-[12px] text-gray-400">
                    {isSent && 'Email aprovado e enviado.'}
                    {currentStatus === 'REJECTED' && 'Rascunho rejeitado.'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
