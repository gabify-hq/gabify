import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { resendInvitation } from '@/server/services/invitation-service'
import { checkRateLimit } from '@/server/rate-limit'

const RESEND_LIMIT = 5
const RESEND_WINDOW_MS = 60 * 60 * 1000 // 5 per hour per invitation (A2 + A11)

export async function POST(
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

  const rate = checkRateLimit(`invitation-resend:${invitationId}`, RESEND_LIMIT, RESEND_WINDOW_MS)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Demasiados reenvios — tente mais tarde' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  const result = await resendInvitation({
    invitationId,
    officeId: session.user.officeId,
  })
  if (!result) {
    return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: { expiresAt: result.invitation.expiresAt } })
}
