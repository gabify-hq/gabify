'use client'

import { useState } from 'react'
import { Check, X, Pencil, ChevronLeft, Paperclip, Download } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from './status-badge'
import { useDashboardStore } from '@/lib/dashboard-store'
import type { MockEmail, MockEmailAction } from '@/lib/mock-data'
import { formatDateTime } from '@/lib/mock-data'

interface EmailAttachment {
  id: string
  filename: string
  mimeType: string
}

interface EmailDetailProps {
  email: MockEmail
  action: MockEmailAction | undefined
  attachments?: EmailAttachment[]
}

export function EmailDetail({ email, action, attachments = [] }: EmailDetailProps) {
  const store = useDashboardStore()
  const persisted = action ? store.getAction(action.id) : undefined
  const currentStatus = persisted?.status ?? action?.status ?? null
  const currentContent = persisted?.editedContent ?? action?.draftContent ?? ''

  const [isEditing, setIsEditing] = useState(false)
  const [draftText, setDraftText] = useState(currentContent)
  const isPending = !currentStatus || currentStatus === 'PENDING_REVIEW'

  const handleApprove = () => {
    if (!action) return
    store.approveAction(action.id, draftText)
    setIsEditing(false)
  }

  const handleReject = () => {
    if (!action) return
    store.rejectAction(action.id)
    setIsEditing(false)
  }

  const handleEditAndSend = () => {
    if (!action) return
    store.editAndSendAction(action.id, draftText)
    setIsEditing(false)
  }

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

      <div className="flex flex-1 overflow-hidden">
        {/* Original email */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-gray-200">
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
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-gray-700">
              {email.bodyText}
            </pre>

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
        <div className="flex w-[400px] shrink-0 flex-col bg-gray-50">
          {/* Draft header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                Rascunho AI
              </span>
              {action && isPending && (
                <StatusBadge variant="pending" label="Aguarda aprovação" />
              )}
              {currentStatus === 'APPROVED' && (
                <StatusBadge variant="approved" label="Aprovado" />
              )}
              {currentStatus === 'EDITED_SENT' && (
                <StatusBadge variant="approved" label="Editado e enviado" />
              )}
              {currentStatus === 'REJECTED' && (
                <StatusBadge variant="rejected" label="Rejeitado" />
              )}
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
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[13px] text-gray-400">Sem rascunho gerado</p>
            </div>
          )}

          {action && (
            <>
              {/* Draft content */}
              <div className="flex-1 overflow-y-auto p-5">
                {isEditing ? (
                  <Textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    className="h-full min-h-[280px] resize-none border-gray-200 bg-white text-[13px] leading-relaxed text-gray-700 placeholder:text-gray-400 focus-visible:ring-1 focus-visible:ring-green-400"
                    autoFocus
                  />
                ) : (
                  <pre className={cn(
                    'whitespace-pre-wrap font-sans text-[13px] leading-relaxed',
                    !isPending ? 'text-gray-300 line-through decoration-gray-200' : 'text-gray-700'
                  )}>
                    {persisted?.editedContent ?? draftText}
                  </pre>
                )}
              </div>

              {/* AI attribution */}
              <div className="border-t border-gray-100 px-5 py-2">
                <p className="data text-[10px] text-gray-400">
                  {action.aiModel} · {formatDateTime(action.createdAt)}
                  {persisted?.decidedAt && (
                    <> · decisão {formatDateTime(new Date(persisted.decidedAt))}</>
                  )}
                </p>
              </div>

              {/* Action buttons */}
              {isPending && (
                <div className="flex gap-2 border-t border-gray-200 bg-white px-5 py-3.5">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleEditAndSend}
                        className="pressable flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700"
                      >
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        Guardar e enviar
                      </button>
                      <button
                        onClick={() => {
                          setDraftText(persisted?.editedContent ?? action.draftContent)
                          setIsEditing(false)
                        }}
                        className="pressable rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleApprove}
                        className="pressable flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-green-700"
                      >
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        Aprovar
                      </button>
                      <button
                        onClick={handleReject}
                        className="pressable flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-100"
                      >
                        <X className="h-3.5 w-3.5 stroke-[2.5]" />
                        Rejeitar
                      </button>
                    </>
                  )}
                </div>
              )}

              {!isPending && (
                <div className="border-t border-gray-200 px-5 py-3">
                  <p className="text-center text-[12px] text-gray-400">
                    {currentStatus === 'APPROVED' && 'Email aprovado e enviado.'}
                    {currentStatus === 'EDITED_SENT' && 'Rascunho editado e enviado.'}
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
