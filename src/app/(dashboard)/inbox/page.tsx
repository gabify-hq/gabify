import { Inbox } from 'lucide-react'
import { EmailList } from '@/components/dashboard/email-list'
import { MOCK_EMAILS, MOCK_EMAIL_ACTIONS, getPendingActions } from '@/lib/mock-data'

export default function InboxPage() {
  const pendingActions = getPendingActions()
  const unread = MOCK_EMAILS.filter((e) => e.status === 'UNREAD').length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Inbox className="h-4 w-4 stroke-[1.5] text-zinc-500" />
          <h1 className="text-[13px] font-semibold text-zinc-200">Caixa de entrada</h1>
          <span className="data rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500">
            {MOCK_EMAILS.length}
          </span>
          {unread > 0 && (
            <span className="data rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-blue-400">
              {unread} não lidos
            </span>
          )}
        </div>
        {pendingActions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="text-[11px] font-medium text-amber-400">
              {pendingActions.length} rascunho{pendingActions.length > 1 ? 's' : ''} pendente{pendingActions.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Email list */}
      <div className="flex-1 overflow-y-auto">
        <EmailList emails={MOCK_EMAILS} actions={MOCK_EMAIL_ACTIONS} />
      </div>
    </div>
  )
}
