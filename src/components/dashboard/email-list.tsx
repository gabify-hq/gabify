'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EmailDTO, EmailActionDTO } from '@/server/dto'
import { formatRelativeTime } from '@/lib/format'

interface EmailListProps {
  emails: EmailDTO[]
  actions: EmailActionDTO[]
}

interface ResolvedStatus {
  label: string
  pillClass: string
  barClass: string
}

function resolveStatus(
  email: EmailDTO,
  actionStatus: string | null,
): ResolvedStatus | null {
  if (actionStatus === 'PENDING_REVIEW') {
    return {
      label: 'Rascunho pendente',
      pillClass: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
      barClass: 'bg-amber-400',
    }
  }
  if (actionStatus === 'APPROVED' || actionStatus === 'APPROVED_SENT' || actionStatus === 'SENT' || actionStatus === 'EDITED_SENT') {
    return {
      label: 'Enviado',
      pillClass: 'bg-green-50 text-green-700 ring-1 ring-green-200',
      barClass: 'bg-green-500',
    }
  }
  if (actionStatus === 'APPROVED_SEND_FAILED') {
    return {
      label: 'Falha no envio',
      pillClass: 'bg-red-50 text-red-700 ring-1 ring-red-200',
      barClass: 'bg-red-500',
    }
  }
  if (actionStatus === 'REJECTED') {
    return {
      label: 'Rejeitado',
      pillClass: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
      barClass: 'bg-gray-300',
    }
  }
  if (email.status === 'PROCESSED') {
    return {
      label: 'Processado',
      pillClass: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
      barClass: 'bg-gray-300',
    }
  }
  if (email.status === 'UNREAD') {
    return {
      label: '',
      pillClass: '',
      barClass: 'bg-blue-500',
    }
  }
  return null
}

export function EmailList({ emails, actions }: EmailListProps) {
  const pathname = usePathname()
  const emailToAction = new Map(actions.map((a) => [a.emailId, a]))

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-gray-400">Sem emails</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-gray-100">
      {emails.map((email, index) => {
        const action = emailToAction.get(email.id)
        const actionStatus = action?.status ?? null
        const isUnread = email.status === 'UNREAD'
        const isSelected = pathname === `/inbox/${email.id}`
        const status = resolveStatus(email, actionStatus)

        return (
          <Link
            key={email.id}
            href={`/inbox/${email.id}`}
            className={cn(
              'email-row-enter group relative block overflow-hidden transition-colors duration-100',
              isSelected ? 'bg-green-50' : 'hover:bg-gray-50',
            )}
            style={{ animationDelay: `${index * 40}ms` } as React.CSSProperties}
          >
            {/* Left status bar */}
            {status?.barClass && (
              <span
                className={cn(
                  'absolute left-0 top-0 bottom-0 w-[3px]',
                  status.barClass,
                )}
              />
            )}

            <div className="px-5 py-4">
              {/* Row 1: subject — the hero */}
              <div className="flex items-start justify-between gap-4">
                <p
                  className={cn(
                    'flex-1 text-[14px] leading-snug',
                    isUnread
                      ? 'font-bold text-gray-900'
                      : 'font-medium text-gray-400',
                  )}
                >
                  {email.subject}
                </p>
                <div className="flex shrink-0 items-center gap-2 pt-0.5">
                  {email.hasAttachments && (
                    <span className="flex items-center gap-1 text-gray-400">
                      <Paperclip className="h-3 w-3 stroke-[1.5]" />
                      <span className="data text-[10px]">{email.attachmentCount}</span>
                    </span>
                  )}
                  <time className="data text-[11px] text-gray-400">
                    {formatRelativeTime(email.receivedAt)}
                  </time>
                </div>
              </div>

              {/* Row 2: sender */}
              <p
                className={cn(
                  'mt-1 text-[13px]',
                  isUnread ? 'font-medium text-gray-600' : 'text-gray-400',
                )}
              >
                {email.fromName}
              </p>

              {/* Row 3: client chip + status pill */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {email.clientName ? (
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                    {email.clientName}
                  </span>
                ) : (
                  <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-medium text-orange-600 ring-1 ring-orange-100">
                    Sem cliente
                  </span>
                )}

                {status?.label && (
                  <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', status.pillClass)}>
                    {status.label}
                  </span>
                )}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
