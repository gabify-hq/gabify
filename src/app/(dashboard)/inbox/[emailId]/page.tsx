import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EmailDetail } from '@/components/dashboard/email-detail'
import type { EmailDTO, EmailActionDTO } from '@/server/dto'

interface EmailPageProps {
  params: Promise<{ emailId: string }>
}

export default async function EmailPage({ params }: EmailPageProps) {
  const { emailId } = await params

  const session = await auth()
  if (!session?.user?.officeId) notFound()
  const officeId = session.user.officeId

  const raw = await prisma.inboundEmail.findFirst({
    where: {
      id: emailId,
      emailAccount: { officeId },
    },
    include: {
      client: { select: { name: true } },
      attachments: { select: { id: true, filename: true, mimeType: true } },
      actions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          type: true,
          status: true,
          draftContent: true,
          editedContent: true,
          aiModel: true,
          createdAt: true,
        },
      },
    },
  })

  if (!raw) notFound()

  const firstAction = raw.actions[0]

  const email: EmailDTO = {
    id: raw.id,
    clientId: raw.clientId,
    clientName: raw.client?.name ?? null,
    fromEmail: raw.fromEmail,
    fromName: raw.fromName ?? raw.fromEmail,
    subject: raw.subject ?? '(sem assunto)',
    bodyText: raw.bodyText ?? '',
    receivedAt: raw.receivedAt,
    status: raw.status,
    hasAttachments: raw.attachments.length > 0,
    attachmentCount: raw.attachments.length,
    hasAction: raw.actions.length > 0,
    actionId: firstAction?.id,
  }

  const action: EmailActionDTO | undefined = firstAction
    ? {
        id: firstAction.id,
        emailId: raw.id,
        type: firstAction.type as EmailActionDTO['type'],
        status: firstAction.status,
        draftContent: firstAction.draftContent ?? '',
        editedContent: firstAction.editedContent,
        aiModel: firstAction.aiModel ?? 'claude',
        createdAt: firstAction.createdAt,
      }
    : undefined

  const attachments = raw.attachments.map((a) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
  }))

  return <EmailDetail email={email} action={action} attachments={attachments} />
}
