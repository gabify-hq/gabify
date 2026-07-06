import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { retrySend } from '@/server/services/draft-review-service'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> },
) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  if (session.user.role === 'VIEWER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { emailId } = await params
  const result = await retrySend({
    emailId,
    officeId: session.user.officeId,
    userId: session.user.id,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, currentStatus: result.currentStatus ?? null },
      { status: result.httpStatus },
    )
  }
  return NextResponse.json({ success: true, data: { status: result.status } })
}
