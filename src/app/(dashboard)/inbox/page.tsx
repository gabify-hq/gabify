import { Inbox, AlertCircle } from 'lucide-react'
import { EmailList } from '@/components/dashboard/email-list'
import { AssociateSenderDialog } from '@/components/dashboard/associate-sender-dialog'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { MockEmail, MockEmailAction } from '@/lib/mock-data'

export default async function InboxPage() {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  const [rawEmails, unknownSenders, clients] = await Promise.all([
    officeId
      ? prisma.inboundEmail.findMany({
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
      : Promise.resolve([]),

    officeId
      ? prisma.inboundEmail.groupBy({
          by: ['fromEmail'],
          where: { emailAccount: { officeId }, clientId: null },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 20,
        })
      : Promise.resolve([]),

    officeId
      ? prisma.client.findMany({
          where: { officeId, deletedAt: null },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

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

      <div className="flex-1 overflow-y-auto bg-white">
        {/* Unknown senders banner */}
        {unknownSenders.length > 0 && clients.length > 0 && (
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-[12px] font-bold text-amber-800">
                {unknownSenders.length} remetente{unknownSenders.length !== 1 ? 's' : ''} por identificar
              </p>
            </div>
            <div className="space-y-1.5">
              {unknownSenders.map((sender) => (
                <div
                  key={sender.fromEmail}
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-gray-900">
                      {sender.fromEmail}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {sender._count.id} email{sender._count.id !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <AssociateSenderDialog
                    fromEmail={sender.fromEmail}
                    emailCount={sender._count.id}
                    clients={clients}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unknown senders exist but no clients yet */}
        {unknownSenders.length > 0 && clients.length === 0 && (
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-[12px] font-semibold text-amber-800">
                {unknownSenders.length} remetente{unknownSenders.length !== 1 ? 's' : ''} por identificar —{' '}
                <a href="/clients" className="underline hover:text-amber-900">
                  crie clientes primeiro
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Email list or empty state */}
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
