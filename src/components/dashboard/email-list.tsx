'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBadge } from './status-badge'
import { useDashboardStore } from '@/lib/dashboard-store'
import type { MockEmail, MockEmailAction } from '@/lib/mock-data'
import { formatRelativeTime } from '@/lib/mock-data'

interface EmailListProps {
  emails: MockEmail[]
  actions: MockEmailAction[]
}

export function EmailList({ emails, actions }: EmailListProps) {
  const pathname = usePathname()
  const store = useDashboardStore()

  // Map emailId → actionId for quick lookup
  const emailToAction = new Map(actions.map((a) => [a.emailId, a]))

  return (
    <div className="flex flex-col divide-y divide-neutral-100">
      {emails.map((email) => {
        const action = emailToAction.get(email.id)
        const persisted = action ? store.getAction(action.id) : undefined
        const actionStatus = persisted?.status ?? action?.status ?? null
        const hasPendingDraft = actionStatus === 'PENDING_REVIEW'

        const isSelected = pathname === `/inbox/${email.id}`
        const isUnread = email.status === 'UNREAD'

        return (
          <Link
            key={email.id}
            href={`/inbox/${email.id}`}
            className={cn(
              'flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-neutral-50',
              isSelected && 'bg-blue-50 hover:bg-blue-50',
              isUnread && !isSelected && 'bg-white'
            )}
          >
            {/* Row 1: from + time */}
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'truncate text-sm',
                  isUnread ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-600'
                )}
              >
                {email.fromName}
              </span>
              <span className="shrink-0 text-[11px] text-neutral-400">
                {formatRelativeTime(email.receivedAt)}
              </span>
            </div>

            {/* Row 2: subject */}
            <p className={cn('truncate text-sm', isUnread ? 'text-neutral-800' : 'text-neutral-500')}>
              {email.subject}
            </p>

            {/* Row 3: badges */}
            <div className="flex flex-wrap items-center gap-1.5">
              {email.clientName ? (
                <span className="truncate rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
                  {email.clientName}
                </span>
              ) : (
                <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] text-orange-600">
                  Sem cliente
                </span>
              )}
              {hasPendingDraft && <StatusBadge variant="pending" label="Rascunho pendente" />}
              {actionStatus === 'APPROVED' && <StatusBadge variant="approved" label="Aprovado" />}
              {actionStatus === 'EDITED_SENT' && <StatusBadge variant="approved" label="Enviado" />}
              {actionStatus === 'REJECTED' && <StatusBadge variant="rejected" label="Rejeitado" />}
              {email.status === 'PROCESSED' && !action && (
                <StatusBadge variant="approved" label="Processado" />
              )}
              {email.hasAttachments && (
                <span className="flex items-center gap-0.5 text-[11px] text-neutral-400">
                  <Paperclip className="h-3 w-3" />
                  {email.attachmentCount}
                </span>
              )}
            </div>
          </Link>
        )
      })}

      {emails.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-sm text-neutral-500">Sem emails</p>
        </div>
      )}
    </div>
  )
}
