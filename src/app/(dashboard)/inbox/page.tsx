import { Inbox } from 'lucide-react'
import { EmailList } from '@/components/dashboard/email-list'
import { MOCK_EMAILS, MOCK_EMAIL_ACTIONS, getPendingActions } from '@/lib/mock-data'

export default function InboxPage() {
  const pendingActions = getPendingActions()
  const unread = MOCK_EMAILS.filter((e) => e.status === 'UNREAD').length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Inbox className="h-4 w-4 stroke-[1.75] text-gray-400" />
          <h1 className="text-[14px] font-bold text-gray-900">Caixa de entrada</h1>
          <span className="data rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
            {MOCK_EMAILS.length}
          </span>
          {unread > 0 && (
            <span className="data rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
              {unread} não lidos
            </span>
          )}
        </div>
        {pendingActions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-[11px] font-semibold text-amber-700">
              {pendingActions.length} rascunho{pendingActions.length > 1 ? 's' : ''} pendente{pendingActions.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Email list */}
      <div className="flex-1 overflow-y-auto bg-white">
        <EmailList emails={MOCK_EMAILS} actions={MOCK_EMAIL_ACTIONS} />
      </div>
    </div>
  )
}
