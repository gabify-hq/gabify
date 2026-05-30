import { Inbox } from 'lucide-react'
import { EmailList } from '@/components/dashboard/email-list'
import { MOCK_EMAILS, MOCK_EMAIL_ACTIONS, getPendingActions } from '@/lib/mock-data'

export default function InboxPage() {
  const pendingActions = getPendingActions()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <Inbox className="h-4 w-4 text-neutral-500" />
          <h1 className="text-[15px] font-semibold text-neutral-900">Caixa de entrada</h1>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[12px] font-medium text-neutral-600">
            {MOCK_EMAILS.length}
          </span>
        </div>
        {pendingActions.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-[10px] font-bold text-white">
              {pendingActions.length}
            </span>
            <span className="text-[12px] font-medium text-yellow-700">
              rascunho{pendingActions.length > 1 ? 's' : ''} aguarda{pendingActions.length === 1 ? '' : 'm'} aprovação
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
