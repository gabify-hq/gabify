'use client'

import { useState } from 'react'
import { Check, X, Pencil, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from './status-badge'
import type { MockEmail, MockEmailAction } from '@/lib/mock-data'
import { formatDateTime } from '@/lib/mock-data'

interface EmailDetailProps {
  email: MockEmail
  action: MockEmailAction | undefined
}

export function EmailDetail({ email, action }: EmailDetailProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftText, setDraftText] = useState(action?.draftContent ?? '')
  const [actionStatus, setActionStatus] = useState<'idle' | 'approved' | 'rejected'>(
    action?.status === 'APPROVED' ? 'approved' : 'idle'
  )

  const handleApprove = () => {
    // TODO: call POST /api/emails/[id]/actions/[actionId]/approve
    setActionStatus('approved')
    setIsEditing(false)
  }

  const handleReject = () => {
    // TODO: call POST /api/emails/[id]/actions/[actionId]/reject
    setActionStatus('rejected')
    setIsEditing(false)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-200 px-6 py-3">
        <Link
          href="/inbox"
          className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Caixa de entrada
        </Link>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Email original */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-neutral-200">
          <div className="border-b border-neutral-100 px-6 py-4">
            <h1 className="text-[15px] font-semibold text-neutral-900">{email.subject}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-neutral-500">
              <span>
                <span className="font-medium text-neutral-700">{email.fromName}</span>{' '}
                &lt;{email.fromEmail}&gt;
              </span>
              <span>{formatDateTime(email.receivedAt)}</span>
              {email.clientName && (
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-[12px] text-neutral-600">
                  {email.clientName}
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-700">
              {email.bodyText}
            </pre>
          </div>
        </div>

        {/* AI Draft panel */}
        <div className="flex w-[420px] shrink-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-neutral-700">Rascunho AI</span>
              {action && actionStatus === 'idle' && (
                <StatusBadge variant="pending" label="Aguarda aprovação" />
              )}
              {actionStatus === 'approved' && (
                <StatusBadge variant="approved" label="Aprovado" />
              )}
              {actionStatus === 'rejected' && (
                <StatusBadge variant="rejected" label="Rejeitado" />
              )}
            </div>
            {action && actionStatus === 'idle' && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <Pencil className="h-3 w-3" />
                Editar
              </button>
            )}
          </div>

          {!action && (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-neutral-400">Sem rascunho gerado</p>
            </div>
          )}

          {action && (
            <>
              <div className="flex-1 overflow-y-auto p-5">
                {isEditing ? (
                  <Textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    className="h-full min-h-[300px] resize-none font-sans text-sm leading-relaxed text-neutral-700 focus-visible:ring-1"
                    autoFocus
                  />
                ) : (
                  <pre
                    className={cn(
                      'whitespace-pre-wrap font-sans text-sm leading-relaxed',
                      actionStatus === 'approved' && 'text-neutral-400 line-through',
                      actionStatus === 'rejected' && 'text-neutral-400 line-through',
                      actionStatus === 'idle' && 'text-neutral-700'
                    )}
                  >
                    {draftText}
                  </pre>
                )}
              </div>

              {/* AI attribution */}
              <div className="border-t border-neutral-100 px-5 py-2">
                <p className="text-[11px] text-neutral-400">
                  Gerado por {action.aiModel} · {formatDateTime(action.createdAt)}
                </p>
              </div>

              {/* Actions */}
              {actionStatus === 'idle' && (
                <div className="flex gap-2 border-t border-neutral-200 px-5 py-3">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5 bg-green-600 text-white hover:bg-green-700"
                        onClick={handleApprove}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Aprovar e enviar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDraftText(action.draftContent)
                          setIsEditing(false)
                        }}
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5 bg-green-600 text-white hover:bg-green-700"
                        onClick={handleApprove}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        onClick={handleReject}
                      >
                        <X className="h-3.5 w-3.5" />
                        Rejeitar
                      </Button>
                    </>
                  )}
                </div>
              )}

              {actionStatus !== 'idle' && (
                <div className="border-t border-neutral-200 px-5 py-3">
                  <p className="text-center text-sm text-neutral-500">
                    {actionStatus === 'approved' ? 'Email aprovado e enviado.' : 'Rascunho rejeitado.'}
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
