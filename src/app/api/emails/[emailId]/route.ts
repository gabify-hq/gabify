import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> },
) {
  const gate = await guard('email:read')
  if (!gate.ok) return gate.response

  const { emailId } = await params
  const email = await prisma.inboundEmail.findFirst({
    where: {
      id: emailId,
      emailAccount: { officeId: gate.user.officeId },
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
