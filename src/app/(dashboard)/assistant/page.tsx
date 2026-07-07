import { MessageCircleQuestion } from 'lucide-react'
import { auth } from '@/lib/auth'
import { can } from '@/server/authz/can'
import { AssistantChat } from '@/components/dashboard/assistant-chat'

/**
 * /assistant — read-only Q&A chat over the office data (pt-PT, mobile-first).
 * Available to every reading role (OWNER/ACCOUNTANT/VIEWER via assistant:query);
 * the API route re-checks the permission on every question.
 */
export default async function AssistantPage() {
  const session = await auth()
  const allowed = can(session?.user?.role, 'assistant:query')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-gray-200 bg-white px-5 py-3">
        <MessageCircleQuestion className="h-4 w-4 stroke-[1.75] text-gray-400" />
        <h1 className="text-[13px] font-semibold text-gray-800">Assistente</h1>
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-gray-500">
          só consulta
        </span>
      </div>
      {allowed ? (
        <AssistantChat />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-gray-50 px-6">
          <p className="text-[13px] text-gray-500">Não tem acesso ao assistente.</p>
        </div>
      )}
    </div>
  )
}
