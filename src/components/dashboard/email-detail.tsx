'use client'

import { useState } from 'react'
import { Check, X, Pencil, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from './status-badge'
import { useDashboardStore } from '@/lib/dashboard-store'
import type { MockEmail, MockEmailAction } from '@/lib/mock-data'
import { formatDateTime } from '@/lib/mock-data'

interface EmailDetailProps {
  email: MockEmail
  action: MockEmailAction | undefined
}

export function EmailDetail({ email, action }: EmailDetailProps) {
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
    <div className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-2.5">
        <Link
          href="/inbox"
          className="pressable flex items-center gap-1 text-[12px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ChevronLeft className="h-3.5 w-3.5 stroke-[1.5]" />
          Caixa de entrada
        </Link>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Original email */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-zinc-800">
          {/* Email header */}
          <div className="border-b border-zinc-800/60 px-6 py-4">
            <h1 className="text-[14px] font-semibold text-zinc-100 leading-snug">
              {email.subject}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[12px] text-zinc-400">
                <span className="text-zinc-200">{email.fromName}</span>
                {' '}
                <span className="data text-zinc-600">&lt;{email.fromEmail}&gt;</span>
              </span>
              <span className="data text-[11px] text-zinc-600">
                {formatDateTime(email.receivedAt)}
              </span>
              {email.clientName && (
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                  {email.clientName}
                </span>
              )}
            </div>
          </div>

          {/* Email body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-zinc-300">
              {email.bodyText}
            </pre>
          </div>
        </div>

        {/* AI draft panel */}
        <div className="flex w-[400px] shrink-0 flex-col bg-zinc-900/50">
          {/* Draft header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wide">
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
                className="pressable flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                <Pencil className="h-3 w-3 stroke-[1.5]" />
                Editar
              </button>
            )}
          </div>

          {!action && (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[13px] text-zinc-600">Sem rascunho gerado</p>
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
                    className="h-full min-h-[280px] resize-none border-zinc-700 bg-zinc-900 text-[13px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-600"
                    autoFocus
                  />
                ) : (
                  <pre className={cn(
                    'whitespace-pre-wrap font-sans text-[13px] leading-relaxed',
                    !isPending ? 'text-zinc-600 line-through decoration-zinc-700' : 'text-zinc-300'
                  )}>
                    {persisted?.editedContent ?? draftText}
                  </pre>
                )}
              </div>

              {/* AI attribution */}
              <div className="border-t border-zinc-800/60 px-5 py-2">
                <p className="data text-[10px] text-zinc-700">
                  {action.aiModel} · {formatDateTime(action.createdAt)}
                  {persisted?.decidedAt && (
                    <> · decisão {formatDateTime(new Date(persisted.decidedAt))}</>
                  )}
                </p>
              </div>

              {/* Action buttons */}
              {isPending && (
                <div className="flex gap-2 border-t border-zinc-800 px-5 py-3">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleEditAndSend}
                        className="pressable flex flex-1 items-center justify-center gap-1.5 rounded bg-green-600 px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-green-500"
                      >
                        <Check className="h-3.5 w-3.5 stroke-[2]" />
                        Guardar e enviar
                      </button>
                      <button
                        onClick={() => {
                          setDraftText(persisted?.editedContent ?? action.draftContent)
                          setIsEditing(false)
                        }}
                        className="pressable rounded border border-zinc-700 px-3 py-2 text-[12px] font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleApprove}
                        className="pressable flex flex-1 items-center justify-center gap-1.5 rounded bg-green-600 px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-green-500"
                      >
                        <Check className="h-3.5 w-3.5 stroke-[2]" />
                        Aprovar
                      </button>
                      <button
                        onClick={handleReject}
                        className="pressable flex items-center gap-1.5 rounded border border-zinc-700 px-3 py-2 text-[12px] font-medium text-red-500 transition-colors hover:border-red-500/30 hover:bg-red-500/5"
                      >
                        <X className="h-3.5 w-3.5 stroke-[2]" />
                        Rejeitar
                      </button>
                    </>
                  )}
                </div>
              )}

              {!isPending && (
                <div className="border-t border-zinc-800 px-5 py-3">
                  <p className="text-center text-[12px] text-zinc-600">
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
