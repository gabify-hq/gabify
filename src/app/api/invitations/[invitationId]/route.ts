import { type NextRequest, NextResponse } from 'next/server'
import { guard } from '@/server/authz/guard'
import { revokeInvitation } from '@/server/services/invitation-service'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const gate = await guard('invitation:manage', { denyStatus: 403 })
  if (!gate.ok) return gate.response

  const { invitationId } = await params
  const revoked = await revokeInvitation({
    invitationId,
    officeId: gate.user.officeId,
  })

  if (!revoked) {
    return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
