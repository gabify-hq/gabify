import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { can } from '@/server/authz/can'
import { prisma } from '@/lib/prisma'
import { resendInvitation } from '@/server/services/invitation-service'
import { checkRateLimit } from '@/server/rate-limit'

const RESEND_LIMIT = 5
const RESEND_WINDOW_MS = 60 * 60 * 1000 // 5 per hour per invitation (A2 + A11)

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  // clientInvitation:manage is the broader gate (OWNER + ACCOUNTANT); internal
  // invitations additionally require invitation:manage (OWNER only) — fase P1
  const gate = await guard('clientInvitation:manage', { denyStatus: 403 })
  if (!gate.ok) return gate.response

  const { invitationId } = await params
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, officeId: gate.user.officeId },
    select: { role: true },
  })
  if (!invitation) {
    return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  }
  if (invitation.role !== 'CLIENT' && !can(gate.user.role, 'invitation:manage')) {
    return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  }

  const rate = checkRateLimit(`invitation-resend:${invitationId}`, RESEND_LIMIT, RESEND_WINDOW_MS)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Demasiados reenvios — tente mais tarde' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  const result = await resendInvitation({
    invitationId,
    officeId: gate.user.officeId,
  })
  if (!result) {
    return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: { expiresAt: result.invitation.expiresAt } })
}
