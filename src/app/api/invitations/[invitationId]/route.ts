import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { can } from '@/server/authz/can'
import { prisma } from '@/lib/prisma'
import { revokeInvitation } from '@/server/services/invitation-service'

export async function DELETE(
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
    // Identifiable resource the caller may not manage — 404, never reveal
    return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  }

  const revoked = await revokeInvitation({
    invitationId,
    officeId: gate.user.officeId,
  })

  if (!revoked) {
    return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
