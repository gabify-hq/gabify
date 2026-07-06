import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> },
) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { emailId } = await params
  const email = await prisma.inboundEmail.findFirst({
    where: {
      id: emailId,
      emailAccount: { officeId: session.user.officeId },
    },
    select: {
      id: true,
      subject: true,
      fromEmail: true,
      fromName: true,
      receivedAt: true,
      status: true,
      clientId: true,
      actions: {
        select: {
          id: true,
          type: true,
          status: true,
          draftContent: true,
          editedContent: true,
          sentAt: true,
          sendAttempts: true,
          sendError: true,
          createdAt: true,
        },
      },
    },
  })

  if (!email) {
    return NextResponse.json({ error: 'Email não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ success: true, data: email })
}
