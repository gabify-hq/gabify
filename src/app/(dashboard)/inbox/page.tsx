import { Inbox } from 'lucide-react'
import { EmailList } from '@/components/dashboard/email-list'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { MockEmail, MockEmailAction } from '@/lib/mock-data'

export default async function InboxPage() {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  const rawEmails = officeId
    ? await prisma.inboundEmail.findMany({
        where: { emailAccount: { officeId } },
        include: {
          client: { select: { name: true } },
          actions: {
            select: { id: true, status: true, type: true, draftContent: true, aiModel: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          attachments: { select: { id: true } },
        },
        orderBy: { receivedAt: 'desc' },
        take: 50,
      })
    : []

  // Map real DB rows to the shape EmailList expects
  const emails: MockEmail[] = rawEmails.map((e) => {
    const firstAction = e.actions[0]
    return {
      id: e.id,
      clientId: e.clientId,
      clientName: e.client?.name ?? null,
      fromEmail: e.fromEmail,
      fromName: e.fromName ?? e.fromEmail,
      subject: e.subject ?? '(sem assunto)',
      bodyText: e.bodyText ?? '',
      receivedAt: e.receivedAt,
      status: e.status,
      hasAttachments: e.attachments.length > 0,
      attachmentCount: e.attachments.length,
      hasAction: e.actions.length > 0,
      actionId: firstAction?.id,
    }
  })

  const actions: MockEmailAction[] = rawEmails.flatMap((e) =>
    e.actions.map((a) => ({
      id: a.id,
      emailId: e.id,
      type: a.type as MockEmailAction['type'],
      status: a.status,
      draftContent: a.draftContent ?? '',
      aiModel: a.aiModel ?? 'claude',
      createdAt: a.createdAt,
    })),
  )

  const unread = emails.filter((e) => e.status === 'UNREAD').length
  const pendingCount = actions.filter((a) => a.status === 'PENDING_REVIEW').length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Inbox className="h-4 w-4 stroke-[1.75] text-gray-400" />
          <h1 className="text-[14px] font-bold text-gray-900">Caixa de entrada</h1>
          <span className="data rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
            {emails.length}
          </span>
          {unread > 0 && (
            <span className="data rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
              {unread} não lidos
            </span>
          )}
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-[11px] font-semibold text-amber-700">
              {pendingCount} rascunho{pendingCount > 1 ? 's' : ''} pendente{pendingCount > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Email list or empty state */}
      <div className="flex-1 overflow-y-auto bg-white">
        {emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Inbox className="mb-3 h-8 w-8 stroke-[1] text-gray-300" />
            <p className="text-[13px] font-semibold text-gray-500">Nenhum email recebido ainda.</p>
            <p className="mt-1 text-[12px] text-gray-400">
              Ligue uma conta de email nas{' '}
              <a href="/settings" className="font-medium text-green-600 hover:underline">
                Definições
              </a>
              .
            </p>
          </div>
        ) : (
          <EmailList emails={emails} actions={actions} />
        )}
      </div>
    </div>
  )
}
