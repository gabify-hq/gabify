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
  const emailToAction = new Map(actions.map((a) => [a.emailId, a]))

  return (
    <div className="flex flex-col">
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
              'pressable relative flex flex-col gap-1.5 border-b border-zinc-800/60 px-4 py-3',
              isSelected
                ? 'bg-zinc-800/80'
                : 'hover:bg-zinc-800/40',
            )}
          >
            {/* Left status bar */}
            <span
              className={cn(
                'absolute left-0 top-2 bottom-2 w-0.5 rounded-r transition-opacity duration-150',
                isUnread && !actionStatus ? 'bg-blue-500' : '',
                hasPendingDraft ? 'bg-amber-400' : '',
                actionStatus === 'APPROVED' || actionStatus === 'EDITED_SENT' ? 'bg-green-500' : '',
                actionStatus === 'REJECTED' ? 'bg-zinc-600' : '',
                !isUnread && !actionStatus ? 'opacity-0' : '',
              )}
            />

            {/* Row 1: name + time */}
            <div className="flex items-center justify-between gap-3">
              <span className={cn(
                'truncate text-[13px]',
                isUnread ? 'font-semibold text-zinc-100' : 'font-medium text-zinc-400'
              )}>
                {email.fromName}
              </span>
              <span className="data shrink-0 text-[11px] text-zinc-600">
                {formatRelativeTime(email.receivedAt)}
              </span>
            </div>

            {/* Row 2: subject */}
            <p className={cn(
              'truncate text-[12px]',
              isUnread ? 'text-zinc-300' : 'text-zinc-600'
            )}>
              {email.subject}
            </p>

            {/* Row 3: meta */}
            <div className="flex flex-wrap items-center gap-2">
              {email.clientName ? (
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                  {email.clientName}
                </span>
              ) : (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                  Sem cliente
                </span>
              )}

              {hasPendingDraft && (
                <StatusBadge variant="pending" label="Rascunho pendente" />
              )}
              {actionStatus === 'APPROVED' && (
                <StatusBadge variant="approved" label="Aprovado" />
              )}
              {actionStatus === 'EDITED_SENT' && (
                <StatusBadge variant="approved" label="Enviado" />
              )}
              {actionStatus === 'REJECTED' && (
                <StatusBadge variant="rejected" label="Rejeitado" />
              )}
              {email.status === 'PROCESSED' && !action && (
                <StatusBadge variant="approved" label="Processado" />
              )}
              {email.hasAttachments && (
                <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                  <Paperclip className="h-3 w-3" />
                  <span className="data">{email.attachmentCount}</span>
                </span>
              )}
            </div>
          </Link>
        )
      })}

      {emails.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-[13px] text-zinc-600">Sem emails</p>
        </div>
      )}
    </div>
  )
}
