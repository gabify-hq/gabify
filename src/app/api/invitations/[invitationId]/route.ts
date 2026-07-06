import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { revokeInvitation } from '@/server/services/invitation-service'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { invitationId } = await params
  const revoked = await revokeInvitation({
    invitationId,
    officeId: session.user.officeId,
  })

  if (!revoked) {
    return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
